// Test Runner
// packages/shadow/execution/src/test-runner.ts

import { SecureRunner } from './secure-runner';
import {
  ExecutionConfig,
  ExecutionTask,
  ExecutionResult,
  Diagnostic,
  TestResult,
  TestSuiteResult,
  CoverageReport,
} from './types';

export interface TestRunnerConfig extends ExecutionConfig {
  testFramework: 'vitest' | 'jest' | 'mocha' | 'pytest' | 'cargo-test' | 'go-test';
  coverage?: boolean;
  watch?: boolean;
  filter?: string;
  parallel?: boolean;
}

export class TestRunner extends SecureRunner {
  private testConfig: TestRunnerConfig;

  constructor(config: TestRunnerConfig) {
    super(config);
    this.testConfig = config;
  }

  async run(task: ExecutionTask): Promise<ExecutionResult> {
    const command = this.buildCommand(task);
    
    this.emit('task:start', { taskId: task.id, command });
    task.status = 'running';
    task.startedAt = Date.now();

    try {
      const { exitCode, stdout, stderr, duration } = await this.executeCommand(command, {
        env: this.getTestEnv(),
      });

      const diagnostics = this.parseOutput(stdout, stderr);
      const testResults = this.parseTestResults(stdout, stderr);
      const coverage = this.testConfig.coverage 
        ? this.parseCoverage(stdout, stderr) 
        : undefined;

      const result: ExecutionResult = {
        success: exitCode === 0,
        exitCode,
        stdout: this.sanitizeOutput(stdout),
        stderr: this.sanitizeOutput(stderr),
        duration,
        diagnostics,
        coverage,
      };

      // Add test-specific metadata
      (result as any).tests = testResults;

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
    const baseCommand = task.command.length > 0 ? task.command : this.getDefaultCommand();
    const args: string[] = [...baseCommand];

    if (this.testConfig.coverage) {
      args.push(...this.getCoverageArgs());
    }

    if (this.testConfig.filter) {
      args.push(...this.getFilterArgs(this.testConfig.filter));
    }

    if (this.testConfig.parallel === false) {
      args.push(...this.getSequentialArgs());
    }

    return args;
  }

  private getDefaultCommand(): string[] {
    switch (this.testConfig.testFramework) {
      case 'vitest':
        return ['npx', 'vitest', 'run'];
      case 'jest':
        return ['npx', 'jest'];
      case 'mocha':
        return ['npx', 'mocha'];
      case 'pytest':
        return ['python', '-m', 'pytest'];
      case 'cargo-test':
        return ['cargo', 'test'];
      case 'go-test':
        return ['go', 'test', './...'];
      default:
        return ['npm', 'test'];
    }
  }

  private getCoverageArgs(): string[] {
    switch (this.testConfig.testFramework) {
      case 'vitest':
        return ['--coverage'];
      case 'jest':
        return ['--coverage'];
      case 'pytest':
        return ['--cov'];
      case 'cargo-test':
        return []; // Requires cargo-tarpaulin
      case 'go-test':
        return ['-cover'];
      default:
        return [];
    }
  }

  private getFilterArgs(filter: string): string[] {
    switch (this.testConfig.testFramework) {
      case 'vitest':
      case 'jest':
        return ['-t', filter];
      case 'pytest':
        return ['-k', filter];
      case 'cargo-test':
        return [filter];
      case 'go-test':
        return ['-run', filter];
      default:
        return ['--grep', filter];
    }
  }

  private getSequentialArgs(): string[] {
    switch (this.testConfig.testFramework) {
      case 'vitest':
        return ['--no-threads'];
      case 'jest':
        return ['--runInBand'];
      case 'pytest':
        return ['-x'];
      default:
        return [];
    }
  }

  private getTestEnv(): Record<string, string> {
    return {
      CI: 'true',
      NODE_ENV: 'test',
      FORCE_COLOR: '0',
    };
  }

  parseOutput(stdout: string, stderr: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const combined = stdout + '\n' + stderr;

    // Parse test failures
    const failurePatterns = [
      /FAIL\s+(.+?)\s*\n\s*●\s*(.+?)\n\s*([\s\S]+?)(?=\n\s*●|\n\s*FAIL|$)/g,
      /FAILED\s+(.+?)::(.+?)\s*-\s*(.+)/g,
      /error\[(.+?)\]:\s*(.+?)\n\s*-->\s*(.+?):(\d+):(\d+)/g,
    ];

    for (const pattern of failurePatterns) {
      let match;
      while ((match = pattern.exec(combined)) !== null) {
        diagnostics.push({
          severity: 'error',
          message: match[2] || match[0],
          file: match[1],
          source: 'test',
        });
      }
    }

    return diagnostics;
  }

  private parseTestResults(stdout: string, stderr: string): TestSuiteResult[] {
    // This would parse framework-specific output
    // Placeholder implementation
    const suites: TestSuiteResult[] = [];
    
    // Try to parse JSON output if available
    try {
      const jsonMatch = stdout.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        // Parse Jest/Vitest JSON format
        return data.testResults || [];
      }
    } catch {
      // Not JSON format
    }

    return suites;
  }

  private parseCoverage(stdout: string, stderr: string): CoverageReport | undefined {
    // Parse coverage from output
    const coverageMatch = stdout.match(/All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/);
    
    if (coverageMatch) {
      return {
        statements: {
          total: 100,
          covered: parseFloat(coverageMatch[1]),
          percentage: parseFloat(coverageMatch[1]),
        },
        branches: {
          total: 100,
          covered: parseFloat(coverageMatch[2]),
          percentage: parseFloat(coverageMatch[2]),
        },
        functions: {
          total: 100,
          covered: parseFloat(coverageMatch[3]),
          percentage: parseFloat(coverageMatch[3]),
        },
        lines: {
          total: 100,
          covered: parseFloat(coverageMatch[4]),
          percentage: parseFloat(coverageMatch[4]),
        },
        files: [],
      };
    }

    return undefined;
  }
}
