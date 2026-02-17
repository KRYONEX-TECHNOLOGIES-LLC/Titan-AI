// Build Runner
// packages/shadow/execution/src/build-runner.ts

import { SecureRunner } from './secure-runner';
import {
  ExecutionConfig,
  ExecutionTask,
  ExecutionResult,
  Diagnostic,
  ExecutionArtifact,
} from './types';

export interface BuildRunnerConfig extends ExecutionConfig {
  buildTool: 'npm' | 'pnpm' | 'yarn' | 'cargo' | 'go' | 'make' | 'custom';
  target?: string;
  outputDir?: string;
  production?: boolean;
}

export class BuildRunner extends SecureRunner {
  private buildConfig: BuildRunnerConfig;

  constructor(config: BuildRunnerConfig) {
    super(config);
    this.buildConfig = config;
  }

  async run(task: ExecutionTask): Promise<ExecutionResult> {
    const command = this.buildCommand(task);
    
    this.emit('task:start', { taskId: task.id, command });
    task.status = 'running';
    task.startedAt = Date.now();

    try {
      const { exitCode, stdout, stderr, duration } = await this.executeCommand(command, {
        env: this.getBuildEnv(),
      });

      const diagnostics = this.parseOutput(stdout, stderr);
      const artifacts = await this.collectArtifacts();

      const result: ExecutionResult = {
        success: exitCode === 0,
        exitCode,
        stdout: this.sanitizeOutput(stdout),
        stderr: this.sanitizeOutput(stderr),
        duration,
        diagnostics,
        artifacts,
      };

      task.status = exitCode === 0 ? 'completed' : 'failed';
      task.completedAt = Date.now();
      task.result = result;

      this.emit('task:complete', { taskId: task.id, result });
      return result;
    } catch (error) {
      task.status = 'failed';
      task.completedAt = Date.now();

      const result: ExecutionResult = {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: (error as Error).message,
        duration: Date.now() - (task.startedAt || Date.now()),
      };

      task.result = result;
      this.emit('task:error', { taskId: task.id, error });
      return result;
    }
  }

  private buildCommand(task: ExecutionTask): string[] {
    if (task.command.length > 0) {
      return task.command;
    }

    switch (this.buildConfig.buildTool) {
      case 'npm':
        return this.buildNpmCommand();
      case 'pnpm':
        return this.buildPnpmCommand();
      case 'yarn':
        return this.buildYarnCommand();
      case 'cargo':
        return this.buildCargoCommand();
      case 'go':
        return this.buildGoCommand();
      case 'make':
        return this.buildMakeCommand();
      default:
        return ['npm', 'run', 'build'];
    }
  }

  private buildNpmCommand(): string[] {
    const args = ['npm', 'run'];
    args.push(this.buildConfig.target || 'build');
    return args;
  }

  private buildPnpmCommand(): string[] {
    const args = ['pnpm'];
    args.push(this.buildConfig.target || 'build');
    return args;
  }

  private buildYarnCommand(): string[] {
    const args = ['yarn'];
    args.push(this.buildConfig.target || 'build');
    return args;
  }

  private buildCargoCommand(): string[] {
    const args = ['cargo', 'build'];
    
    if (this.buildConfig.production) {
      args.push('--release');
    }
    
    if (this.buildConfig.target) {
      args.push('--target', this.buildConfig.target);
    }
    
    return args;
  }

  private buildGoCommand(): string[] {
    const args = ['go', 'build'];
    
    if (this.buildConfig.outputDir) {
      args.push('-o', this.buildConfig.outputDir);
    }
    
    args.push('./...');
    return args;
  }

  private buildMakeCommand(): string[] {
    const args = ['make'];
    
    if (this.buildConfig.target) {
      args.push(this.buildConfig.target);
    }
    
    return args;
  }

  private getBuildEnv(): Record<string, string> {
    const env: Record<string, string> = {
      CI: 'true',
    };

    if (this.buildConfig.production) {
      env.NODE_ENV = 'production';
    }

    return env;
  }

  private async collectArtifacts(): Promise<ExecutionArtifact[]> {
    const artifacts: ExecutionArtifact[] = [];
    const outputDir = this.buildConfig.outputDir || 'dist';

    // In a real implementation, this would scan the output directory
    // and collect information about build artifacts

    return artifacts;
  }

  parseOutput(stdout: string, stderr: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const combined = stdout + '\n' + stderr;

    // Build error patterns
    const patterns = [
      // TypeScript/Webpack errors
      /ERROR in (.+?)\n(.+?)\n\s*TS(\d+):\s*(.+)/g,
      // Rust/Cargo errors
      /error\[E(\d+)\]:\s*(.+?)\n\s*-->\s*(.+?):(\d+):(\d+)/g,
      // Go errors
      /(.+?):(\d+):(\d+):\s*(.+)/g,
      // Generic build errors
      /^error:\s*(.+)/gm,
      /^Error:\s*(.+)/gm,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(combined)) !== null) {
        const diagnostic: Diagnostic = {
          severity: 'error',
          message: match[4] || match[2] || match[1],
          source: this.buildConfig.buildTool,
        };

        // Extract file location if available
        if (match[3] && !isNaN(parseInt(match[4]))) {
          diagnostic.file = match[3];
          diagnostic.line = parseInt(match[4], 10);
          diagnostic.column = match[5] ? parseInt(match[5], 10) : undefined;
        } else if (match[1] && match[2]) {
          diagnostic.file = match[1];
          diagnostic.line = parseInt(match[2], 10);
        }

        diagnostics.push(diagnostic);
      }
    }

    // Also check for warnings
    const warningPatterns = [
      /warning:\s*(.+)/gi,
      /WARNING:\s*(.+)/g,
    ];

    for (const pattern of warningPatterns) {
      let match;
      while ((match = pattern.exec(combined)) !== null) {
        diagnostics.push({
          severity: 'warning',
          message: match[1],
          source: this.buildConfig.buildTool,
        });
      }
    }

    return diagnostics;
  }
}
