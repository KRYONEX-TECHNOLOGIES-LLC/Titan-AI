// MCP Multi-Agent Coordinator
// packages/mcp/coordination/src/coordinator.ts

import { EventEmitter } from 'events';
import {
  CoordinatorConfig,
  AgentRegistration,
  CoordinatedTask,
  TaskType,
  TaskStatus,
  AgentResult,
  CoordinationMessage,
} from './types';
import { TaskQueue } from './task-queue';
import { ConsensusManager } from './consensus';
import { ConflictResolver } from './conflict-resolver';

export class MultiAgentCoordinator extends EventEmitter {
  private config: CoordinatorConfig;
  private agents: Map<string, AgentRegistration> = new Map();
  private tasks: Map<string, CoordinatedTask> = new Map();
  private taskQueue: TaskQueue;
  private consensusManager: ConsensusManager;
  private conflictResolver: ConflictResolver;
  private messageHistory: CoordinationMessage[] = [];

  constructor(config: Partial<CoordinatorConfig> = {}) {
    super();
    this.config = {
      maxConcurrentAgents: 10,
      taskTimeout: 60000,
      consensusThreshold: 0.66,
      conflictResolutionStrategy: 'merge',
      ...config,
    };

    this.taskQueue = new TaskQueue();
    this.consensusManager = new ConsensusManager(this.config.consensusThreshold);
    this.conflictResolver = new ConflictResolver(this.config.conflictResolutionStrategy);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.consensusManager.on('consensus:reached', (data) => {
      this.emit('consensus:reached', data);
      this.handleConsensusReached(data.taskId, data.proposal);
    });

    this.consensusManager.on('consensus:failed', (data) => {
      this.emit('consensus:failed', data);
    });

    this.conflictResolver.on('conflict:resolved', (data) => {
      this.emit('conflict:resolved', data);
    });
  }

