/**
 * Project Midnight - Agent Loop
 * Implements the Actor-Sentinel verification loop with veto, revert, and lock
 */

import type {
  MidnightTask,
  TaskResult,
  SentinelVerdict,
  MidnightEvent,
} from '../types.js';
import type { ActorAgent, ActorContext } from './actor.js';
import type { SentinelAgent, SentinelContext } from './sentinel.js';

export interface AgentLoopConfig {
  maxRetries: number;
  qualityThreshold: number;
  enableVeto: boolean;
  enableRevert: boolean;
}

export interface WorktreeManager {
  create(projectPath: string, branchName: string): Promise<string>;
  getGitDiff(worktreePath: string): Promise<string>;
  revert(worktreePath: string, toHash: string): Promise<void>;
  merge(worktreePath: string, targetBranch: string): Promise<void>;
  delete(worktreePath: string): Promise<void>;
}

export interface RepoMapProvider {
  getRepoMap(projectPath: string): Promise<string>;
}

type EventCallback = (event: MidnightEvent) => void;

export class AgentLoop {
  private config: AgentLoopConfig;
  private actor: ActorAgent;
  private sentinel: SentinelAgent;
  private worktreeManager: WorktreeManager;
  private repoMapProvider: RepoMapProvider;
  private eventListeners: Set<EventCallback> = new Set();
  private lastVerifiedHash: string | null = null;

  constructor(
    config: AgentLoopConfig,
    actor: ActorAgent,
    sentinel: SentinelAgent,
    worktreeManager: WorktreeManager,
    repoMapProvider: RepoMapProvider
  ) {
    this.config = config;
    this.actor = actor;
    this.sentinel = sentinel;
    this.worktreeManager = worktreeManager;
    this.repoMapProvider = repoMapProvider;
  }

