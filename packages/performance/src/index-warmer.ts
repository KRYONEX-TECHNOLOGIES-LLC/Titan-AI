/**
 * Index warm-up for faster startup
 */

import type { WarmUpConfig, WarmUpProgress } from './types';
import { EventEmitter } from 'events';

export interface WarmUpTask {
  filePath: string;
  priority: number;
  processor: (filePath: string) => Promise<void>;
}

export class IndexWarmer extends EventEmitter {
  private config: WarmUpConfig;
  private queue: WarmUpTask[] = [];
  private inProgress = new Set<string>();
  private completed = new Set<string>();
  private failed = new Set<string>();
  private isRunning = false;
  private startTime = 0;

  constructor(config: Partial<WarmUpConfig> = {}) {
    super();
    this.config = {
      priorityFiles: config.priorityFiles || [],
      maxConcurrent: config.maxConcurrent || 4,
      batchSize: config.batchSize || 10,
      delayMs: config.delayMs || 50,
    };
  }

  /**
   * Add files to warm-up queue
   */
  addFiles(
    files: string[],
    processor: (filePath: string) => Promise<void>,
    basePriority = 0
  ): void {
    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];

      // Calculate priority
      let priority = basePriority;

      // Boost priority for configured priority files
      const priorityIndex = this.config.priorityFiles.findIndex((p) =>
        filePath.includes(p)
      );
      if (priorityIndex >= 0) {
        priority += (this.config.priorityFiles.length - priorityIndex) * 100;
      }

      // Boost priority for common important patterns
      if (filePath.includes('index.')) priority += 50;
      if (filePath.includes('/api/')) priority += 30;
      if (filePath.includes('/components/')) priority += 20;
      if (filePath.includes('.test.') || filePath.includes('.spec.')) priority -= 50;

      this.queue.push({ filePath, priority, processor });
    }

    // Sort by priority (highest first)
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Start warm-up process
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startTime = Date.now();
    this.emit('start', this.getProgress());

    while (this.queue.length > 0 && this.isRunning) {
      // Fill up to max concurrent
      while (
        this.inProgress.size < this.config.maxConcurrent &&
        this.queue.length > 0
      ) {
        const task = this.queue.shift()!;
        this.processTask(task);
      }

      // Wait for some to complete
      await this.delay(this.config.delayMs);
    }

    // Wait for remaining
    while (this.inProgress.size > 0) {
      await this.delay(this.config.delayMs);
    }

    this.isRunning = false;
    this.emit('complete', this.getProgress());
  }

  /**
   * Stop warm-up process
   */
  stop(): void {
    this.isRunning = false;
    this.emit('stop', this.getProgress());
  }

  /**
   * Process a single task
   */
  private async processTask(task: WarmUpTask): Promise<void> {
    this.inProgress.add(task.filePath);

    try {
      await task.processor(task.filePath);
      this.completed.add(task.filePath);
      this.emit('file-complete', task.filePath);
    } catch (error) {
      this.failed.add(task.filePath);
      this.emit('file-error', task.filePath, error);
    } finally {
      this.inProgress.delete(task.filePath);
      this.emit('progress', this.getProgress());
    }
  }

  /**
   * Get current progress
   */
  getProgress(): WarmUpProgress {
    const total = this.queue.length + this.inProgress.size + this.completed.size + this.failed.size;
    const processed = this.completed.size + this.failed.size;
    const elapsed = Date.now() - this.startTime;
    const rate = processed > 0 ? elapsed / processed : 0;
    const remaining = this.queue.length + this.inProgress.size;

    return {
      total,
      completed: this.completed.size,
      failed: this.failed.size,
      inProgress: this.inProgress.size,
      estimatedTimeMs: remaining * rate,
    };
  }

  /**
   * Reset warm-up state
   */
  reset(): void {
    this.queue = [];
    this.inProgress.clear();
    this.completed.clear();
    this.failed.clear();
    this.isRunning = false;
  }

  /**
   * Check if file was processed
   */
  isProcessed(filePath: string): boolean {
    return this.completed.has(filePath) || this.failed.has(filePath);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