  registerAgent(registration: AgentRegistration): void {
    this.agents.set(registration.id, registration);
    this.emit('agent:registered', { agent: registration });
  }

  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.emit('agent:unregistered', { agentId });
  }

  getAgent(agentId: string): AgentRegistration | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): AgentRegistration[] {
    return Array.from(this.agents.values());
  }

  async createTask(
    type: TaskType,
    description: string,
    input: unknown,
    requiredCapabilities: string[] = [],
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const taskId = this.generateId();
    const task: CoordinatedTask = {
      id: taskId,
      type,
      description,
      requiredCapabilities,
      input,
      status: 'pending',
      assignedAgents: [],
      results: new Map(),
      createdAt: Date.now(),
      metadata,
    };

    this.tasks.set(taskId, task);
    this.taskQueue.enqueue(task);
    this.emit('task:created', { task });

    // Auto-assign agents
    await this.assignAgents(task);

    return taskId;
  }

  private async assignAgents(task: CoordinatedTask): Promise<void> {
    const eligibleAgents = this.findEligibleAgents(task.requiredCapabilities);

    if (eligibleAgents.length === 0) {
      task.status = 'failed';
      this.emit('task:failed', { taskId: task.id, reason: 'No eligible agents' });
      return;
    }

    switch (task.type) {
      case 'single':
        // Assign to highest priority agent
        task.assignedAgents = [eligibleAgents[0].id];
        break;

      case 'parallel':
      case 'consensus':
      case 'competitive':
        // Assign to all eligible agents (up to max)
        task.assignedAgents = eligibleAgents
          .slice(0, this.config.maxConcurrentAgents)
          .map(a => a.id);
        break;

      case 'sequential':
        // Assign to all, but will execute one at a time
        task.assignedAgents = eligibleAgents.map(a => a.id);
        break;
    }

    task.status = 'assigned';
    this.emit('task:assigned', { taskId: task.id, agents: task.assignedAgents });

    // Notify assigned agents
    for (const agentId of task.assignedAgents) {
      this.sendMessage({
        type: 'task-assignment',
        senderId: 'coordinator',
        recipientId: agentId,
        payload: {
          taskId: task.id,
          type: task.type,
          description: task.description,
          input: task.input,
        },
      });
    }
  }

  private findEligibleAgents(requiredCapabilities: string[]): AgentRegistration[] {
    return Array.from(this.agents.values())
      .filter(agent => {
        if (requiredCapabilities.length === 0) return true;
        return requiredCapabilities.every(cap => 
          agent.capabilities.includes(cap)
        );
      })
      .sort((a, b) => b.priority - a.priority);
  }

  async submitResult(taskId: string, agentId: string, result: AgentResult): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (!task.assignedAgents.includes(agentId)) {
      throw new Error(`Agent ${agentId} not assigned to task ${taskId}`);
    }

    task.results.set(agentId, result);
    this.emit('result:submitted', { taskId, agentId, result });

    // Check if task is complete based on type
    await this.checkTaskCompletion(task);
  }

  private async checkTaskCompletion(task: CoordinatedTask): Promise<void> {
    const resultCount = task.results.size;
    const assignedCount = task.assignedAgents.length;

    switch (task.type) {
      case 'single':
        if (resultCount >= 1) {
          this.completeTask(task);
        }
        break;

      case 'parallel':
        if (resultCount >= assignedCount) {
          // Check for conflicts
          const outputs = Array.from(task.results.values()).map(r => r.output);
          if (this.hasConflicts(outputs)) {
            const resolution = await this.conflictResolver.resolve(task);
            task.metadata = { ...task.metadata, resolution };
          }
          this.completeTask(task);
        }
        break;

      case 'consensus':
        if (resultCount >= assignedCount) {
          task.status = 'consensus';
          await this.consensusManager.startConsensus(task);
        }
        break;

      case 'competitive':
        // First successful result wins
        const firstSuccess = Array.from(task.results.values()).find(r => r.success);
        if (firstSuccess) {
          this.completeTask(task, firstSuccess);
        } else if (resultCount >= assignedCount) {
          task.status = 'failed';
          this.emit('task:failed', { taskId: task.id, reason: 'All agents failed' });
        }
        break;

      case 'sequential':
        // Results must come in order
        if (resultCount >= assignedCount) {
          this.completeTask(task);
        }
        break;
    }
  }

  private hasConflicts(outputs: unknown[]): boolean {
    if (outputs.length <= 1) return false;
    const first = JSON.stringify(outputs[0]);
    return outputs.some(o => JSON.stringify(o) !== first);
  }

  private completeTask(task: CoordinatedTask, winningResult?: AgentResult): void {
    task.status = 'completed';
    task.completedAt = Date.now();

    const finalOutput = winningResult
      ? winningResult.output
      : this.aggregateResults(task);

    this.emit('task:completed', {
      taskId: task.id,
      results: Array.from(task.results.values()),
      finalOutput,
      duration: task.completedAt - (task.startedAt || task.createdAt),
    });
  }

  private aggregateResults(task: CoordinatedTask): unknown {
    const results = Array.from(task.results.values());
    
    // Simple aggregation: return all successful outputs
    const successfulOutputs = results
      .filter(r => r.success)
      .map(r => r.output);

    if (successfulOutputs.length === 1) {
      return successfulOutputs[0];
    }

    return successfulOutputs;
  }

  private handleConsensusReached(taskId: string, proposal: unknown): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.metadata = { ...task.metadata, consensusProposal: proposal };
      this.completeTask(task);
    }
  }

  sendMessage(message: Omit<CoordinationMessage, 'id' | 'timestamp'>): void {
    const fullMessage: CoordinationMessage = {
      ...message,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    this.messageHistory.push(fullMessage);
    this.emit('message:sent', fullMessage);
  }

  getTask(taskId: string): CoordinatedTask | undefined {
    return this.tasks.get(taskId);
  }

  getTasksByStatus(status: TaskStatus): CoordinatedTask[] {
    return Array.from(this.tasks.values())
      .filter(t => t.status === status);
  }

  getStats(): CoordinatorStats {
    const tasks = Array.from(this.tasks.values());
    return {
      totalAgents: this.agents.size,
      totalTasks: tasks.length,
      pendingTasks: tasks.filter(t => t.status === 'pending').length,
      runningTasks: tasks.filter(t => t.status === 'running' || t.status === 'assigned').length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      failedTasks: tasks.filter(t => t.status === 'failed').length,
      averageTaskDuration: this.calculateAverageTaskDuration(tasks),
    };
  }

  private calculateAverageTaskDuration(tasks: CoordinatedTask[]): number {
    const completed = tasks.filter(t => t.completedAt);
    if (completed.length === 0) return 0;

    const totalDuration = completed.reduce((sum, t) => {
      return sum + ((t.completedAt || 0) - (t.startedAt || t.createdAt));
    }, 0);

    return totalDuration / completed.length;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export interface CoordinatorStats {
  totalAgents: number;
  totalTasks: number;
  pendingTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageTaskDuration: number;
}
