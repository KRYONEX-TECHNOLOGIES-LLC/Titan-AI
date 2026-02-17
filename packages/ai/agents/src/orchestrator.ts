/**
 * Titan AI Agents - Multi-Agent Orchestrator
 * Coordinates multiple specialized agents for complex tasks
 */

import type {
  AgentRole,
  AgentTask,
  AgentState,
  TeamConfig,
  TaskResult,
  OrchestratorEvent,
  ConflictResolution,
  WorktreeInfo,
} from './types.js';
import { Agent } from './agent-base.js';
import { DelegationLogic } from './delegation-logic.js';
import { ConflictResolver } from './conflict-resolution.js';
import { CoordinatorAgent } from './agents/coordinator.js';

export interface OrchestratorConfig {
  teamConfig: TeamConfig;
  workspacePath: string;
  enableWorktrees: boolean;
  maxParallel: number;
}

type EventCallback = (event: OrchestratorEvent) => void;

export class AgentOrchestrator {
  private config: OrchestratorConfig;
  private agents: Map<AgentRole, Agent>;
  private coordinator: CoordinatorAgent;
  private delegationLogic: DelegationLogic;
  private conflictResolver: ConflictResolver;
  private taskQueue: AgentTask[];
  private runningTasks: Map<string, AgentTask>;
  private worktrees: Map<AgentRole, WorktreeInfo>;
  private eventListeners: Set<EventCallback>;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.agents = new Map();
    this.taskQueue = [];
    this.runningTasks = new Map();
    this.worktrees = new Map();
    this.eventListeners = new Set();

    // Initialize coordinator
    this.coordinator = new CoordinatorAgent(config.teamConfig.coordinator);

    // Initialize delegation logic
    this.delegationLogic = new DelegationLogic({
      specialists: Object.keys(config.teamConfig.specialists) as AgentRole[],
    });

