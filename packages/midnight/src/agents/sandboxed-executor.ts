/**
 * Project Midnight - Sandboxed Tool Executor
 * Executes Actor tool calls in isolated sandboxes (Kata/Docker/Native fallback)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import type { ToolExecutor } from './actor.js';

// Import sandbox types (these will be resolved when the package is built)
export interface SandboxProvider {
  readonly type: 'kata' | 'docker' | 'wasm' | 'process';
  create(config: SandboxConfig): Promise<string>;
  start(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  destroy(id: string): Promise<void>;
  execute(id: string, request: ExecutionRequest): Promise<ExecutionResult>;
  isAvailable(): Promise<boolean>;
}

export interface SandboxConfig {
  type: 'kata' | 'docker' | 'wasm' | 'process';
  id: string;
  name: string;
  resources: {
    cpuCores: number;
    memoryMb: number;
    diskMb: number;
    pids: number;
  };
  network: {
    enabled: boolean;
    allowedHosts?: string[];
  };
  mounts: Array<{
    hostPath: string;
    containerPath: string;
    readOnly: boolean;
  }>;
  env: Record<string, string>;
  timeout: number;
  capabilities: string[];
}

export interface ExecutionRequest {
  command: string[];
  workdir?: string;
  env?: Record<string, string>;
  stdin?: string;
  timeout?: number;
}

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  killed: boolean;
}

export interface SandboxedExecutorConfig {
  workspacePath: string;
  sandboxType: 'kata' | 'docker' | 'native' | 'auto';
  timeout: number;
  env?: Record<string, string>;
}

/**
 * Sandboxed Tool Executor
 * Executes tools in isolated environments with automatic fallback
 */
export class SandboxedToolExecutor implements ToolExecutor {
  private config: SandboxedExecutorConfig;
  private sandbox: SandboxProvider | null = null;
  private sandboxId: string | null = null;
  private initialized = false;

  constructor(config: SandboxedExecutorConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Initialize the sandbox (lazy initialization)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.sandboxType === 'native') {
      // Native mode - no sandbox
      this.initialized = true;
      return;
    }

    // Try to initialize sandbox providers in order
    const providers = await this.getAvailableProviders();

    if (this.config.sandboxType === 'auto') {
      // Auto mode - try Kata first, then Docker, then native
      for (const provider of providers) {
        if (await provider.isAvailable()) {
          this.sandbox = provider;
          break;
        }
      }
    } else {
      // Specific sandbox type requested
      const provider = providers.find(p => p.type === this.config.sandboxType);
      if (provider && await provider.isAvailable()) {
        this.sandbox = provider;
      }
    }

    if (this.sandbox) {
      // Create and start sandbox instance
      const sandboxConfig = this.createSandboxConfig();
      this.sandboxId = await this.sandbox.create(sandboxConfig);
      await this.sandbox.start(this.sandboxId);
    }

