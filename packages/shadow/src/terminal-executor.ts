/**
 * Titan AI Shadow - Terminal Executor
 * Execute commands in shadow workspace
 */

import { execa } from 'execa';
import type {
  ExecutionRequest,
  ExecutionResult,
  ExecutionError,
  TerminalSession,
} from './types.js';

export interface ExecutorConfig {
  cwd: string;
  timeout: number;
  shell?: string;
}

export class TerminalExecutor {
  private config: ExecutorConfig;
  private sessions: Map<string, TerminalSession> = new Map();

  constructor(config: ExecutorConfig) {
    this.config = {
      shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
      ...config,
    };
  }

  /**
   * Execute a command
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const result = await execa(request.command, request.args ?? [], {
        cwd: request.cwd ?? this.config.cwd,
        env: { ...process.env, ...request.env },
        timeout: request.timeout ?? this.config.timeout,
        reject: false,
        all: true,
      });

      const errors = this.parseErrors(result.stdout + '\n' + result.stderr);

      return {
        success: result.exitCode === 0,
        exitCode: result.exitCode ?? 1,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: Date.now() - startTime,
        killed: result.killed,
        errors,
      };
    } catch (error) {
      const isTimeout = error instanceof Error && error.message.includes('timed out');

      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        killed: true,
        errors: [
          {
            type: isTimeout ? 'timeout' : 'runtime',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      };
    }
  }

  /**
   * Run npm/yarn/pnpm command
   */
  async runPackageManager(
    command: string,
    args: string[] = []
  ): Promise<ExecutionResult> {
    const pm = await this.detectPackageManager();
    return this.execute({
      command: pm,
      args: [command, ...args],
    });
  }

  /**
   * Run build
   */
  async build(): Promise<ExecutionResult> {
    return this.runPackageManager('run', ['build']);
  }

  /**
   * Run tests
   */
  async test(pattern?: string): Promise<ExecutionResult> {
    const args = ['run', 'test'];
    if (pattern) args.push('--', pattern);
    return this.runPackageManager(...args);
  }

  /**
   * Run linter
   */
  async lint(): Promise<ExecutionResult> {
    return this.runPackageManager('run', ['lint']);
  }

  /**
   * Run type checker
   */
  async typecheck(): Promise<ExecutionResult> {
    return this.runPackageManager('run', ['typecheck']);
  }

  /**
   * Install dependencies
   */
  async install(): Promise<ExecutionResult> {
    return this.runPackageManager('install');
  }

  /**
   * Detect package manager
   */
  private async detectPackageManager(): Promise<string> {
    try {
      await execa('pnpm', ['--version'], { cwd: this.config.cwd });
      return 'pnpm';
    } catch {
      try {
        await execa('yarn', ['--version'], { cwd: this.config.cwd });
        return 'yarn';
      } catch {
        return 'npm';
      }
    }
  }

  /**
   * Parse errors from output
   */
  private parseErrors(output: string): ExecutionError[] {
    const errors: ExecutionError[] = [];

    // TypeScript errors
    const tsErrorRegex = /(.+)\((\d+),(\d+)\):\s+error\s+TS\d+:\s+(.+)/g;
    let match;
    while ((match = tsErrorRegex.exec(output)) !== null) {
      errors.push({
        type: 'build',
        message: match[4],
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
      });
    }

    // ESLint errors
    const eslintRegex = /(.+):(\d+):(\d+):\s+error\s+(.+)/g;
    while ((match = eslintRegex.exec(output)) !== null) {
      errors.push({
        type: 'lint',
        message: match[4],
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
      });
    }

    // Test failures
    const testRegex = /FAIL\s+(.+)/g;
    while ((match = testRegex.exec(output)) !== null) {
      errors.push({
        type: 'test',
        message: `Test failed: ${match[1]}`,
        file: match[1],
      });
    }

    return errors;
  }
}