    // Initialize conflict resolver
    this.conflictResolver = new ConflictResolver({
      workspacePath: config.workspacePath,
    });
  }

  /**
   * Submit a task to the orchestrator
   */
  async submitTask(task: Omit<AgentTask, 'id' | 'status' | 'createdAt'>): Promise<string> {
    const fullTask: AgentTask = {
      ...task,
      id: this.generateTaskId(),
      status: 'pending',
      createdAt: Date.now(),
    };

    this.taskQueue.push(fullTask);
    this.emit({ type: 'task_created', task: fullTask });

    // Start processing if not at capacity
    this.processQueue();

    return fullTask.id;
  }

  /**
   * Process the task queue
   */
  private async processQueue(): Promise<void> {
    while (
      this.taskQueue.length > 0 &&
      this.runningTasks.size < this.config.maxParallel
    ) {
      const task = this.taskQueue.shift();
      if (!task) break;

      // Analyze and delegate task
      const delegation = await this.delegationLogic.analyze(task);
      task.assignedTo = delegation.agent;
      task.status = 'assigned';

      this.emit({ type: 'task_assigned', task, agent: delegation.agent });

      // Execute task
      this.executeTask(task);
    }
  }

  /**
   * Execute a task with the assigned agent
   */
  private async executeTask(task: AgentTask): Promise<void> {
    const agentRole = task.assignedTo;
    if (!agentRole) {
      task.status = 'failed';
      return;
    }

    task.status = 'running';
    task.startedAt = Date.now();
    this.runningTasks.set(task.id, task);
    this.emit({ type: 'task_started', task });

    try {
      // Get or create agent
      const agent = await this.getAgent(agentRole);

      // Create worktree if parallel execution enabled
      if (this.config.enableWorktrees && this.config.maxParallel > 1) {
        const worktree = await this.createWorktree(agentRole, task.id);
        task.worktreePath = worktree.path;
      }

      // Execute task
      const result = await agent.execute(task);

      // Handle result
      task.result = result;
      task.status = result.success ? 'completed' : 'failed';
      task.completedAt = Date.now();

      if (result.success) {
        this.emit({ type: 'task_completed', task, result });

        // Check for conflicts before merging
        if (task.worktreePath) {
          const conflicts = await this.conflictResolver.check(task.worktreePath);
          if (conflicts.length > 0) {
            for (const conflict of conflicts) {
              this.emit({ type: 'conflict_detected', conflict });
              const resolution = await this.conflictResolver.resolve(conflict);
              this.emit({ type: 'conflict_resolved', conflict: resolution });
            }
          }
          await this.mergeWorktree(agentRole);
        }
      } else {
        this.emit({
          type: 'task_failed',
          task,
          error: result.errors[0] ?? { code: 'UNKNOWN', message: 'Task failed', recoverable: false },
        });
      }
    } catch (error) {
      task.status = 'failed';
      task.completedAt = Date.now();
      this.emit({
        type: 'task_failed',
        task,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          recoverable: false,
        },
      });
    } finally {
      this.runningTasks.delete(task.id);
      this.processQueue();
    }
  }

  /**
   * Get or create an agent
   */
  private async getAgent(role: AgentRole): Promise<Agent> {
    let agent = this.agents.get(role);

    if (!agent) {
      const config = this.config.teamConfig.specialists[role];
      if (!config) {
        throw new Error(`No configuration for agent role: ${role}`);
      }
      agent = this.createAgent(role, config);
      this.agents.set(role, agent);
    }

    return agent;
  }

  /**
   * Create an agent instance
   */
  private createAgent(role: AgentRole, config: typeof this.config.teamConfig.coordinator): Agent {
    // Import specific agent class based on role
    // This is simplified - in production, use dynamic imports
    return new Agent(config);
  }

  /**
   * Create a git worktree for parallel execution
   */
  private async createWorktree(role: AgentRole, taskId: string): Promise<WorktreeInfo> {
    const branchName = `titan-agent/${role}/${taskId}`;
    const worktreePath = `${this.config.workspacePath}/.titan-worktrees/${taskId}`;

    // Git worktree creation would happen here
    // For now, just track the info
    const info: WorktreeInfo = {
      path: worktreePath,
      branch: branchName,
      agent: role,
      createdAt: Date.now(),
      status: 'active',
    };

    this.worktrees.set(role, info);
    return info;
  }

  /**
   * Merge worktree changes back to main
   */
  private async mergeWorktree(role: AgentRole): Promise<void> {
    const worktree = this.worktrees.get(role);
    if (!worktree) return;

    // Git merge would happen here
    worktree.status = 'merged';
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Subscribe to orchestrator events
   */
  on(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  /**
   * Emit an event
   */
  private emit(event: OrchestratorEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Get current orchestrator state
   */
  getState(): {
    queuedTasks: number;
    runningTasks: number;
    agents: Array<{ role: AgentRole; status: string }>;
    worktrees: WorktreeInfo[];
  } {
    const agentStates: Array<{ role: AgentRole; status: string }> = [];
    for (const [role, agent] of this.agents) {
      agentStates.push({ role, status: agent.getStatus() });
    }

    return {
      queuedTasks: this.taskQueue.length,
      runningTasks: this.runningTasks.size,
      agents: agentStates,
      worktrees: Array.from(this.worktrees.values()),
    };
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    // Check queue first
    const queueIndex = this.taskQueue.findIndex(t => t.id === taskId);
    if (queueIndex >= 0) {
      this.taskQueue.splice(queueIndex, 1);
      return true;
    }

    // Check running tasks
    const runningTask = this.runningTasks.get(taskId);
    if (runningTask) {
      runningTask.status = 'cancelled';
      this.runningTasks.delete(taskId);
      return true;
    }

    return false;
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): AgentTask | undefined {
    return this.taskQueue.find(t => t.id === taskId) ?? this.runningTasks.get(taskId);
  }

  /**
   * Shutdown orchestrator
   */
  async shutdown(): Promise<void> {
    // Cancel all queued tasks
    this.taskQueue.length = 0;

    // Wait for running tasks (with timeout)
    const timeout = 30000;
    const start = Date.now();
    while (this.runningTasks.size > 0 && Date.now() - start < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Cleanup worktrees
    for (const worktree of this.worktrees.values()) {
      if (worktree.status === 'active') {
        worktree.status = 'abandoned';
      }
    }

    this.agents.clear();
  }
}
