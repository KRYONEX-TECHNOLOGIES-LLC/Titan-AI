/**
 * Workspace Manager
 *
 * Manages workspace folders and file system operations
 */

import { EventEmitter } from 'events';
import type { WorkspaceFolder, FileSystemWatcher } from './types';

export interface WorkspaceManagerConfig {
  excludePatterns?: string[];
}

export interface FileInfo {
  uri: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  mtime?: number;
}

export class WorkspaceManager extends EventEmitter {
  private folders: WorkspaceFolder[] = [];
  private watchers: Map<string, FileSystemWatcher> = new Map();
  private config: WorkspaceManagerConfig;

  constructor(config: WorkspaceManagerConfig = {}) {
    super();
    this.config = {
      excludePatterns: config.excludePatterns ?? [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
      ],
    };
  }

  /**
   * Add a workspace folder
   */
  addFolder(uri: string, name?: string): WorkspaceFolder {
    const folder: WorkspaceFolder = {
      uri,
      name: name ?? this.extractFolderName(uri),
      index: this.folders.length,
    };

    this.folders.push(folder);
    this.emit('workspaceFolderAdded', folder);
    return folder;
  }

  /**
   * Remove a workspace folder
   */
  removeFolder(uri: string): boolean {
    const index = this.folders.findIndex((f) => f.uri === uri);
    if (index === -1) return false;

    const [folder] = this.folders.splice(index, 1);
    
    // Reindex remaining folders
    for (let i = index; i < this.folders.length; i++) {
      this.folders[i].index = i;
    }

    this.emit('workspaceFolderRemoved', folder);
    return true;
  }

  /**
   * Get all workspace folders
   */
  getFolders(): WorkspaceFolder[] {
    return [...this.folders];
  }

  /**
   * Get workspace folder by URI
   */
  getFolder(uri: string): WorkspaceFolder | undefined {
    return this.folders.find((f) => f.uri === uri);
  }

  /**
   * Get workspace folder containing a file
   */
  getFolderContaining(fileUri: string): WorkspaceFolder | undefined {
    return this.folders.find((f) => fileUri.startsWith(f.uri));
  }

  /**
   * Create a file system watcher
   */
  createWatcher(
    globPattern: string,
    options: Partial<FileSystemWatcher> = {}
  ): string {
    const watcherId = `watcher-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const watcher: FileSystemWatcher = {
      globPattern,
      ignoreCreate: options.ignoreCreate ?? false,
      ignoreChange: options.ignoreChange ?? false,
      ignoreDelete: options.ignoreDelete ?? false,
    };

    this.watchers.set(watcherId, watcher);
    this.emit('watcherCreated', watcherId, watcher);
    return watcherId;
  }

  /**
   * Dispose a watcher
   */
  disposeWatcher(watcherId: string): boolean {
    if (!this.watchers.has(watcherId)) return false;
    this.watchers.delete(watcherId);
    this.emit('watcherDisposed', watcherId);
    return true;
  }

  /**
   * Notify of file changes
   */
  notifyFileChange(uri: string, type: 'create' | 'change' | 'delete'): void {
    for (const [id, watcher] of this.watchers) {
      if (this.matchesPattern(uri, watcher.globPattern)) {
        if (
          (type === 'create' && !watcher.ignoreCreate) ||
          (type === 'change' && !watcher.ignoreChange) ||
          (type === 'delete' && !watcher.ignoreDelete)
        ) {
          this.emit('fileChange', { uri, type, watcherId: id });
        }
      }
    }
  }

  /**
   * Check if URI matches glob pattern
   */
  private matchesPattern(uri: string, pattern: string): boolean {
    // Simple glob matching - in production, use a proper glob library
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');

    return new RegExp(regexPattern).test(uri);
  }

  /**
   * Check if path should be excluded
   */
  isExcluded(uri: string): boolean {
    return (this.config.excludePatterns ?? []).some((pattern) =>
      this.matchesPattern(uri, pattern)
    );
  }

  /**
   * Extract folder name from URI
   */
  private extractFolderName(uri: string): string {
    const parts = uri.split('/');
    return parts[parts.length - 1] || parts[parts.length - 2] || 'workspace';
  }

  /**
   * Get relative path from workspace
   */
  getRelativePath(fileUri: string): string | undefined {
    const folder = this.getFolderContaining(fileUri);
    if (!folder) return undefined;
    return fileUri.slice(folder.uri.length + 1);
  }

  /**
   * Resolve path relative to workspace
   */
  resolvePath(relativePath: string, folderIndex = 0): string | undefined {
    const folder = this.folders[folderIndex];
    if (!folder) return undefined;
    return `${folder.uri}/${relativePath}`;
  }

  /**
   * Clear all folders and watchers
   */
  clear(): void {
    this.folders = [];
    this.watchers.clear();
    this.emit('cleared');
  }
}
