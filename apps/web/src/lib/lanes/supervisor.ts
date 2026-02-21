/**
 * Titan Protocol v2 — Supervisor (Governor) Agent
 *
 * The master orchestrator. The Supervisor:
 *   1. Decomposes user goals into a Task Manifest DAG
 *   2. Dispatches ready nodes as Worker lanes
 *   3. Monitors lane statuses (event-driven)
 *   4. Routes completed work to Verifiers
 *   5. Merges VERIFIED lanes via the Merge Arbiter
 *   6. Handles failures (rework or escalate)
 *   7. Resolves conflicts between lanes
 *   8. Writes memory entries for architectural decisions
 *
 * The Supervisor NEVER reads raw worker output (Law 1).
 * The Supervisor NEVER executes tools or writes code (Law 5).
 */

import type {
  Lane,
  TaskManifest,
  DAGNode,
  SubtaskSpec,
  LaneEvent,
  ProtocolV2Config,
} from './lane-model';

import { DEFAULT_PROTOCOL_V2_CONFIG } from './lane-model';
import { laneStore } from './lane-store';
import { getReadyNodes, getManifestProgress, validateDAG } from './task-manifest';
import { executeWorkerLane, type WorkerExecutionCallbacks } from './worker';
import { executeVerifierLane } from './verifier';
import { attemptMerge } from './merge-arbiter';
import { resolveConflict, applyResolution } from './conflict-resolver';
import { MODEL_REGISTRY } from '@/lib/model-registry';

// ─── Supervisor LLM Infrastructure ──────────────────────────────────────────

