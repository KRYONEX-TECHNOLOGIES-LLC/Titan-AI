// Kata Containers Sandbox Implementation
// packages/shadow/sandbox/src/kata-sandbox.ts

import { spawn, ChildProcess } from 'child_process';
import {
  SandboxProvider,
  SandboxConfig,
  SandboxState,
  SandboxStatus,
  ExecutionRequest,
  ExecutionResult,
} from './types';

interface KataInstance {
  id: string;
  config: SandboxConfig;
  status: SandboxStatus;
  createdAt: number;
  startedAt?: number;
  stoppedAt?: number;
  vmId?: string;
  process?: ChildProcess;
  lastError?: string;
}

export class KataSandbox implements SandboxProvider {
  readonly type = 'kata' as const;
  private instances: Map<string, KataInstance> = new Map();
  private kataRuntime: string = 'kata-runtime';
  private available: boolean | null = null;

  async isAvailable(): Promise<boolean> {
    if (this.available !== null) {
      return this.available;
    }

    // Check if kata-runtime is installed
    return new Promise((resolve) => {
      const check = spawn('which', [this.kataRuntime]);
      check.on('close', (code) => {
        this.available = code === 0;
        resolve(this.available);
      });
      check.on('error', () => {
        this.available = false;
        resolve(false);
      });
    });
  }

  async create(config: SandboxConfig): Promise<string> {
    if (!(await this.isAvailable())) {
      throw new Error('Kata Containers runtime is not available');
    }

    const instance: KataInstance = {
      id: config.id,
      config,
      status: 'created',
      createdAt: Date.now(),
    };

    // Generate unique VM ID
    instance.vmId = `kata-${config.id}-${Date.now()}`;

    // Kata uses a different approach - it's an OCI runtime
    // In production, you'd use containerd or CRI-O with Kata as the runtime
    // This is a simplified implementation

    this.instances.set(config.id, instance);
    return config.id;
  }

  async start(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Kata instance not found: ${id}`);
    }

    instance.status = 'starting';

    try {
      // In real implementation, this would start a Kata VM through containerd
      // For now, we simulate the VM startup
      await this.startKataVM(instance);
      instance.status = 'running';
      instance.startedAt = Date.now();
    } catch (error) {
      instance.status = 'error';
      instance.lastError = (error as Error).message;
      throw error;
    }
  }

  private async startKataVM(instance: KataInstance): Promise<void> {
    // This would use kata-runtime or containerd shim
    // Placeholder implementation
    return new Promise((resolve) => {
      setTimeout(resolve, 100); // Simulate VM startup
    });
  }

  async stop(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Kata instance not found: ${id}`);
    }

    instance.status = 'stopping';

    if (instance.process) {
      instance.process.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          instance.process?.kill('SIGKILL');
          resolve();
        }, 10000);

        instance.process!.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    instance.status = 'stopped';
    instance.stoppedAt = Date.now();
  }

  async destroy(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) return;

    if (instance.status === 'running') {
      await this.stop(id);
    }

    // Cleanup VM resources
    this.instances.delete(id);
  }

  async execute(id: string, request: ExecutionRequest): Promise<ExecutionResult> {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Kata instance not found: ${id}`);
    }

    if (instance.status !== 'running') {
      throw new Error(`Kata instance not running: ${id}`);
    }

    const startTime = Date.now();

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      // In real implementation, this would exec into the Kata VM
      // Using kata-runtime exec or via CRI-O/containerd
      const proc = spawn(request.command[0], request.command.slice(1), {
        cwd: request.workdir,
        env: { ...process.env, ...instance.config.env, ...request.env },
      });

      const timeoutId = request.timeout
        ? setTimeout(() => {
            killed = true;
            proc.kill('SIGKILL');
          }, request.timeout)
        : null;

      if (request.stdin) {
        proc.stdin.write(request.stdin);
        proc.stdin.end();
      }

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve({
          exitCode: code ?? -1,
          stdout,
          stderr,
          duration: Date.now() - startTime,
          killed,
        });
      });

      proc.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve({
          exitCode: -1,
          stdout,
          stderr: stderr + '\n' + error.message,
          duration: Date.now() - startTime,
          killed: false,
        });
      });
    });
  }

  async getState(id: string): Promise<SandboxState> {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Kata instance not found: ${id}`);
    }

    return {
      id,
      type: 'kata',
      status: instance.status,
      createdAt: instance.createdAt,
      startedAt: instance.startedAt,
      stoppedAt: instance.stoppedAt,
      lastError: instance.lastError,
      resourceUsage: {
        cpuPercent: 0,
        memoryMb: instance.config.resources.memoryMb,
        diskMb: 0,
        networkRxBytes: 0,
        networkTxBytes: 0,
      },
    };
  }

  setRuntimePath(path: string): void {
    this.kataRuntime = path;
    this.available = null; // Reset availability check
  }
}