    this.initialized = true;
  }

  /**
   * Get available sandbox providers
   */
  private async getAvailableProviders(): Promise<SandboxProvider[]> {
    const providers: SandboxProvider[] = [];

    try {
      // Try to dynamically import the shadow package
      const { KataSandbox } = await import('@titan/shadow/sandbox');
      providers.push(new KataSandbox());
    } catch {
      // KataSandbox not available
    }

    try {
      const { DockerSandbox } = await import('@titan/shadow/sandbox');
      providers.push(new DockerSandbox());
    } catch {
      // DockerSandbox not available
    }

    return providers;
  }

  /**
   * Create sandbox configuration
   */
  private createSandboxConfig(): SandboxConfig {
    return {
      type: (this.sandbox?.type ?? 'docker') as SandboxConfig['type'],
      id: `midnight-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: 'midnight-actor-sandbox',
      resources: {
        cpuCores: 2,
        memoryMb: 4096,
        diskMb: 10240,
        pids: 100,
      },
      network: {
        enabled: true,
        allowedHosts: ['*'],
      },
      mounts: [
        {
          hostPath: this.config.workspacePath,
          containerPath: '/workspace',
          readOnly: false,
        },
      ],
      env: {
        HOME: '/home/titan',
        PATH: '/usr/local/bin:/usr/bin:/bin',
        ...this.config.env,
      },
      timeout: this.config.timeout,
      capabilities: [],
    };
  }

  /**
   * Execute a tool call
   */
  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    await this.initialize();

    switch (name) {
      case 'read_file':
        return this.readFile(args.path as string);

      case 'write_file':
        return this.writeFile(args.path as string, args.content as string);

      case 'run_command':
        return this.runCommand(args.command as string, args.cwd as string | undefined);

      case 'run_tests':
        return this.runTests(args.pattern as string | undefined);

      case 'git_diff':
        return this.gitDiff(args.staged as boolean | undefined);

      case 'git_commit':
        return this.gitCommit(args.message as string, args.files as string[] | undefined);

      case 'task_complete':
        return this.taskComplete(args.summary as string);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Read a file
   */
  private async readFile(filePath: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      return content;
    } catch (error) {
      return `Error reading file: ${error}`;
    }
  }

  /**
   * Write a file
   */
  private async writeFile(filePath: string, content: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
      return `Successfully wrote to ${filePath}`;
    } catch (error) {
      return `Error writing file: ${error}`;
    }
  }

  /**
   * Run a command (in sandbox if available)
   */
  private async runCommand(command: string, cwd?: string): Promise<string> {
    const workdir = cwd 
      ? this.resolvePath(cwd) 
      : this.config.workspacePath;

    if (this.sandbox && this.sandboxId) {
      // Run in sandbox
      const result = await this.sandbox.execute(this.sandboxId, {
        command: ['sh', '-c', command],
        workdir: '/workspace' + (cwd ? `/${cwd}` : ''),
        timeout: this.config.timeout,
      });

      return this.formatExecutionResult(result);
    }

    // Run natively (development fallback)
    return this.runCommandNative(command, workdir);
  }

  /**
   * Run command natively (no sandbox)
   */
  private async runCommandNative(command: string, workdir: string): Promise<string> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let killed = false;

      const proc = spawn('sh', ['-c', command], {
        cwd: workdir,
        env: { ...process.env, ...this.config.env },
      });

      const timeout = setTimeout(() => {
        killed = true;
        proc.kill('SIGKILL');
      }, this.config.timeout);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve(this.formatExecutionResult({
          exitCode: code ?? -1,
          stdout,
          stderr,
          duration: Date.now() - startTime,
          killed,
        }));
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        resolve(`Error: ${error.message}`);
      });
    });
  }

  /**
   * Run tests
   */
  private async runTests(pattern?: string): Promise<string> {
    let command = 'npm test';
    if (pattern) {
      command = `npm test -- --testPathPattern="${pattern}"`;
    }
    return this.runCommand(command);
  }

  /**
   * Get git diff
   */
  private async gitDiff(staged?: boolean): Promise<string> {
    const command = staged ? 'git diff --staged' : 'git diff';
    return this.runCommand(command);
  }

  /**
   * Stage and commit changes
   */
  private async gitCommit(message: string, files?: string[]): Promise<string> {
    let command: string;
    
    if (files && files.length > 0) {
      const fileList = files.map(f => `"${f}"`).join(' ');
      command = `git add ${fileList} && git commit -m "${message.replace(/"/g, '\\"')}"`;
    } else {
      command = `git add -A && git commit -m "${message.replace(/"/g, '\\"')}"`;
    }
    
    return this.runCommand(command);
  }

  /**
   * Signal task completion
   */
  private async taskComplete(summary: string): Promise<string> {
    return `Task completed: ${summary}`;
  }

  /**
   * Resolve a path relative to workspace
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.config.workspacePath, filePath);
  }

  /**
   * Format execution result
   */
  private formatExecutionResult(result: ExecutionResult): string {
    let output = '';

    if (result.stdout) {
      output += result.stdout;
    }

    if (result.stderr) {
      output += output ? '\n' : '';
      output += `[stderr] ${result.stderr}`;
    }

    if (result.killed) {
      output += output ? '\n' : '';
      output += `[timeout] Command killed after ${result.duration}ms`;
    }

    if (result.exitCode !== 0) {
      output += output ? '\n' : '';
      output += `[exit code] ${result.exitCode}`;
    }

    return output || '(no output)';
  }

  /**
   * Cleanup sandbox
   */
  async cleanup(): Promise<void> {
    if (this.sandbox && this.sandboxId) {
      try {
        await this.sandbox.stop(this.sandboxId);
        await this.sandbox.destroy(this.sandboxId);
      } catch {
        // Ignore cleanup errors
      }
    }
    this.sandbox = null;
    this.sandboxId = null;
    this.initialized = false;
  }

  /**
   * Check if sandbox is active
   */
  isSandboxed(): boolean {
    return this.sandbox !== null && this.sandboxId !== null;
  }

  /**
   * Get sandbox type
   */
  getSandboxType(): string {
    if (!this.sandbox) return 'native';
    return this.sandbox.type;
  }
}

/**
 * Create a sandboxed tool executor
 */
export function createSandboxedExecutor(
  workspacePath: string,
  options: Partial<SandboxedExecutorConfig> = {}
): SandboxedToolExecutor {
  return new SandboxedToolExecutor({
    workspacePath,
    sandboxType: 'auto',
    timeout: 30000,
    ...options,
  });
}
