/**
 * PROTOCOL AGENT LOOP — Full Midnight Protocol Team Orchestration
 *
 * Pipeline: Foreman → Nerd Squad → Cleanup Crew → Sentinel Council
 * With escalation, double-check loops, and consensus voting.
 *
 * Drop-in replacement for the original AgentLoop — same executeTask() signature.
 */

import type {
  MidnightTask,
  TaskResult,
  SentinelVerdict,
  MidnightEvent,
  ProjectDNA,
} from '../types.js';
import type { LLMClient, ToolExecutor } from '../agents/actor.js';
import type { WorktreeManager, RepoMapProvider } from '../agents/agent-loop.js';
import {
  ProtocolCostTracker,
  DEFAULT_PROTOCOL_CONFIG,
  NERD_ESCALATION_ORDER,
  type MidnightProtocolConfig,
  type ProtocolEvent,
  type ProtocolTaskResult,
} from './midnight-protocol.js';
import { Foreman, type ForemanPlan } from './foreman.js';
import { NerdSquad, type NerdSquadConfig } from './nerd-squad.js';
import { CleanupCrew } from './cleanup-crew.js';
import { SentinelCouncil } from './sentinel-council.js';

type EventCallback = (event: MidnightEvent | ProtocolEvent) => void;

export class ProtocolAgentLoop {
  private config: MidnightProtocolConfig;
  private foreman: Foreman;
  private nerdSquad: NerdSquad;
  private cleanupCrew: CleanupCrew;
  private sentinelCouncil: SentinelCouncil;
  private worktreeManager: WorktreeManager;
  private repoMapProvider: RepoMapProvider;
  private toolExecutor: ToolExecutor;
  private costTracker: ProtocolCostTracker;
  private eventListeners: Set<EventCallback> = new Set();
  private lastVerifiedHash: string | null = null;

  constructor(
    llmClient: LLMClient,
    toolExecutor: ToolExecutor,
    worktreeManager: WorktreeManager,
    repoMapProvider: RepoMapProvider,
    nerdSquadConfig: NerdSquadConfig,
    config?: Partial<MidnightProtocolConfig>
  ) {
    this.config = { ...DEFAULT_PROTOCOL_CONFIG, ...config };
    this.toolExecutor = toolExecutor;
    this.worktreeManager = worktreeManager;
    this.repoMapProvider = repoMapProvider;
    this.costTracker = new ProtocolCostTracker();

    const emitProtocol = (event: ProtocolEvent) => this.emitProtocol(event);

    this.foreman = new Foreman(llmClient, this.costTracker);
    this.nerdSquad = new NerdSquad(llmClient, toolExecutor, this.costTracker, nerdSquadConfig, emitProtocol);
    this.cleanupCrew = new CleanupCrew(llmClient, toolExecutor, this.costTracker, this.config.maxCleanupCycles, emitProtocol);
    this.sentinelCouncil = new SentinelCouncil(llmClient, this.costTracker, this.config.qualityThreshold, this.config.consensusRequired, emitProtocol);
  }

  /**
   * Decompose a project using the Foreman (called once per project).
   */
  async decomposeProject(dna: ProjectDNA): Promise<ForemanPlan> {
    if (!this.config.enableForeman) {
      return {
        projectSummary: 'Foreman disabled — using raw tasks from definition_of_done',
        estimatedComplexity: 'medium',
        tasks: [],
        architectureNotes: '',
      };
    }

    this.emitProtocol({
      type: 'protocol_squad_active',
      squad: 'foreman',
      role: 'foreman',
      name: 'The Foreman',
    });

    return this.foreman.decompose(
      dna.ideaMd,
      JSON.stringify(dna.techStackJson),
      dna.definitionOfDoneMd
    );
  }

