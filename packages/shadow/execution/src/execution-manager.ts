// Execution Manager
// packages/shadow/execution/src/execution-manager.ts

import { EventEmitter } from 'events';
import {
  ExecutionConfig,
  ExecutionTask,
  ExecutionResult,
  ExecutionType,
  ExecutionStatus,
} from './types';
import { TestRunner, TestRunnerConfig } from './test-runner';
import { LintRunner, LintRunnerConfig } from './lint-runner';
import { BuildRunner, BuildRunnerConfig } from './build-runner';
import { SecureRunner } from './secure-runner';

export interface ExecutionManagerConfig {
  maxConcurrent: number;
  defaultTimeout: number;
  defaultWorkdir: string;
}

export class ExecutionManager extends EventEmitter {
  private config: ExecutionManagerConfig;
  private tasks: Map<string, ExecutionTask> = new Map();
  private runners: Map<string, SecureRunner> = new Map();
  private queue: ExecutionTask[] = [];
  private running: number = 0;

  constructor(config: Partial<ExecutionManagerConfig> = {}) {
    super();
    this.config = {
      maxConcurrent: 4,
      defaultTimeout: 300000, // 5 minutes
      defaultWorkdir: process.cwd(),
      ...config,
    };
  }

  async runTest(options: {
    testFramework: TestRunnerConfig['testFramework'];
    workdir?: string;
    coverage?: boolean;
    filter?: string;
    timeout?: number;
  }): Promise<ExecutionResult> {
    const config: TestRunnerConfig = {
      testFramework: options.testFramework,
      workdir: options.workdir || this.config.defaultWorkdir,
      timeout: options.timeout || this.config.defaultTimeout,
      coverage: options.coverage,
      filter: options.filter,
    };

    const runner = new TestRunner(config);
    const task = this.createTask('test', [], config);

    return this.execute(task, runner);
  }

  async runLint(options: {
    linter: LintRunnerConfig['linter'];
    workdir?: string;
    fix?: boolean;
    files?: string[];
    timeout?: number;
  }): Promise<ExecutionResult> {
    const config: LintRunnerConfig = {
      linter: options.linter,
      workdir: options.workdir || this.config.defaultWorkdir,
      timeout: options.timeout || this.config.defaultTimeout,
      fix: options.fix,
      files: options.files,
    };

    const runner = new LintRunner(config);
    const task = this.createTask('lint', [], config);

    return this.execute(task, runner);
  }

  async runBuild(options: {
    buildTool: BuildRunnerConfig['buildTool'];
    workdir?: string;
    target?: string;
    production?: boolean;
    timeout?: number;
  }): Promise<ExecutionResult> {
    const config: BuildRunnerConfig = {
      buildTool: options.buildTool,
      workdir: options.workdir || this.config.defaultWorkdir,
      timeout: options.timeout || this.config.defaultTimeout,
      target: options.target,
      production: options.production,
    };

    const runner = new BuildRunner(config);
    const task = this.createTask('build', [], config);

    return this.execute(task, runner);
  }

  async runCommand(
    command: string[],
    options: Partial<ExecutionConfig> = {}
  ): Promise<ExecutionResult> {
    const config: ExecutionConfig = {
      workdir: options.workdir || this.config.defaultWorkdir,
      timeout: options.timeout || this.config.defaultTimeout,
      env: options.env,
    };

    const task = this.createTask('command', command, config);
    
    // Use a simple runner for arbitrary commands
    const runner = new SimpleCommandRunner(config);
    return this.execute(task, runner);
  }

  private createTask(
    type: ExecutionType,
    command: string[],
    config: ExecutionConfig
  ): ExecutionTask {
    const id = this.generateId();
    const task: ExecutionTask = {
      id,
      type,
      command,
      config,
      status: 'pending',
    };

    this.tasks.set(id, task);
    return task;
  }

  private async execute(task: ExecutionTask, runner: SecureRunner): Promise<ExecutionResult> {
    this.runners.set(task.id, runner);

    // Setup event forwarding
    runner.on('stdout', (data) => this.emit('stdout', { taskId: task.id, ...data }));
    runner.on('stderr', (data) => this.emit('stderr', { taskId: task.id, ...data }));

    if (this.running >= this.config.maxConcurrent) {
      // Queue the task
      this.queue.push(task);
      this.emit('task:queued', { taskId: task.id });

      await new Promise<void>((resolve) => {
        const checkQueue = () => {
          if (this.queue[0] === task && this.running < this.config.maxConcurrent) {
            this.queue.shift();
            resolve();
          } else {
            setTimeout(checkQueue, 100);
          }
        };
        checkQueue();
      });
    }

    this.running++;
    this.emit('task:start', { taskId: task.id, type: task.type });

    try {
      const result = await runner.run(task);
      return result;
    } finally {
      this.running--;
      this.runners.delete(task.id);
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.running < this.config.maxConcurrent) {
      const nextTask = this.queue[0];
      this.emit('task:dequeued', { taskId: nextTask.id });
    }
  }

  cancelTask(taskId: string): boolean {
    const runner = this.runners.get(taskId);
    if (runner) {
      runner.cancel(taskId);
      return true;
    }

    // Remove from queue if pending
    const queueIndex = this.queue.findIndex(t => t.id === taskId);
    if (queueIndex !== -1) {
      const task = this.queue.splice(queueIndex, 1)[0];
      task.status = 'cancelled';
      this.emit('task:cancelled', { taskId });
      return true;
    }

    return false;
  }

  cancelAll(): void {
    // Cancel running tasks
    for (const runner of this.runners.values()) {
      runner.cancelAll();
    }

    // Cancel queued tasks
    for (const task of this.queue) {
      task.status = 'cancelled';
      this.emit('task:cancelled', { taskId: task.id });
    }
    this.queue = [];
  }

  getTask(taskId: string): ExecutionTask | undefined {
    return this.tasks.get(taskId);
  }

  getTasksByStatus(status: ExecutionStatus): ExecutionTask[] {
    return Array.from(this.tasks.values())
      .filter(t => t.status === status);
  }

  getStats(): ExecutionStats {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      running: this.running,
      queued: this.queue.length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
    };
  }

  private generateId(): string {
    return `exec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// Simple command runner for arbitrary commands
class SimpleCommandRunner extends SecureRunner {
  async run(task: ExecutionTask): Promise<ExecutionResult> {
    const startTime = Date.now();
    task.status = 'running';
    task.startedAt = startTime;

    try {
      const { exitCode, stdout, stderr, duration } = await this.executeCommand(task.command);

      const result: ExecutionResult = {
        success: exitCode === 0,
        exitCode,
        stdout: this.sanitizeOutput(stdout),
        stderr: this.sanitizeOutput(stderr),
        duration,
        diagnostics: this.parseOutput(stdout, stderr),
      };

      task.status = exitCode === 0 ? 'completed' : 'failed';
      task.completedAt = Date.now();
      task.result = result;

      return result;
    } catch (error) {
      task.status = 'failed';
      task.completedAt = Date.now();

      return {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: (error as Error).message,
        duration: Date.now() - startTime,
      };
    }
  }

  parseOutput(stdout: string, stderr: string): any[] {
    return [];
  }
}

export interface ExecutionStats {
  total: number;
  pending: number;
  running: number;
  queued: number;
  completed: number;
  failed: number;
}
