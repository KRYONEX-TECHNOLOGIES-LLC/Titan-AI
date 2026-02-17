/**
 * Task decomposition for complex tasks
 */

import { EventEmitter } from 'events';
import type { Task, DecompositionResult } from './types';

export interface TaskDecomposerConfig {
  maxDepth: number;
  maxSubtasks: number;
  enableParallelization: boolean;
  complexityThreshold: number;
}

export class TaskDecomposer extends EventEmitter {
  private config: TaskDecomposerConfig;
  private idCounter: number = 0;

  constructor(config: Partial<TaskDecomposerConfig> = {}) {
    super();
    this.config = {
      maxDepth: config.maxDepth ?? 5,
      maxSubtasks: config.maxSubtasks ?? 10,
      enableParallelization: config.enableParallelization ?? true,
      complexityThreshold: config.complexityThreshold ?? 5,
    };
  }

  decompose(
    description: string,
    subtaskDescriptions: string[],
    dependencies: Record<string, string[]> = {}
  ): DecompositionResult {
    const tasks: Task[] = subtaskDescriptions.map((desc, index) => ({
      id: `task-${++this.idCounter}`,
      description: desc,
      type: 'atomic' as const,
      status: 'pending' as const,
      priority: subtaskDescriptions.length - index,
      dependencies: dependencies[desc] ?? [],
      subtasks: [],
      estimatedComplexity: this.estimateComplexity(desc),
      createdAt: new Date(),
    }));

    // Resolve dependencies by ID
    for (const task of tasks) {
      task.dependencies = task.dependencies.map(depDesc => {
        const depTask = tasks.find(t => t.description === depDesc);
        return depTask?.id ?? depDesc;
      }).filter(id => tasks.some(t => t.id === id));
    }

    // Calculate execution order using topological sort
    const executionOrder = this.topologicalSort(tasks);

    // Identify parallel groups
    const parallelGroups = this.config.enableParallelization
      ? this.identifyParallelGroups(tasks, executionOrder)
      : executionOrder.map(id => [id]);

    const result: DecompositionResult = {
      originalTask: description,
      subtasks: tasks,
      executionOrder,
      parallelGroups,
      estimatedSteps: parallelGroups.length,
    };

    this.emit('decomposed', result);
    return result;
  }

  private estimateComplexity(description: string): number {
    // Simple heuristic based on description length and keywords
    let complexity = 1;

    // Length factor
    complexity += Math.min(description.length / 100, 3);

    // Complexity keywords
    const complexKeywords = [
      'refactor', 'migrate', 'optimize', 'integrate', 'implement',
      'design', 'architect', 'security', 'performance', 'test',
    ];

    for (const keyword of complexKeywords) {
      if (description.toLowerCase().includes(keyword)) {
        complexity += 1;
      }
    }

    return Math.min(Math.round(complexity), 10);
  }

  private topologicalSort(tasks: Task[]): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (taskId: string): void => {
      if (visited.has(taskId)) return;
      if (visiting.has(taskId)) {
        throw new Error(`Circular dependency detected for task: ${taskId}`);
      }

      visiting.add(taskId);

      const task = tasks.find(t => t.id === taskId);
      if (task) {
        for (const depId of task.dependencies) {
          visit(depId);
        }
      }

      visiting.delete(taskId);
      visited.add(taskId);
      result.push(taskId);
    };

    for (const task of tasks) {
      visit(task.id);
    }

    return result;
  }

  private identifyParallelGroups(tasks: Task[], executionOrder: string[]): string[][] {
    const groups: string[][] = [];
    const completed = new Set<string>();

    while (completed.size < executionOrder.length) {
      const group: string[] = [];

      for (const taskId of executionOrder) {
        if (completed.has(taskId)) continue;

        const task = tasks.find(t => t.id === taskId);
        if (!task) continue;

        // Check if all dependencies are completed
        const depsCompleted = task.dependencies.every(dep => completed.has(dep));
        if (depsCompleted) {
          group.push(taskId);
        }
      }

      if (group.length === 0) {
        // Should not happen if topological sort is correct
        break;
      }

      groups.push(group);
      for (const taskId of group) {
        completed.add(taskId);
      }
    }

    return groups;
  }

  decomposeRecursive(
    description: string,
    depth: number = 0
  ): Task {
    const task: Task = {
      id: `task-${++this.idCounter}`,
      description,
      type: 'composite',
      status: 'pending',
      priority: 5,
      dependencies: [],
      subtasks: [],
      estimatedComplexity: this.estimateComplexity(description),
      createdAt: new Date(),
    };

    // Only decompose further if within depth limit and complex enough
    if (depth < this.config.maxDepth && task.estimatedComplexity > this.config.complexityThreshold) {
      // This would typically call an LLM to generate subtasks
      // For now, mark as composite
      task.type = 'composite';
    } else {
      task.type = 'atomic';
    }

    return task;
  }

  addSubtask(parentTask: Task, subtask: Omit<Task, 'id' | 'createdAt'>): Task {
    if (parentTask.subtasks.length >= this.config.maxSubtasks) {
      throw new Error(`Maximum subtasks (${this.config.maxSubtasks}) reached`);
    }

    const newSubtask: Task = {
      ...subtask,
      id: `task-${++this.idCounter}`,
      createdAt: new Date(),
    };

    parentTask.subtasks.push(newSubtask);
    parentTask.type = 'composite';

    this.emit('subtask:added', { parent: parentTask.id, subtask: newSubtask });
    return newSubtask;
  }

  updateTaskStatus(task: Task, status: Task['status'], result?: unknown): void {
    task.status = status;
    
    if (status === 'completed' || status === 'failed') {
      task.completedAt = new Date();
    }

    if (result !== undefined) {
      task.result = result;
    }

    this.emit('task:updated', task);
  }

  getReadyTasks(tasks: Task[]): Task[] {
    const completedIds = new Set(
      tasks.filter(t => t.status === 'completed').map(t => t.id)
    );

    return tasks.filter(task => {
      if (task.status !== 'pending') return false;
      return task.dependencies.every(dep => completedIds.has(dep));
    });
  }

  getBlockedTasks(tasks: Task[]): Task[] {
    const completedIds = new Set(
      tasks.filter(t => t.status === 'completed').map(t => t.id)
    );

    return tasks.filter(task => {
      if (task.status !== 'pending') return false;
      return !task.dependencies.every(dep => completedIds.has(dep));
    });
  }

  estimateTotalComplexity(tasks: Task[]): number {
    return tasks.reduce((sum, task) => {
      const subtaskComplexity = task.subtasks.length > 0
        ? this.estimateTotalComplexity(task.subtasks)
        : task.estimatedComplexity;
      return sum + subtaskComplexity;
    }, 0);
  }
}

/**
 * Creates a task decomposer instance
 */
export function createTaskDecomposer(config?: Partial<TaskDecomposerConfig>): TaskDecomposer {
  return new TaskDecomposer(config);
}
