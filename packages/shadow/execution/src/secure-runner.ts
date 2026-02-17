// Secure Runner Base
// packages/shadow/execution/src/secure-runner.ts

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import {
  ExecutionConfig,
  ExecutionTask,
  ExecutionResult,
  ExecutionStatus,
  Diagnostic,
} from './types';

export abstract class SecureRunner extends EventEmitter {
  protected config: ExecutionConfig;
  protected runningProcesses: Map<string, ChildProcess> = new Map();

  constructor(config: ExecutionConfig) {
    super();
    this.config = config;
  }

  abstract run(task: ExecutionTask): Promise<ExecutionResult>;
  abstract parseOutput(stdout: string, stderr: string): Diagnostic[];

  protected async executeCommand(
    command: string[],
    options: {
      cwd?: string;
      env?: Record<string, string>;
      timeout?: number;
      stdin?: string;
    } = {}
  ): Promise<{ exitCode: number; stdout: string; stderr: string; duration: number }> {
    const startTime = Date.now();
    const cwd = options.cwd || this.config.workdir;
    const env = { ...process.env, ...this.config.env, ...options.env };
    const timeout = options.timeout || this.config.timeout;

    return new Promise((resolve, reject) => {
      const proc = spawn(command[0], command.slice(1), {
        cwd,
        env,
        shell: true,
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      const taskId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.runningProcesses.set(taskId, proc);

      const timeoutId = setTimeout(() => {
        killed = true;
        proc.kill('SIGKILL');
      }, timeout);

      if (options.stdin) {
        proc.stdin.write(options.stdin);
        proc.stdin.end();
      }

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        this.emit('stdout', { taskId, data: text });
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        this.emit('stderr', { taskId, data: text });
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        this.runningProcesses.delete(taskId);

        resolve({
          exitCode: killed ? 124 : (code ?? -1),
          stdout,
          stderr,
          duration: Date.now() - startTime,
        });
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutId);
        this.runningProcesses.delete(taskId);
        reject(error);
      });
    });
  }

  cancel(taskId: string): boolean {
    const proc = this.runningProcesses.get(taskId);
    if (proc) {
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (this.runningProcesses.has(taskId)) {
          proc.kill('SIGKILL');
        }
      }, 5000);
      return true;
    }
    return false;
  }

  cancelAll(): void {
    for (const [taskId] of this.runningProcesses) {
      this.cancel(taskId);
    }
  }

  getRunningCount(): number {
    return this.runningProcesses.size;
  }

  protected sanitizeOutput(output: string, maxLength: number = 1000000): string {
    if (output.length > maxLength) {
      const half = Math.floor(maxLength / 2);
      return output.slice(0, half) + '\n\n... truncated ...\n\n' + output.slice(-half);
    }
    return output;
  }

  protected parseLocation(location: string): { file?: string; line?: number; column?: number } {
    // Common patterns: "file.ts:10:5", "file.ts(10,5)", "file.ts line 10"
    const patterns = [
      /^(.+):(\d+):(\d+)$/,
      /^(.+)\((\d+),(\d+)\)$/,
      /^(.+)\s+line\s+(\d+)(?:,\s*col(?:umn)?\s*(\d+))?$/i,
    ];

    for (const pattern of patterns) {
      const match = location.match(pattern);
      if (match) {
        return {
          file: match[1],
          line: parseInt(match[2], 10),
          column: match[3] ? parseInt(match[3], 10) : undefined,
        };
      }
    }

    return {};
  }
}
