// Lint Runner
// packages/shadow/execution/src/lint-runner.ts

import { SecureRunner } from './secure-runner';
import {
  ExecutionConfig,
  ExecutionTask,
  ExecutionResult,
  Diagnostic,
} from './types';

export interface LintRunnerConfig extends ExecutionConfig {
  linter: 'eslint' | 'prettier' | 'typescript' | 'ruff' | 'clippy' | 'golint';
  fix?: boolean;
  files?: string[];
  configPath?: string;
}

export class LintRunner extends SecureRunner {
  private lintConfig: LintRunnerConfig;

  constructor(config: LintRunnerConfig) {
    super(config);
    this.lintConfig = config;
  }

  async run(task: ExecutionTask): Promise<ExecutionResult> {
    const command = this.buildCommand(task);
    
    this.emit('task:start', { taskId: task.id, command });
    task.status = 'running';
    task.startedAt = Date.now();

    try {
      const { exitCode, stdout, stderr, duration } = await this.executeCommand(command);

      const diagnostics = this.parseOutput(stdout, stderr);

      const result: ExecutionResult = {
        success: exitCode === 0,
        exitCode,
        stdout: this.sanitizeOutput(stdout),
        stderr: this.sanitizeOutput(stderr),
        duration,
        diagnostics,
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

    switch (this.lintConfig.linter) {
      case 'eslint':
        return this.buildEslintCommand();
      case 'prettier':
        return this.buildPrettierCommand();
      case 'typescript':
        return this.buildTypescriptCommand();
      case 'ruff':
        return this.buildRuffCommand();
      case 'clippy':
        return this.buildClippyCommand();
      case 'golint':
        return this.buildGolintCommand();
      default:
        return ['npx', 'eslint', '.'];
    }
  }

  private buildEslintCommand(): string[] {
    const args = ['npx', 'eslint', '--format', 'json'];
    
    if (this.lintConfig.fix) {
      args.push('--fix');
    }
    
    if (this.lintConfig.configPath) {
      args.push('--config', this.lintConfig.configPath);
    }
    
    if (this.lintConfig.files?.length) {
      args.push(...this.lintConfig.files);
    } else {
      args.push('.');
    }
    
    return args;
  }

  private buildPrettierCommand(): string[] {
    const args = ['npx', 'prettier'];
    
    if (this.lintConfig.fix) {
      args.push('--write');
    } else {
      args.push('--check');
    }
    
    if (this.lintConfig.configPath) {
      args.push('--config', this.lintConfig.configPath);
    }
    
    if (this.lintConfig.files?.length) {
      args.push(...this.lintConfig.files);
    } else {
      args.push('.');
    }
    
    return args;
  }

  private buildTypescriptCommand(): string[] {
    const args = ['npx', 'tsc', '--noEmit'];
    
    if (this.lintConfig.configPath) {
      args.push('--project', this.lintConfig.configPath);
    }
    
    return args;
  }

  private buildRuffCommand(): string[] {
    const args = ['ruff', 'check', '--output-format', 'json'];
    
    if (this.lintConfig.fix) {
      args.push('--fix');
    }
    
    if (this.lintConfig.files?.length) {
      args.push(...this.lintConfig.files);
    } else {
      args.push('.');
    }
    
    return args;
  }

  private buildClippyCommand(): string[] {
    return ['cargo', 'clippy', '--message-format', 'json', '--', '-D', 'warnings'];
  }

  private buildGolintCommand(): string[] {
    return ['golangci-lint', 'run', '--out-format', 'json'];
  }

  parseOutput(stdout: string, stderr: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Try to parse JSON output
    try {
      const jsonData = JSON.parse(stdout);
      
      // ESLint format
      if (Array.isArray(jsonData)) {
        for (const file of jsonData) {
          for (const message of file.messages || []) {
            diagnostics.push({
              severity: message.severity === 2 ? 'error' : 'warning',
              message: message.message,
              file: file.filePath,
              line: message.line,
              column: message.column,
              rule: message.ruleId,
              source: this.lintConfig.linter,
            });
          }
        }
        return diagnostics;
      }

      // Ruff format
      if (jsonData.results) {
        for (const result of jsonData.results) {
          diagnostics.push({
            severity: result.type === 'error' ? 'error' : 'warning',
            message: result.message,
            file: result.filename,
            line: result.location?.row,
            column: result.location?.column,
            rule: result.code,
            source: 'ruff',
          });
        }
        return diagnostics;
      }
    } catch {
      // Not JSON, parse text output
    }

    // Parse text output
    const combined = stdout + '\n' + stderr;
    
    // Common patterns
    const patterns = [
      // ESLint text: "file.ts:10:5: error Message (rule)"
      /^(.+?):(\d+):(\d+):\s*(error|warning)\s+(.+?)\s*(?:\((.+?)\))?$/gm,
      // TypeScript: "file.ts(10,5): error TS1234: Message"
      /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(\w+):\s*(.+)$/gm,
      // Rust/Clippy: "error[E0001]: message\n --> file.rs:10:5"
      /(error|warning)\[(\w+)\]:\s*(.+?)\n\s*-->\s*(.+?):(\d+):(\d+)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(combined)) !== null) {
        diagnostics.push({
          severity: match[4]?.toLowerCase().includes('error') ? 'error' : 'warning',
          message: match[5] || match[3] || match[6],
          file: match[1] || match[4],
          line: parseInt(match[2] || match[5], 10),
          column: parseInt(match[3] || match[6], 10),
          rule: match[6] || match[2],
          source: this.lintConfig.linter,
        });
      }
    }

    return diagnostics;
  }
}
