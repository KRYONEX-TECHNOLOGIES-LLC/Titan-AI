/**
 * Extension Host
 *
 * Manages extension lifecycle
 */

import { EventEmitter } from 'events';
import type {
  Extension,
  ExtensionManifest,
  ExtensionContext,
  ExtensionAPI,
  Disposable,
} from './types';

export interface ExtensionHostConfig {
  extensionsPath: string;
  builtinExtensionsPath?: string;
}

export class ExtensionHost extends EventEmitter {
  private extensions = new Map<string, Extension>();
  private activatedExtensions = new Set<string>();
  private config: ExtensionHostConfig;

  constructor(config: ExtensionHostConfig) {
    super();
    this.config = config;
  }

  /**
   * Load extensions from manifest
   */
  async loadExtension(manifest: ExtensionManifest, extensionPath: string): Promise<Extension> {
    const id = `${manifest.publisher}.${manifest.name}`;

    if (this.extensions.has(id)) {
      throw new Error(`Extension ${id} is already loaded`);
    }

    const extension: Extension = {
      id,
      extensionPath,
      isActive: false,
      packageJSON: manifest,
      exports: undefined,
      activate: async () => {
        return this.activateExtension(id);
      },
    };

    this.extensions.set(id, extension);
    this.emit('extensionLoaded', extension);

    return extension;
  }

  /**
   * Activate an extension
   */
  async activateExtension(id: string): Promise<unknown> {
    const extension = this.extensions.get(id);
    if (!extension) {
      throw new Error(`Extension ${id} not found`);
    }

    if (extension.isActive) {
      return extension.exports;
    }

    this.emit('extensionActivating', id);

    try {
      // Create extension context
      const context = this.createExtensionContext(extension);

      // Load and activate the extension module
      const modulePath = `${extension.extensionPath}/${extension.packageJSON.main}`;
      const extensionModule: ExtensionAPI = await import(modulePath);

      // Call activate
      const exports = await extensionModule.activate(context);

      // Update extension state
      (extension as { isActive: boolean }).isActive = true;
      (extension as { exports: unknown }).exports = exports;
      this.activatedExtensions.add(id);

      this.emit('extensionActivated', id, exports);
      return exports;
    } catch (error) {
      this.emit('extensionActivationFailed', id, error);
      throw error;
    }
  }

  /**
   * Deactivate an extension
   */
  async deactivateExtension(id: string): Promise<void> {
    const extension = this.extensions.get(id);
    if (!extension || !extension.isActive) {
      return;
    }

    this.emit('extensionDeactivating', id);

    try {
      // Load the extension module
      const modulePath = `${extension.extensionPath}/${extension.packageJSON.main}`;
      const extensionModule: ExtensionAPI = await import(modulePath);

      // Call deactivate if available
      if (extensionModule.deactivate) {
        await extensionModule.deactivate();
      }

      // Update extension state
      (extension as { isActive: boolean }).isActive = false;
      this.activatedExtensions.delete(id);

      this.emit('extensionDeactivated', id);
    } catch (error) {
      this.emit('extensionDeactivationFailed', id, error);
      throw error;
    }
  }

  /**
   * Create extension context
   */
  private createExtensionContext(extension: Extension): ExtensionContext {
    const subscriptions: Disposable[] = [];

    return {
      extensionPath: extension.extensionPath,
      extensionUri: `file://${extension.extensionPath}`,
      globalState: this.createMemento(`global:${extension.id}`),
      workspaceState: this.createMemento(`workspace:${extension.id}`),
      secrets: this.createSecretStorage(extension.id),
      subscriptions,
    };
  }

  /**
   * Create a memento for state storage
   */
  private createMemento(prefix: string) {
    const storage = new Map<string, unknown>();

    return {
      get<T>(key: string, defaultValue?: T): T | undefined {
        const value = storage.get(`${prefix}:${key}`);
        return (value as T) ?? defaultValue;
      },
      async update(key: string, value: unknown): Promise<void> {
        storage.set(`${prefix}:${key}`, value);
      },
      keys(): readonly string[] {
        return Array.from(storage.keys())
          .filter((k) => k.startsWith(prefix))
          .map((k) => k.slice(prefix.length + 1));
      },
    };
  }

  /**
   * Create secret storage
   */
  private createSecretStorage(extensionId: string) {
    const secrets = new Map<string, string>();

    return {
      async get(key: string): Promise<string | undefined> {
        return secrets.get(`${extensionId}:${key}`);
      },
      async store(key: string, value: string): Promise<void> {
        secrets.set(`${extensionId}:${key}`, value);
      },
      async delete(key: string): Promise<void> {
        secrets.delete(`${extensionId}:${key}`);
      },
    };
  }

  /**
   * Get extension by ID
   */
  getExtension(id: string): Extension | undefined {
    return this.extensions.get(id);
  }

  /**
   * Get all extensions
   */
  getAllExtensions(): Extension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * Get active extensions
   */
  getActiveExtensions(): Extension[] {
    return Array.from(this.extensions.values()).filter((e) => e.isActive);
  }

  /**
   * Check if extension is active
   */
  isActive(id: string): boolean {
    return this.activatedExtensions.has(id);
  }

  /**
   * Handle activation event
   */
  async handleActivationEvent(event: string): Promise<void> {
    for (const extension of this.extensions.values()) {
      if (extension.isActive) continue;

      const events = extension.packageJSON.activationEvents;
      if (events.includes(event) || events.includes('*')) {
        await this.activateExtension(extension.id);
      }
    }
  }

  /**
   * Dispose all extensions
   */
  async dispose(): Promise<void> {
    for (const id of this.activatedExtensions) {
      await this.deactivateExtension(id);
    }
    this.extensions.clear();
  }
}