  /**
   * Execute a single task through the full protocol pipeline.
   * Same signature as the original AgentLoop.executeTask() for drop-in compatibility.
   */
  async executeTask(
    task: MidnightTask,
    projectContext: string,
    _projectPlan: string,
    definitionOfDone: string
  ): Promise<{
    success: boolean;
    result: TaskResult;
    verdicts: SentinelVerdict[];
    worktreePath: string;
    protocolResult?: ProtocolTaskResult;
  }> {
    this.costTracker.reset();
    const verdicts: SentinelVerdict[] = [];
    let worktreePath = '';

    // Create isolated worktree
    try {
      worktreePath = await this.worktreeManager.create(
        task.worktreePath || '',
        `midnight-${task.id}`
      );
    } catch {
      worktreePath = task.worktreePath || '';
    }

    this.emit({ type: 'task_started', task });

    let sentinelFeedback: string | undefined;
    let lastNerdResult: TaskResult | null = null;
    let allEscalations: ProtocolTaskResult['escalations'] = [];

    // The outer loop: Nerd Squad → Cleanup → Sentinel → (repeat if rejected)
    for (let attempt = 0; attempt < this.config.maxNerdEscalations; attempt++) {
      // ─── PHASE 1: NERD SQUAD ───
      const nerdResult = await this.nerdSquad.executeTask(task, projectContext, sentinelFeedback);
      lastNerdResult = nerdResult.taskResult;
      allEscalations = [...allEscalations, ...nerdResult.escalations];

      if (!nerdResult.success) {
        // All nerds exhausted — lock the task
        this.emit({
          type: 'task_locked',
          task,
          reason: 'All Nerd Squad members failed',
        });
        break;
      }

      // ─── PHASE 2: CLEANUP CREW ───
      let cleanupReport = null;
      if (this.config.enableCleanupCrew) {
        const gitDiff = await this.worktreeManager.getGitDiff(worktreePath);
        const repoMap = await this.repoMapProvider.getRepoMap(worktreePath);
        cleanupReport = await this.cleanupCrew.sweep(gitDiff, repoMap);
      }

      // ─── PHASE 3: SENTINEL COUNCIL ───
      const postCleanupDiff = await this.worktreeManager.getGitDiff(worktreePath);
      const repoMap = await this.repoMapProvider.getRepoMap(worktreePath);

      const consensus = await this.sentinelCouncil.review(
        postCleanupDiff,
        task.description,
        definitionOfDone,
        repoMap,
        task.id
      );

      // Collect verdicts from consensus for compatibility
      const chiefVerdict: SentinelVerdict = {
        id: `verdict-chief-${Date.now()}`,
        taskId: task.id,
        qualityScore: consensus.chiefScore,
        passed: consensus.chiefPassed,
        thinkingEffort: 'max',
        auditLog: { traceability: { mapped: [], missing: [], unplannedAdditions: [] }, architecturalSins: [], slopPatternsDetected: [] },
        correctionDirective: consensus.chiefPassed ? null : consensus.chiefFeedback,
        merkleVerificationHash: '',
        createdAt: Date.now(),
      };
      verdicts.push(chiefVerdict);
      this.emit({ type: 'sentinel_verdict', verdict: chiefVerdict });

      if (consensus.finalPassed) {
        // APPROVED by Sentinel Council
        this.lastVerifiedHash = this.computeSimpleHash(postCleanupDiff);

        const protocolResult: ProtocolTaskResult = {
          success: true,
          escalations: allEscalations,
          cleanupReport,
          consensus,
          totalTokensUsed: this.costTracker.totalTokens,
          totalCostUsd: this.costTracker.totalCost,
          activeNerd: nerdResult.activeNerd,
          output: nerdResult.output,
        };

        this.emitProtocol({
          type: 'protocol_cost_update',
          totalCostUsd: this.costTracker.totalCost,
          breakdown: this.costTracker.breakdown,
        });
        this.emitProtocol({ type: 'protocol_task_complete', result: protocolResult });

        const taskResult: TaskResult = {
          ...nerdResult.taskResult,
          sentinelVerdict: chiefVerdict,
        };

        this.emit({ type: 'task_completed', task, result: taskResult });

        return {
          success: true,
          result: taskResult,
          verdicts,
          worktreePath,
          protocolResult,
        };
      }

      // REJECTED — prepare feedback for next round
      sentinelFeedback = consensus.combinedFeedback;

      this.emit({
        type: 'sentinel_veto',
        taskId: task.id,
        reason: consensus.combinedFeedback.slice(0, 300),
      });

      // Revert worktree if we have a verified hash
      if (this.lastVerifiedHash) {
        try {
          await this.worktreeManager.revert(worktreePath, this.lastVerifiedHash);
          this.emit({ type: 'worktree_reverted', taskId: task.id, toHash: this.lastVerifiedHash });
        } catch {
          // continue without revert
        }
      }
    }

    // All protocol attempts exhausted
    this.emit({
      type: 'task_locked',
      task,
      reason: `Midnight Protocol exhausted after ${this.config.maxNerdEscalations} full cycles`,
    });

    const finalResult: TaskResult = lastNerdResult || {
      success: false,
      output: 'Protocol exhausted',
      artifacts: [],
      errors: [{ code: 'PROTOCOL_EXHAUSTED', message: 'All protocol cycles failed', recoverable: false }],
      metrics: { tokensUsed: this.costTracker.totalTokens, latencyMs: 0, iterations: 0, toolCalls: 0 },
    };

    return {
      success: false,
      result: finalResult,
      verdicts,
      worktreePath,
      protocolResult: {
        success: false,
        escalations: allEscalations,
        cleanupReport: null,
        consensus: null,
        totalTokensUsed: this.costTracker.totalTokens,
        totalCostUsd: this.costTracker.totalCost,
        activeNerd: NERD_ESCALATION_ORDER[NERD_ESCALATION_ORDER.length - 1],
        output: finalResult.output,
      },
    };
  }

  /**
   * Get confidence score based on recent verdicts (same API as original AgentLoop).
   */
  calculateConfidence(verdicts: SentinelVerdict[]): { score: number; status: 'healthy' | 'warning' | 'error' } {
    if (verdicts.length === 0) return { score: 100, status: 'healthy' };

    let weightedSum = 0;
    let weightTotal = 0;
    for (let i = 0; i < verdicts.length; i++) {
      const weight = i + 1;
      weightedSum += verdicts[i].qualityScore * weight;
      weightTotal += weight;
    }

    const score = Math.round(weightedSum / weightTotal);
    const status = score >= 85 ? 'healthy' : score >= 70 ? 'warning' : 'error';
    return { score, status };
  }

  /**
   * Subscribe to events (both MidnightEvent and ProtocolEvent).
   */
  on(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  getCostTracker(): ProtocolCostTracker {
    return this.costTracker;
  }

  private emit(event: MidnightEvent): void {
    for (const listener of this.eventListeners) {
      try { listener(event); } catch { /* ignore */ }
    }
  }

  private emitProtocol(event: ProtocolEvent): void {
    for (const listener of this.eventListeners) {
      try { listener(event); } catch { /* ignore */ }
    }
  }

  private computeSimpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}