  /**
   * Execute a task through the full Actor-Sentinel loop
   */
  async executeTask(
    task: MidnightTask,
    projectContext: string,
    projectPlan: string,
    definitionOfDone: string
  ): Promise<{
    success: boolean;
    result: TaskResult;
    verdicts: SentinelVerdict[];
    worktreePath: string;
  }> {
    const verdicts: SentinelVerdict[] = [];
    const previousAttempts: string[] = [];
    let retryCount = 0;
    let worktreePath = '';

    // Create isolated worktree for this task
    try {
      worktreePath = await this.worktreeManager.create(
        task.worktreePath || '',
        `midnight-${task.id}`
      );
    } catch (error) {
      // Fall back to working without worktree
      worktreePath = task.worktreePath || '';
    }

    this.emit({ type: 'task_started', task });

    while (retryCount < this.config.maxRetries) {
      // ─── ACTOR PHASE ───
      const actorContext: ActorContext = {
        task,
        projectContext,
        previousAttempts,
        worktreePath,
      };

      const actorResult = await this.actor.execute(actorContext);

      if (!actorResult.success) {
        // Actor failed to complete the task
        this.emit({
          type: 'task_failed',
          task,
          error: actorResult.errors[0] || { code: 'UNKNOWN', message: 'Actor failed', recoverable: true },
        });

        if (actorResult.errors.some(e => !e.recoverable)) {
          // Unrecoverable error
          return {
            success: false,
            result: actorResult,
            verdicts,
            worktreePath,
          };
        }

        // Add to previous attempts and retry
        previousAttempts.push(actorResult.output);
        retryCount++;
        continue;
      }

      // ─── SENTINEL PHASE ───
      const gitDiff = await this.worktreeManager.getGitDiff(worktreePath);
      const repoMap = await this.repoMapProvider.getRepoMap(worktreePath);

      // Check for automatic VETO conditions first
      const vetoViolations = this.sentinel.checkVetoConditions({
        task,
        gitDiff,
        projectPlan,
        definitionOfDone,
        repoMap,
        previousVerdicts: verdicts,
      });

      if (vetoViolations.length > 0) {
        // Automatic VETO
        const vetoVerdict: SentinelVerdict = {
          id: `verdict-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          taskId: task.id,
          qualityScore: 0,
          passed: false,
          thinkingEffort: 'max',
          auditLog: {
            traceability: { mapped: [], missing: [], unplannedAdditions: [] },
            architecturalSins: vetoViolations,
            slopPatternsDetected: [],
          },
          correctionDirective: `AUTOMATIC VETO:\n${vetoViolations.join('\n')}`,
          merkleVerificationHash: this.computeSimpleHash(gitDiff),
          createdAt: Date.now(),
        };

        verdicts.push(vetoVerdict);
        this.emit({ type: 'sentinel_verdict', verdict: vetoVerdict });
        this.emit({ type: 'sentinel_veto', taskId: task.id, reason: vetoViolations.join(', ') });

        // Revert changes
        if (this.config.enableRevert && this.lastVerifiedHash) {
          await this.worktreeManager.revert(worktreePath, this.lastVerifiedHash);
          this.emit({ type: 'worktree_reverted', taskId: task.id, toHash: this.lastVerifiedHash });
        }

        previousAttempts.push(`VETO: ${vetoViolations.join(', ')}\n${actorResult.output}`);
        retryCount++;
        continue;
      }

      // Run full Sentinel verification
      const sentinelContext: SentinelContext = {
        task,
        gitDiff,
        projectPlan,
        definitionOfDone,
        repoMap,
        previousVerdicts: verdicts,
      };

      const verdict = await this.sentinel.verify(sentinelContext);
      verdicts.push(verdict);
      this.emit({ type: 'sentinel_verdict', verdict });

      if (verdict.passed) {
        // Task passed verification!
        this.lastVerifiedHash = this.computeSimpleHash(gitDiff);
        
        this.emit({
          type: 'task_completed',
          task,
          result: { ...actorResult, sentinelVerdict: verdict },
        });

        return {
          success: true,
          result: { ...actorResult, sentinelVerdict: verdict },
          verdicts,
          worktreePath,
        };
      }

      // Task failed verification
      this.emit({
        type: 'sentinel_veto',
        taskId: task.id,
        reason: verdict.correctionDirective || 'Quality score below threshold',
      });

      // Revert changes if enabled
      if (this.config.enableRevert && this.lastVerifiedHash) {
        await this.worktreeManager.revert(worktreePath, this.lastVerifiedHash);
        this.emit({ type: 'worktree_reverted', taskId: task.id, toHash: this.lastVerifiedHash });
      }

      // Add Sentinel feedback to previous attempts
      previousAttempts.push(
        `SENTINEL REJECTION (Score: ${verdict.qualityScore}):\n` +
        `Architectural Sins: ${verdict.auditLog.architecturalSins.join(', ')}\n` +
        `Slop Patterns: ${verdict.auditLog.slopPatternsDetected.join(', ')}\n` +
        `Correction: ${verdict.correctionDirective}\n\n` +
        `Actor Output:\n${actorResult.output}`
      );

      retryCount++;
    }

    // Max retries exceeded - lock the task
    this.emit({
      type: 'task_locked',
      task,
      reason: `Max retries (${this.config.maxRetries}) exceeded. Manual intervention required.`,
    });

    return {
      success: false,
      result: {
        success: false,
        output: `Task locked after ${retryCount} failed attempts`,
        artifacts: [],
        errors: [{
          code: 'MAX_RETRIES',
          message: `Task failed verification ${retryCount} times`,
          recoverable: false,
        }],
        metrics: {
          tokensUsed: 0,
          latencyMs: 0,
          iterations: retryCount,
          toolCalls: 0,
        },
        sentinelVerdict: verdicts[verdicts.length - 1],
      },
      verdicts,
      worktreePath,
    };
  }

  /**
   * Get the confidence score based on recent verdicts
   */
  calculateConfidence(verdicts: SentinelVerdict[]): {
    score: number;
    status: 'healthy' | 'warning' | 'error';
  } {
    if (verdicts.length === 0) {
      return { score: 100, status: 'healthy' };
    }

    // Weight recent verdicts more heavily
    let weightedSum = 0;
    let weightTotal = 0;

    for (let i = 0; i < verdicts.length; i++) {
      const weight = i + 1; // More recent = higher weight
      weightedSum += verdicts[i].qualityScore * weight;
      weightTotal += weight;
    }

    const score = Math.round(weightedSum / weightTotal);

    let status: 'healthy' | 'warning' | 'error';
    if (score >= 85) {
      status = 'healthy';
    } else if (score >= 70) {
      status = 'warning';
    } else {
      status = 'error';
    }

    return { score, status };
  }

  /**
   * Subscribe to agent loop events
   */
  on(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  /**
   * Simple hash for quick verification
   */
  private computeSimpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: MidnightEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }
}

/**
 * Create a new agent loop
 */
export function createAgentLoop(
  config: AgentLoopConfig,
  actor: ActorAgent,
  sentinel: SentinelAgent,
  worktreeManager: WorktreeManager,
  repoMapProvider: RepoMapProvider
): AgentLoop {
  return new AgentLoop(config, actor, sentinel, worktreeManager, repoMapProvider);
}

/**
 * Default agent loop configuration
 */
export const DEFAULT_LOOP_CONFIG: AgentLoopConfig = {
  maxRetries: 3,
  qualityThreshold: 85,
  enableVeto: true,
  enableRevert: true,
};