function envValue(...names: string[]): string {
  for (const name of names) {
    const raw = process.env[name];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return '';
}

function resolveProviderModelId(modelId: string): string {
  const entry = MODEL_REGISTRY.find(m => m.id === modelId);
  return entry?.providerModelId || modelId;
}

async function callSupervisorLLM(
  messages: Array<{ role: string; content: string }>,
  modelId: string,
): Promise<string> {
  const openRouterKey = envValue('OPENROUTER_API_KEY');
  const litellmBase = envValue('TITAN_LITELLM_BASE_URL', 'LITELLM_PROXY_URL');
  const litellmKey = envValue('TITAN_LITELLM_API_KEY', 'LITELLM_MASTER_KEY');

  let apiUrl: string;
  let headers: Record<string, string>;
  const providerModelId = resolveProviderModelId(modelId);

  if (openRouterKey) {
    apiUrl = (envValue('OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1') + '/chat/completions';
    headers = {
      'Authorization': `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://titan-ai.up.railway.app',
      'X-Title': 'Titan AI - Supervisor',
    };
  } else if (litellmBase) {
    apiUrl = litellmBase.replace(/\/$/, '') + '/chat/completions';
    headers = {
      'Content-Type': 'application/json',
      ...(litellmKey ? { 'Authorization': `Bearer ${litellmKey}` } : {}),
    };
  } else {
    throw new Error('No LLM provider configured');
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: providerModelId,
      messages,
      temperature: 0,
      max_tokens: 16000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supervisor LLM call failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ─── Goal Decomposition ─────────────────────────────────────────────────────

const DECOMPOSITION_PROMPT = `You are the Supervisor (Governor) of the Titan Governance Protocol v2.

"I have read and I am bound by the Titan Governance Protocol."

Your job is to decompose a user's high-level goal into a Task Manifest: a Directed Acyclic Graph (DAG) of parallel and sequential subtasks.

Each subtask will be assigned to an independent Worker (Coder) lane. Subtasks that can be done in parallel SHOULD be parallel. Subtasks that depend on another's output must declare that dependency.

=== RULES ===
1. Each subtask must be atomic: one clear coding task that a single Coder can complete.
2. Each subtask must have clear success criteria and verification criteria.
3. List the relevant files the Coder will need to read/modify.
4. If two subtasks modify the same file, they MUST be sequential (one depends on the other) OR you must structure them so they modify different parts.
5. Maximize parallelism while respecting real dependencies.
6. No subtask should be trivially small (e.g., "add a comment") or impossibly large (e.g., "build the entire feature").

=== OUTPUT FORMAT (JSON) ===
Return a JSON object with this exact structure:
{
  "subtasks": [
    {
      "id": "subtask-1",
      "title": "Short title",
      "description": "Detailed description of what to implement",
      "relevantFiles": ["path/to/file1.ts", "path/to/file2.ts"],
      "successCriteria": ["Criterion 1", "Criterion 2"],
      "verificationCriteria": ["What the Verifier should check"],
      "dependencies": [],
      "constraints": ["Any constraints"]
    },
    {
      "id": "subtask-2",
      "title": "Another task",
      "description": "...",
      "relevantFiles": ["..."],
      "successCriteria": ["..."],
      "verificationCriteria": ["..."],
      "dependencies": ["subtask-1"],
      "constraints": []
    }
  ]
}

dependencies is an array of subtask IDs that must complete (MERGED) before this subtask can start.
An empty dependencies array means the subtask can start immediately (parallel with other zero-dependency tasks).`;

export interface DecomposedSubtask {
  id: string;
  title: string;
  description: string;
  relevantFiles: string[];
  successCriteria: string[];
  verificationCriteria: string[];
  dependencies: string[];
  constraints: string[];
}

export async function decomposeGoal(
  goal: string,
  workspaceContext: string,
  config: ProtocolV2Config = DEFAULT_PROTOCOL_V2_CONFIG,
): Promise<DecomposedSubtask[]> {
  const messages = [
    { role: 'system', content: DECOMPOSITION_PROMPT },
    { role: 'user', content: `Goal: ${goal}\n\nWorkspace context:\n${workspaceContext}` },
  ];

  const rawResponse = await callSupervisorLLM(messages, config.supervisorModel);

  let parsed: { subtasks: DecomposedSubtask[] };
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Supervisor returned non-JSON response');
    parsed = JSON.parse(jsonMatch[0]);
  }

  if (!parsed.subtasks || !Array.isArray(parsed.subtasks) || parsed.subtasks.length === 0) {
    throw new Error('Supervisor produced empty task manifest');
  }

  return parsed.subtasks;
}

// ─── Orchestration Engine ───────────────────────────────────────────────────

export interface OrchestrateCallbacks {
  onEvent: (event: LaneEvent) => void;
  executeToolCall: (tool: string, args: Record<string, unknown>) => Promise<{ success: boolean; output: string; error?: string }>;
  baseUrl: string;
  workspacePath: string;
}

export interface OrchestrationResult {
  manifestId: string;
  success: boolean;
  lanesTotal: number;
  lanesMerged: number;
  lanesFailed: number;
  totalCost: number;
  totalDurationMs: number;
}

/**
 * Main orchestration loop. This is the Supervisor's execution engine.
 *
 * Flow:
 *   1. Decompose goal into DAG
 *   2. Create manifest and lanes for ready nodes
 *   3. Execute workers in parallel (up to maxConcurrentWorkers)
 *   4. Route completed workers to verifiers
 *   5. Merge verified lanes
 *   6. Handle failures and conflicts
 *   7. Repeat until manifest is complete or halted
 */
export async function orchestrate(
  goal: string,
  sessionId: string,
  workspaceContext: string,
  callbacks: OrchestrateCallbacks,
  config: ProtocolV2Config = DEFAULT_PROTOCOL_V2_CONFIG,
  abortSignal?: AbortSignal,
): Promise<OrchestrationResult> {
  const startTime = Date.now();

  // Step 1: Decompose the goal
  callbacks.onEvent({
    type: 'supervisor_decision',
    timestamp: Date.now(),
    manifest_id: '',
    data: { decision: 'decomposing_goal', goal },
  });

  const subtasks = await decomposeGoal(goal, workspaceContext, config);

  // Step 2: Create the manifest
  const dagNodes: DAGNode[] = subtasks.map(st => ({
    id: st.id,
    spec: {
      title: st.title,
      description: st.description,
      relevantFiles: st.relevantFiles,
      successCriteria: st.successCriteria,
      verificationCriteria: st.verificationCriteria,
      constraints: st.constraints,
    },
    dependencies: st.dependencies,
    status: 'PENDING' as const,
  }));

  validateDAG(dagNodes);

  const manifest = laneStore.createManifest(goal, sessionId, dagNodes);
  const manifestId = manifest.id;

  // Subscribe to events for this manifest
  const unsub = laneStore.subscribeToManifest(manifestId, callbacks.onEvent);

  try {
    // Step 3: Main orchestration loop
    let iterationCount = 0;
    const maxIterations = 50;

    while (iterationCount < maxIterations) {
      iterationCount++;

      if (abortSignal?.aborted) {
        laneStore.updateManifestStatus(manifestId, 'CANCELLED');
        break;
      }

      const currentManifest = laneStore.getManifest(manifestId);
      if (!currentManifest || currentManifest.status !== 'ACTIVE') break;

      const progress = getManifestProgress(currentManifest.nodes);
      if (progress.isComplete) {
        laneStore.updateManifestStatus(manifestId, progress.isSuccessful ? 'COMPLETE' : 'FAILED');
        break;
      }

      // Dispatch ready nodes as worker lanes
      const readyNodes = getReadyNodes(currentManifest.nodes);
      const currentWorking = laneStore.getWorkingLaneCount();
      const slotsAvailable = config.maxConcurrentWorkers - currentWorking;

      const toDispatch = readyNodes.slice(0, Math.max(0, slotsAvailable));

      const workerPromises: Promise<void>[] = [];

      for (const node of toDispatch) {
        if (abortSignal?.aborted) break;

        laneStore.updateDAGNodeStatus(manifestId, node.id, 'DISPATCHED');

        const lane = laneStore.createLane(
          manifestId,
          node.id,
          node.spec,
          config.defaultWorkerModel,
          config.defaultVerifierModel,
          `lane/${node.id}`,
        );

        laneStore.transitionLane(lane.lane_id, 'PROVISIONING', 'supervisor', 'Preparing lane environment');
        laneStore.transitionLane(lane.lane_id, 'ASSIGNED', 'supervisor', `Assigned to worker model: ${config.defaultWorkerModel}`);

        const workerCallbacks: WorkerExecutionCallbacks = {
          onToken: (lId, token) => {
            laneStore.emitCustom('lane_token', manifestId, lId, { content: token });
          },
          onToolCall: (lId, tool, args) => {
            laneStore.emitCustom('lane_tool_call', manifestId, lId, { tool, args });
          },
          onToolResult: (lId, tool, result, success) => {
            laneStore.emitCustom('lane_tool_call', manifestId, lId, { tool, result: result.slice(0, 1000), success });
          },
          executeToolCall: callbacks.executeToolCall,
        };

        // Run worker, then verifier, then attempt merge — all in sequence per lane
        const lanePromise = (async () => {
          try {
            await executeWorkerLane(lane, workerCallbacks);

            const updatedLane = laneStore.getLane(lane.lane_id);
            if (!updatedLane || updatedLane.status !== 'PENDING_VERIFY') return;

            await executeVerifierLane(updatedLane);

            const verifiedLane = laneStore.getLane(lane.lane_id);
            if (!verifiedLane || verifiedLane.status !== 'VERIFIED') {
              // Handle rejection
              if (verifiedLane?.status === 'REJECTED') {
                await handleRejection(verifiedLane, manifestId, config, callbacks);
              }
              return;
            }

            // Attempt merge
            const mergeResult = await attemptMerge(
              lane.lane_id,
              manifestId,
              callbacks.baseUrl,
              callbacks.workspacePath,
              true, // Skip integration validation for speed in v1
            );

            if (!mergeResult.success && mergeResult.conflictsDetected) {
              await handleConflict(lane.lane_id, manifestId, config);
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown worker error';
            try {
              laneStore.transitionLane(lane.lane_id, 'FAILED', 'system', `Unrecoverable error: ${msg}`);
              laneStore.updateDAGNodeStatus(manifestId, node.id, 'FAILED', lane.lane_id);
            } catch {
              // lane may already be terminal
            }
          }
        })();

        workerPromises.push(lanePromise);
      }

      // Wait for at least one lane to complete before checking for more work
      if (workerPromises.length > 0) {
        await Promise.race([
          Promise.allSettled(workerPromises),
          new Promise(resolve => setTimeout(resolve, 2000)),
        ]);
      } else {
        // No work to dispatch, check if there are active lanes
        const activeLanes = laneStore.getActiveLanesByManifest(manifestId);
        if (activeLanes.length === 0) {
          // No active lanes and no ready nodes — we're done or stuck
          const latestManifest = laneStore.getManifest(manifestId);
          if (latestManifest) {
            const p = getManifestProgress(latestManifest.nodes);
            if (p.isComplete) {
              laneStore.updateManifestStatus(manifestId, p.isSuccessful ? 'COMPLETE' : 'FAILED');
            }
          }
          break;
        }

        // Wait for active lanes to progress
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Wait for all parallel workers in this batch
      if (workerPromises.length > 0) {
        await Promise.allSettled(workerPromises);
      }
    }

    const stats = laneStore.getStats(manifestId);
    const finalManifest = laneStore.getManifest(manifestId);

    return {
      manifestId,
      success: finalManifest?.status === 'COMPLETE',
      lanesTotal: stats.totalLanes,
      lanesMerged: stats.byStatus['MERGED'] || 0,
      lanesFailed: (stats.byStatus['FAILED'] || 0) + (stats.byStatus['ARCHIVED'] || 0),
      totalCost: stats.totalCost,
      totalDurationMs: Date.now() - startTime,
    };
  } finally {
    unsub();
  }
}

// ─── Failure Handling ───────────────────────────────────────────────────────

async function handleRejection(
  lane: Lane,
  manifestId: string,
  config: ProtocolV2Config,
  _callbacks: OrchestrateCallbacks,
): Promise<void> {
  const failureCount = laneStore.incrementFailureCount(lane.lane_id);

  if (failureCount >= config.maxReworkAttempts) {
    // Escalation: max failures reached (Law 10)
    laneStore.transitionLane(lane.lane_id, 'FAILED', 'supervisor',
      `Max rework attempts (${config.maxReworkAttempts}) reached. Escalating.`);
    laneStore.updateDAGNodeStatus(manifestId, lane.subtask_node_id, 'FAILED', lane.lane_id);

    laneStore.emitCustom('escalation', manifestId, lane.lane_id, {
      reason: 'max_failures',
      failureCount,
      maxAttempts: config.maxReworkAttempts,
      lastVerifierReport: lane.artifacts.verifierReport?.rationale?.slice(0, 500),
    });

    return;
  }

  // Rework: discard artifact, re-queue (Law 3: Fail-Gate)
  laneStore.transitionLane(lane.lane_id, 'PENDING_REWORK', 'supervisor',
    `Rework attempt ${failureCount + 1}/${config.maxReworkAttempts}. Verifier rationale: ${lane.artifacts.verifierReport?.rationale?.slice(0, 200)}`);

  // Clear the old artifact (Law 3: artifacts are discarded, not patched)
  laneStore.updateArtifacts(lane.lane_id, {
    workerOutput: undefined,
    verifierReport: undefined,
  });

  // Re-enter the cycle
  laneStore.transitionLane(lane.lane_id, 'ASSIGNED', 'supervisor',
    `Re-assigned for rework. Previous failure rationale attached.`);
}

// ─── Conflict Handling ──────────────────────────────────────────────────────

async function handleConflict(
  laneId: string,
  manifestId: string,
  _config: ProtocolV2Config,
): Promise<void> {
  const lane = laneStore.getLane(laneId);
  if (!lane || lane.status !== 'MERGE_CONFLICT') return;

  // Find the conflicting merged lane(s)
  const mergedLanes = laneStore.getLanesByManifest(manifestId)
    .filter(l => l.status === 'MERGED');

  const conflictingMergedLane = mergedLanes.find(merged => {
    const mergedFiles = new Set(merged.files_touched.map(f => f.filePath));
    return lane.files_touched.some(f => mergedFiles.has(f.filePath));
  });

  if (!conflictingMergedLane) {
    // No actual conflict found, retry merge
    laneStore.transitionLane(laneId, 'PENDING_RECONCILIATION', 'supervisor', 'Conflict resolved — no actual overlap found');
    return;
  }

  // Default strategy: reconcile via new lane
  const resolution = resolveConflict(lane, conflictingMergedLane, 'reconcile');
  applyResolution(resolution, lane, conflictingMergedLane, manifestId);

  if (resolution.reconciliationSpec) {
    // Add reconciliation node to the manifest
    const manifest = laneStore.getManifest(manifestId);
    if (manifest) {
      const newNode = resolution.reconciliationSpec.dagNode;
      manifest.nodes.push(newNode);
      manifest.updated_at = Date.now();
    }
  }
}

// ─── Barrel Export ──────────────────────────────────────────────────────────

export { DEFAULT_PROTOCOL_V2_CONFIG };
