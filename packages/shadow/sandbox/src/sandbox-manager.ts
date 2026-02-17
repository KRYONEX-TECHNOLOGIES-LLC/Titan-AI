// Shadow Sandbox Manager
// packages/shadow/sandbox/src/sandbox-manager.ts

import { EventEmitter } from 'events';
import {
  SandboxConfig,
  SandboxType,
  SandboxState,
  SandboxProvider,
  ExecutionRequest,
  ExecutionResult,
} from './types';
import { DockerSandbox } from './docker-sandbox';
import { WasmSandbox } from './wasm-sandbox';
import { KataSandbox } from './kata-sandbox';

export interface SandboxManagerConfig {
  defaultType: SandboxType;
  maxConcurrent: number;
  cleanupOnExit: boolean;
  healthCheckInterval: number;
}

export class SandboxManager extends EventEmitter {
  private config: SandboxManagerConfig;
  private providers: Map<SandboxType, SandboxProvider> = new Map();
  private sandboxes: Map<string, { config: SandboxConfig; provider: SandboxProvider }> = new Map();

  constructor(config: Partial<SandboxManagerConfig> = {}) {
    super();
    this.config = {
      defaultType: 'docker',
      maxConcurrent: 10,
      cleanupOnExit: true,
      healthCheckInterval: 30000,
      ...config,
    };

    this.initializeProviders();
    this.setupCleanup();
    this.startHealthCheck();
  }

  private initializeProviders(): void {
    this.providers.set('docker', new DockerSandbox());
    this.providers.set('wasm', new WasmSandbox());
    this.providers.set('kata', new KataSandbox());
  }

  private setupCleanup(): void {
    if (this.config.cleanupOnExit) {
      process.on('exit', () => this.destroyAll());
      process.on('SIGINT', () => {
        this.destroyAll().then(() => process.exit());
      });
      process.on('SIGTERM', () => {
        this.destroyAll().then(() => process.exit());
      });
    }
  }

  private startHealthCheck(): void {
    setInterval(async () => {
      for (const [id, { provider }] of this.sandboxes) {
        try {
          const state = await provider.getState(id);
          if (state.status === 'error') {
            this.emit('sandbox:error', { id, error: state.lastError });
          }
        } catch (error) {
          this.emit('sandbox:healthCheckFailed', { id, error });
        }
      }
    }, this.config.healthCheckInterval);
  }

  async getAvailableProviders(): Promise<SandboxType[]> {
    const available: SandboxType[] = [];

    for (const [type, provider] of this.providers) {
      if (await provider.isAvailable()) {
        available.push(type);
      }
    }

    return available;
  }

  async create(config: Partial<SandboxConfig>): Promise<string> {
    const currentCount = this.sandboxes.size;
    if (currentCount >= this.config.maxConcurrent) {
      throw new Error(`Max concurrent sandboxes (${this.config.maxConcurrent}) reached`);
    }

    const type = config.type || this.config.defaultType;
    const provider = this.providers.get(type);

    if (!provider) {
      throw new Error(`Unknown sandbox type: ${type}`);
    }

    if (!(await provider.isAvailable())) {
      throw new Error(`Sandbox provider ${type} is not available`);
    }

    const fullConfig: SandboxConfig = {
      type,
      id: config.id || this.generateId(),
      name: config.name || `sandbox-${Date.now()}`,
      resources: config.resources || {
        cpuCores: 1,
        memoryMb: 512,
        diskMb: 1024,
        pids: 100,
      },
      network: config.network || {
        enabled: false,
      },
      mounts: config.mounts || [],
      env: config.env || {},
      timeout: config.timeout || 60000,
      capabilities: config.capabilities || [],
    };

    const sandboxId = await provider.create(fullConfig);
    this.sandboxes.set(sandboxId, { config: fullConfig, provider });

    this.emit('sandbox:created', { id: sandboxId, config: fullConfig });
    return sandboxId;
  }

  async start(id: string): Promise<void> {
    const sandbox = this.sandboxes.get(id);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${id}`);
    }

    await sandbox.provider.start(id);
    this.emit('sandbox:started', { id });
  }

  async stop(id: string): Promise<void> {
    const sandbox = this.sandboxes.get(id);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${id}`);
    }

    await sandbox.provider.stop(id);
    this.emit('sandbox:stopped', { id });
  }

  async destroy(id: string): Promise<void> {
    const sandbox = this.sandboxes.get(id);
    if (!sandbox) {
      return;
    }

    await sandbox.provider.destroy(id);
    this.sandboxes.delete(id);
    this.emit('sandbox:destroyed', { id });
  }

  async destroyAll(): Promise<void> {
    const ids = Array.from(this.sandboxes.keys());
    await Promise.all(ids.map(id => this.destroy(id).catch(() => {})));
  }

  async execute(id: string, request: ExecutionRequest): Promise<ExecutionResult> {
    const sandbox = this.sandboxes.get(id);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${id}`);
    }

    this.emit('sandbox:executeStart', { id, command: request.command });

    try {
      const result = await sandbox.provider.execute(id, request);
      this.emit('sandbox:executeComplete', { id, result });
      return result;
    } catch (error) {
      this.emit('sandbox:executeError', { id, error });
      throw error;
    }
  }

  async getState(id: string): Promise<SandboxState> {
    const sandbox = this.sandboxes.get(id);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${id}`);
    }

    return sandbox.provider.getState(id);
  }

  getAllStates(): Promise<Map<string, SandboxState>> {
    const promises = Array.from(this.sandboxes.entries()).map(async ([id, { provider }]) => {
      const state = await provider.getState(id);
      return [id, state] as [string, SandboxState];
    });

    return Promise.all(promises).then(entries => new Map(entries));
  }

  getSandboxConfig(id: string): SandboxConfig | undefined {
    return this.sandboxes.get(id)?.config;
  }

  getStats(): SandboxManagerStats {
    return {
      totalSandboxes: this.sandboxes.size,
      maxConcurrent: this.config.maxConcurrent,
      byType: this.countByType(),
    };
  }

  private countByType(): Record<SandboxType, number> {
    const counts: Record<string, number> = {};
    for (const { config } of this.sandboxes.values()) {
      counts[config.type] = (counts[config.type] || 0) + 1;
    }
    return counts as Record<SandboxType, number>;
  }

  private generateId(): string {
    return `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export interface SandboxManagerStats {
  totalSandboxes: number;
  maxConcurrent: number;
  byType: Record<SandboxType, number>;
}
