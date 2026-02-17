// MCP Task Queue
// packages/mcp/coordination/src/task-queue.ts

import { EventEmitter } from 'events';
import { CoordinatedTask, TaskStatus } from './types';

export interface QueueConfig {
  maxSize: number;
  priorityLevels: number;
  timeoutMs: number;
}

export class TaskQueue extends EventEmitter {
  private queues: Map<number, CoordinatedTask[]> = new Map();
  private taskIndex: Map<string, number> = new Map(); // taskId -> priority
  private config: QueueConfig;

  constructor(config: Partial<QueueConfig> = {}) {
    super();
    this.config = {
      maxSize: 1000,
      priorityLevels: 5,
      timeoutMs: 300000, // 5 minutes
      ...config,
    };

    // Initialize priority queues
    for (let i = 0; i < this.config.priorityLevels; i++) {
      this.queues.set(i, []);
    }

    // Start timeout checker
    this.startTimeoutChecker();
  }

  enqueue(task: CoordinatedTask, priority: number = 2): boolean {
    if (this.size() >= this.config.maxSize) {
      this.emit('queue:full', { taskId: task.id });
      return false;
    }

    const normalizedPriority = Math.max(0, Math.min(priority, this.config.priorityLevels - 1));
    const queue = this.queues.get(normalizedPriority)!;
    queue.push(task);
    this.taskIndex.set(task.id, normalizedPriority);

    this.emit('task:enqueued', { taskId: task.id, priority: normalizedPriority });
    return true;
  }

  dequeue(): CoordinatedTask | undefined {
    // Dequeue from highest priority first (0 = highest)
    for (let i = 0; i < this.config.priorityLevels; i++) {
      const queue = this.queues.get(i)!;
      if (queue.length > 0) {
        const task = queue.shift()!;
        this.taskIndex.delete(task.id);
        this.emit('task:dequeued', { taskId: task.id, priority: i });
        return task;
      }
    }
    return undefined;
  }

  peek(): CoordinatedTask | undefined {
    for (let i = 0; i < this.config.priorityLevels; i++) {
      const queue = this.queues.get(i)!;
      if (queue.length > 0) {
        return queue[0];
      }
    }
    return undefined;
  }

  remove(taskId: string): boolean {
    const priority = this.taskIndex.get(taskId);
    if (priority === undefined) return false;

    const queue = this.queues.get(priority)!;
    const index = queue.findIndex(t => t.id === taskId);
    if (index !== -1) {
      queue.splice(index, 1);
      this.taskIndex.delete(taskId);
      this.emit('task:removed', { taskId, priority });
      return true;
    }
    return false;
  }

  updatePriority(taskId: string, newPriority: number): boolean {
    const currentPriority = this.taskIndex.get(taskId);
    if (currentPriority === undefined) return false;

    const queue = this.queues.get(currentPriority)!;
    const index = queue.findIndex(t => t.id === taskId);
    if (index === -1) return false;

    const task = queue.splice(index, 1)[0];
    const normalizedPriority = Math.max(0, Math.min(newPriority, this.config.priorityLevels - 1));
    
    this.queues.get(normalizedPriority)!.push(task);
    this.taskIndex.set(taskId, normalizedPriority);

    this.emit('task:priorityChanged', { 
      taskId, 
      oldPriority: currentPriority, 
      newPriority: normalizedPriority 
    });
    return true;
  }

  contains(taskId: string): boolean {
    return this.taskIndex.has(taskId);
  }

  size(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  sizeByPriority(): Map<number, number> {
    const sizes = new Map<number, number>();
    for (const [priority, queue] of this.queues) {
      sizes.set(priority, queue.length);
    }
    return sizes;
  }

  clear(): void {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
    this.taskIndex.clear();
    this.emit('queue:cleared');
  }

  getTasksWithStatus(status: TaskStatus): CoordinatedTask[] {
    const result: CoordinatedTask[] = [];
    for (const queue of this.queues.values()) {
      result.push(...queue.filter(t => t.status === status));
    }
    return result;
  }

  private startTimeoutChecker(): void {
    setInterval(() => {
      const now = Date.now();
      for (const queue of this.queues.values()) {
        for (const task of queue) {
          if (now - task.createdAt > this.config.timeoutMs) {
            task.status = 'timeout';
            this.emit('task:timeout', { taskId: task.id });
          }
        }
      }
    }, 10000); // Check every 10 seconds
  }

  drain(handler: (task: CoordinatedTask) => Promise<void>): Promise<void> {
    return new Promise(async (resolve) => {
      let task: CoordinatedTask | undefined;
      while ((task = this.dequeue()) !== undefined) {
        try {
          await handler(task);
        } catch (error) {
          this.emit('task:error', { taskId: task.id, error });
        }
      }
      resolve();
    });
  }

  toArray(): CoordinatedTask[] {
    const result: CoordinatedTask[] = [];
    for (let i = 0; i < this.config.priorityLevels; i++) {
      result.push(...this.queues.get(i)!);
    }
    return result;
  }
}
