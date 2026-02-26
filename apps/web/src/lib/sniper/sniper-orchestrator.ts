// ── Titan Plan Sniper — Orchestrator ─────────────────────────────────────────
// Main loop connecting all 7 roles with up to 8 parallel worker lanes.
// Flow: SCANNER → ARCHITECT → parallel(CODER → EXECUTOR → SENTINEL) → JUDGE

import { runScanner } from './sniper-scanner';
import { runArchitect } from './sniper-architect';
import { runWorker } from './sniper-worker';
import { runExecutor, type ToolCallFn } from './sniper-executor';
import { runSentinel } from './sniper-sentinel';
import { runJudge } from './sniper-judge';
import {
  DEFAULT_SNIPER_CONFIG,
  SniperCostTracker,
  generateLaneId,
  createEmptyLaneMetrics,
} from './sniper-model';
import type {
  SniperConfig,
  SniperDAG,
  SniperDAGNode,
  SniperLane,
  SniperResult,
  SniperEvent,
  ScanResult,
} from './sniper-model';

// ── Public interface ────────────────────────────────────────────────────────

export interface SniperOrchestrateOptions {
  goal: string;
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    phase: number;
    priority: string;
    tags: string[];
    blockedBy: string[];
  }>;
  workspacePath: string;
  fileTree: string;
  openFiles?: string[];
  cartographyContext?: string;
  config?: Partial<SniperConfig>;
  executeTool: ToolCallFn;
  readFile?: (path: string) => Promise<string>;
  onEvent: (event: SniperEvent) => void;
  onTaskStatusUpdate?: (taskId: string, status: string, errorLog?: string[]) => void;
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export async function orchestrateSniper(opts: SniperOrchestrateOptions): Promise<SniperResult> {
  const config: SniperConfig = { ...DEFAULT_SNIPER_CONFIG, ...opts.config };
  const costTracker = new SniperCostTracker();
  const startTime = Date.now();

  const emit = (type: string, data: Record<string, unknown>) => {
    opts.onEvent({
      type: type as SniperEvent['type'],
      timestamp: Date.now(),
      dagId: '',
      data,
    });
  };

  // ── Phase 1: SCANNER ──────────────────────────────────────────────────

  const scanResult: ScanResult = await runScanner(
    {
      workspacePath: opts.workspacePath,
      fileTree: opts.fileTree,
      openFiles: opts.openFiles,
      userGoal: opts.goal,
    },
    config,
    costTracker,
    emit,
  );

  // ── Phase 2: ARCHITECT ────────────────────────────────────────────────

  const dag: SniperDAG = await runArchitect(
    opts.tasks,
    scanResult,
    opts.goal,
    config,
    costTracker,
    emit,
    opts.cartographyContext,
  );

  // Update DAG ID in emit
  const emitWithDag = (type: string, data: Record<string, unknown>, laneId?: string, nodeId?: string) => {
    opts.onEvent({
      type: type as SniperEvent['type'],
      timestamp: Date.now(),
      dagId: dag.id,
      laneId,
      nodeId,
      data,
    });
  };

  // ── Phase 3: Parallel Execution Lanes ─────────────────────────────────

  const lanes: SniperLane[] = [];
  const completedNodeIds = new Set<string>();
  const failedNodeIds = new Set<string>();

  const getReadyNodes = (): SniperDAGNode[] => {
    return dag.nodes.filter(node =>
      node.status === 'pending' &&
      node.dependencies.every(depId =>
        completedNodeIds.has(depId) || failedNodeIds.has(depId)
      )
    );
  };

  const processLane = async (node: SniperDAGNode): Promise<SniperLane> => {
    const laneId = generateLaneId();
    const lane: SniperLane = {
      laneId,
      nodeId: node.id,
      status: 'CODING',
      reworkCount: 0,
      metrics: createEmptyLaneMetrics(),
      startedAt: Date.now(),
    };

    emitWithDag('lane_start', {
      title: node.title,
      taskType: node.taskType,
      risk: node.risk,
    }, laneId, node.id);

    opts.onTaskStatusUpdate?.(node.planTaskId, 'in_progress');

    let fileContents: Record<string, string> | undefined;
    if (opts.readFile && node.relevantFiles.length > 0) {
      fileContents = {};
      for (const fp of node.relevantFiles.slice(0, 5)) {
        try {
          fileContents[fp] = await opts.readFile(fp);
        } catch { /* file may not exist yet */ }
      }
    }

    for (let attempt = 0; attempt <= config.maxReworkAttempts; attempt++) {
      // CODER
      lane.status = 'CODING';
      emitWithDag('lane_status', { status: 'CODING', attempt }, laneId, node.id);

      const codeArtifact = await runWorker(node, scanResult, config, costTracker, fileContents);
      lane.codeArtifact = codeArtifact;

      // EXECUTOR
      lane.status = 'EXECUTING';
      emitWithDag('lane_status', { status: 'EXECUTING' }, laneId, node.id);

      const execResult = await runExecutor(codeArtifact, config, costTracker, opts.executeTool);
      codeArtifact.toolCalls = execResult.toolCalls;
      lane.metrics.toolCallCount += execResult.toolCalls.length;

      // SENTINEL
      lane.status = 'VERIFYING';
      emitWithDag('lane_status', { status: 'VERIFYING' }, laneId, node.id);

      const verdict = await runSentinel(node, codeArtifact, execResult.toolCalls, config, costTracker);
      lane.sentinelVerdict = verdict;

      if (verdict.pass) {
        lane.status = 'VERIFIED';
        lane.completedAt = Date.now();
        lane.metrics.durationMs = lane.completedAt - lane.startedAt;

        emitWithDag('lane_verified', {
          criteriaMetCount: verdict.criteriaMetCount,
          criteriaTotalCount: verdict.criteriaTotalCount,
        }, laneId, node.id);

        opts.onTaskStatusUpdate?.(node.planTaskId, 'completed');
        return lane;
      }

      // Rework if not passed and attempts remain
      if (attempt < config.maxReworkAttempts) {
        lane.status = 'REWORKING';
        lane.reworkCount++;
        emitWithDag('lane_rework', {
          attempt: attempt + 1,
          issues: verdict.issues,
        }, laneId, node.id);

        // Enrich the node description with sentinel feedback for the next attempt
        node.description += `\n\nPrevious attempt failed. Issues: ${verdict.issues.join('; ')}. Suggestions: ${verdict.suggestions.join('; ')}`;
      }
    }

    // All attempts exhausted
    lane.status = 'FAILED';
    lane.completedAt = Date.now();
    lane.metrics.durationMs = lane.completedAt - lane.startedAt;

    emitWithDag('lane_failed', {
      issues: lane.sentinelVerdict?.issues || [],
    }, laneId, node.id);

    opts.onTaskStatusUpdate?.(node.planTaskId, 'failed', lane.sentinelVerdict?.issues);
    return lane;
  };

  // Parallel execution loop
  while (completedNodeIds.size + failedNodeIds.size < dag.nodes.length) {
    const readyNodes = getReadyNodes();
    if (readyNodes.length === 0) {
      const remaining = dag.nodes.filter(n => n.status === 'pending');
      if (remaining.length > 0) {
        // All remaining nodes have unmet dependencies — mark as failed
        for (const node of remaining) {
          node.status = 'failed';
          failedNodeIds.add(node.id);
          opts.onTaskStatusUpdate?.(node.planTaskId, 'blocked');
        }
      }
      break;
    }

    // Launch up to maxConcurrentLanes in parallel
    const batch = readyNodes.slice(0, config.maxConcurrentLanes);
    for (const node of batch) {
      node.status = 'dispatched';
    }

    const results = await Promise.all(batch.map(node => processLane(node)));

    for (const lane of results) {
      lanes.push(lane);
      const node = dag.nodes.find(n => n.id === lane.nodeId)!;
      if (lane.status === 'VERIFIED' || lane.status === 'COMPLETE') {
        node.status = 'complete';
        completedNodeIds.add(node.id);
      } else {
        node.status = 'failed';
        failedNodeIds.add(node.id);
      }
    }
  }

  // ── Phase 4: JUDGE ────────────────────────────────────────────────────

  const judgeVerdict = await runJudge(dag, lanes, config, costTracker, emitWithDag);

  const totalDurationMs = Date.now() - startTime;

  const result: SniperResult = {
    success: failedNodeIds.size === 0 && judgeVerdict.pass,
    dagId: dag.id,
    totalNodes: dag.nodes.length,
    completedNodes: completedNodeIds.size,
    failedNodes: failedNodeIds.size,
    judgeVerdict,
    totalCost: costTracker.totalCost,
    totalDurationMs,
    summary: [
      `Plan Sniper completed: ${completedNodeIds.size}/${dag.nodes.length} tasks`,
      `Judge score: ${judgeVerdict.score}/10`,
      `Total cost: $${costTracker.totalCost.toFixed(4)}`,
      `Duration: ${Math.round(totalDurationMs / 1000)}s`,
      costTracker.getSummary(),
    ].join('\n'),
  };

  emitWithDag('pipeline_complete', {
    success: result.success,
    totalNodes: result.totalNodes,
    completedNodes: result.completedNodes,
    failedNodes: result.failedNodes,
    judgeScore: judgeVerdict.score,
    totalCost: result.totalCost,
    durationMs: totalDurationMs,
  });

  return result;
}
