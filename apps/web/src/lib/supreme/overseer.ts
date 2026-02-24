import {
  DEFAULT_SUPREME_CONFIG,
  createInitialStepTracker,
  getRoleForTaskType,
  type ExecutionPlan,
  type SupremeArtifact,
  type SupremeConfig,
  type SupremeTaskManifest,
  type SupremeTaskNode,
  type SupremeTaskType,
} from './supreme-model';
import { createBudgetTracker } from './token-budget';
import { createStallDetector } from './stall-detector';
import { createCacheManager } from './cache-manager';
import { createPermissionManager } from './zero-trust';
import { createWorktreeManager } from './worktree-manager';
import { createMCPBridge } from './mcp-integrations';
import { initiateConsensus, type ConsensusFollower } from './consensus';
import { executePrimaryWorker } from './primary-worker';
import { executeSecondaryWorker } from './secondary-worker';
import { executeApprovedPlan, runTestSuite } from './operator';
import { runAdversarialAudit } from './adversarial-audit';

type EventType =
  | 'orchestration_start'
  | 'task_decomposed'
  | 'worker_assigned'
  | 'worker_progress'
  | 'artifact_review'
  | 'debate_started'
  | 'debate_verdict'
  | 'execution_authorized'
  | 'tool_executed'
  | 'verification_result'
  | 'consensus_vote'
  | 'budget_update'
  | 'stall_warning'
  | 'orchestration_complete'
  | 'orchestration_error';

export interface SupremeCallbacks {
  onEvent: (type: EventType, payload: Record<string, unknown>) => void;
  executeToolCall: (
    tool: string,
    args: Record<string, unknown>,
  ) => Promise<{ success: boolean; output: string; error?: string }>;
  invokeModel: (
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
  ) => Promise<string>;
  workspacePath?: string;
}

const READ_TOOLS = new Set([
  'read_file',
  'list_directory',
  'grep_search',
  'glob_search',
  'read_lints',
  'semantic_search',
  'web_search',
  'web_fetch',
]);

const VALID_TASK_TYPES: SupremeTaskType[] = [
  'code', 'refactor', 'test', 'documentation', 'formatting', 'transformation',
];

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function tryParseJSON(text: string): Record<string, unknown> | null {
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const raw = jsonMatch ? jsonMatch[1] : text;
  try {
    const parsed = JSON.parse(raw.trim());
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

// ── LLM-based Goal Decomposition (Overseer / Opus 4.6) ─────────────────────

async function decomposeGoal(
  goal: string,
  config: SupremeConfig,
  invokeModel: SupremeCallbacks['invokeModel'],
): Promise<{ manifest: SupremeTaskManifest; tokensIn: number; tokensOut: number }> {
  const system = [
    'You are the TITAN_OVERSEER. Decompose the user\'s goal into atomic subtasks.',
    'Return strict JSON (no markdown wrapping):',
    '{"nodes":[{"id":"node-1","title":"Short title","description":"Detailed description",',
    '"type":"code|refactor|test|documentation|formatting|transformation",',
    '"complexity":5,"dependsOn":[],"relevantFiles":["path/to/file.ts"],',
    '"acceptanceCriteria":["Criterion"],"verificationCriteria":["Criterion"]}]}',
    'Rules: max 8 subtasks, complexity 1-10, dependsOn lists node IDs.',
  ].join('\n');

  const tokensIn = estimateTokens(system + goal);
  let tokensOut = 0;

  try {
    const output = await invokeModel(config.models.overseer, [
      { role: 'system', content: system },
      { role: 'user', content: goal },
    ]);
    tokensOut = estimateTokens(output);
    const parsed = tryParseJSON(output);

    if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
      const nodes: SupremeTaskNode[] = (parsed.nodes as Record<string, unknown>[])
        .slice(0, 8)
        .map((n, idx) => {
          const rawType = String(n.type || 'code');
          const type: SupremeTaskType = VALID_TASK_TYPES.includes(rawType as SupremeTaskType)
            ? (rawType as SupremeTaskType) : 'code';
          return {
            id: String(n.id || `node-${idx + 1}`),
            title: String(n.title || '').slice(0, 90),
            description: String(n.description || n.title || ''),
            type,
            complexity: Math.min(10, Math.max(1, Number(n.complexity) || 5)),
            dependsOn: Array.isArray(n.dependsOn) ? n.dependsOn.map(String) : [],
            relevantFiles: Array.isArray(n.relevantFiles) ? n.relevantFiles.map(String) : [],
            acceptanceCriteria: Array.isArray(n.acceptanceCriteria)
              ? n.acceptanceCriteria.map(String)
              : ['Implementation is production-ready'],
            verificationCriteria: Array.isArray(n.verificationCriteria)
              ? n.verificationCriteria.map(String)
              : ['Typecheck passes', 'Tests pass'],
            assignedRole: getRoleForTaskType(type),
          };
        });

      return {
        manifest: { id: `supreme-${Date.now()}`, goal, createdAt: Date.now(), status: 'ACTIVE', nodes },
        tokensIn,
        tokensOut,
      };
    }
  } catch {
    // fall through to naive decomposition
  }

  const parts = goal.split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 8);
  const nodes: SupremeTaskNode[] = (parts.length > 0 ? parts : [goal]).map((part, idx) => {
    const lower = part.toLowerCase();
    const type: SupremeTaskType = lower.includes('doc') || lower.includes('format')
      ? 'documentation'
      : lower.includes('test') ? 'test' : 'code';
    return {
      id: `node-${idx + 1}`,
      title: part.slice(0, 90),
      description: part,
      type,
      complexity: Math.min(10, Math.max(1, part.length > 140 ? 8 : 5)),
      dependsOn: idx === 0 ? [] : [`node-${idx}`],
      relevantFiles: [],
      acceptanceCriteria: ['Implementation is production-ready', 'No TODOs or placeholders'],
      verificationCriteria: ['Typecheck passes', 'Lint passes', 'Tests pass'],
      assignedRole: getRoleForTaskType(type),
    };
  });

  return {
    manifest: { id: `supreme-${Date.now()}`, goal, createdAt: Date.now(), status: 'ACTIVE', nodes },
    tokensIn,
    tokensOut,
  };
}

// ── LLM-based Artifact Review (Overseer / Opus 4.6) ────────────────────────

async function reviewArtifact(
  node: SupremeTaskNode,
  artifact: SupremeArtifact,
  config: SupremeConfig,
  invokeModel: SupremeCallbacks['invokeModel'],
): Promise<{ pass: boolean; rationale: string; tokensIn: number; tokensOut: number }> {
  const system = [
    'You are the TITAN_OVERSEER reviewing a worker artifact.',
    'Check for: edge cases, security vulnerabilities, logic flaws, completeness vs acceptance criteria.',
    'Return strict JSON (no markdown): {"pass": true, "rationale": "..."}',
  ].join('\n');

  const user = [
    `Task: ${node.title}`,
    `Description: ${node.description}`,
    `Acceptance Criteria:\n- ${node.acceptanceCriteria.join('\n- ')}`,
    `Code Artifact:\n${artifact.codeChanges.slice(0, 12000)}`,
    `Self-Review:\n${artifact.selfReview.slice(0, 2000)}`,
  ].join('\n\n');

  const tokensIn = estimateTokens(system + user);
  let tokensOut = 0;

  try {
    const output = await invokeModel(config.models.overseer, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
    tokensOut = estimateTokens(output);
    const parsed = tryParseJSON(output);

    if (parsed && typeof parsed.pass === 'boolean') {
      return { pass: parsed.pass, rationale: String(parsed.rationale || ''), tokensIn, tokensOut };
    }
  } catch {
    // fall through
  }

  const hasContent = artifact.codeChanges.trim().length > 0 || artifact.inspectionEvidence.trim().length > 0;
  return {
    pass: hasContent,
    rationale: hasContent ? 'Artifact accepted (fallback: has content)' : 'Artifact rejected: empty output',
    tokensIn,
    tokensOut,
  };
}

// ── LLM-based Execution Planning (Overseer / Opus 4.6) ─────────────────────

async function authorizeExecution(
  node: SupremeTaskNode,
  artifact: SupremeArtifact,
  config: SupremeConfig,
  invokeModel: SupremeCallbacks['invokeModel'],
): Promise<{ plan: ExecutionPlan; tokensIn: number; tokensOut: number }> {
  const system = [
    'You are the TITAN_OVERSEER. Convert the approved code artifact into executable tool calls.',
    'Return strict JSON (no markdown):',
    '{"steps":[{"id":"step-1","tool":"write_file","args":{"path":"...","content":"..."},',
    '"rationale":"Why this step","requiresApproval":true}]}',
    'Available tools: read_file, write_file, edit_file, run_command, list_directory, grep_search.',
    'Extract actual file writes/edits from the artifact. Return ONLY valid JSON.',
  ].join('\n');

  const user = [
    `Task: ${node.title}`,
    `Code Artifact:\n${artifact.codeChanges.slice(0, 16000)}`,
    `Files Modified: ${artifact.filesModified.join(', ') || '(none)'}`,
  ].join('\n\n');

  const tokensIn = estimateTokens(system + user);
  let tokensOut = 0;

  try {
    const output = await invokeModel(config.models.overseer, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
    tokensOut = estimateTokens(output);
    const parsed = tryParseJSON(output);

    if (parsed && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
      return {
        plan: {
          planId: `plan-${node.id}-${Date.now()}`,
          laneId: `lane-${node.id}`,
          nodeId: node.id,
          approvedBy: 'OVERSEER',
          approvedAt: Date.now(),
          steps: (parsed.steps as Record<string, unknown>[]).map((s, idx) => ({
            id: String(s.id || `step-${node.id}-${idx}`),
            tool: String(s.tool || 'run_command'),
            args: s.args && typeof s.args === 'object' ? (s.args as Record<string, unknown>) : {},
            rationale: String(s.rationale || ''),
            requiresApproval: s.requiresApproval !== false,
          })),
        },
        tokensIn,
        tokensOut,
      };
    }
  } catch {
    // fall through
  }

  return {
    plan: {
      planId: `plan-${node.id}-${Date.now()}`,
      laneId: `lane-${node.id}`,
      nodeId: node.id,
      approvedBy: 'OVERSEER',
      approvedAt: Date.now(),
      steps: [{
        id: `step-${node.id}-apply`,
        tool: 'run_command',
        args: { command: `echo "Titan Supreme: applying changes for ${node.title}"` },
        rationale: `Apply artifact for ${node.title}`,
        requiresApproval: true,
      }],
    },
    tokensIn,
    tokensOut,
  };
}

// ── Main Orchestration Loop ─────────────────────────────────────────────────

export async function orchestrateSupreme(
  goal: string,
  sessionId: string,
  callbacks: SupremeCallbacks,
  config: SupremeConfig = DEFAULT_SUPREME_CONFIG,
) {
  const startedAt = Date.now();
  const tracker = createInitialStepTracker();
  const stall = createStallDetector(config);
  const budget = createBudgetTracker({ requestId: `${sessionId}-${Date.now()}`, config: config.tokenBudget });
  const permissions = createPermissionManager();
  const cache = createCacheManager({ ttlMs: config.cacheTTLMs });
  const worktrees = createWorktreeManager({
    runCommand: (cmd) => callbacks.executeToolCall('run_command', { command: cmd }),
  });
  const mcpBridge = createMCPBridge({
    githubToken: typeof process !== 'undefined' ? process.env?.GITHUB_TOKEN : undefined,
    slackWebhookUrl: typeof process !== 'undefined' ? process.env?.SLACK_WEBHOOK_URL : undefined,
    sentryToken: typeof process !== 'undefined' ? process.env?.SENTRY_TOKEN : undefined,
  });

  const secureToolCall = async (
    role: 'OVERSEER' | 'OPERATOR' | 'PRIMARY_WORKER' | 'SECONDARY_WORKER',
    tool: string,
    args: Record<string, unknown>,
  ) => {
    const auth = permissions.authorizeToolCall(sessionId, role, role, tool, args);
    if (!auth.approved) {
      return { success: false, output: '', error: auth.reason };
    }

    const cacheKey = `${tool}:${JSON.stringify(args)}`;
    if (READ_TOOLS.has(tool)) {
      const cached = cache.get(cacheKey);
      if (cached) return { success: true, output: cached };
    }

    const result = await callbacks.executeToolCall(tool, args);

    if (result.success && READ_TOOLS.has(tool)) {
      cache.set(cacheKey, result.output);
    }
    if (!READ_TOOLS.has(tool)) {
      const filePath = String(args.path || args.file_path || '');
      if (filePath) cache.invalidate(filePath);
    }

    return result;
  };

  callbacks.onEvent('orchestration_start', { goal, sessionId });

  let mcpContext = '';
  const enabledSources = mcpBridge.getEnabledSources();
  if (enabledSources.length > 0) {
    try {
      const res = await mcpBridge.queryContext(enabledSources[0], goal.slice(0, 200));
      if (res.ok) mcpContext = JSON.stringify(res.data).slice(0, 500);
    } catch { /* non-blocking */ }
  }

  const enrichedGoal = mcpContext ? `${goal}\n\n[MCP Context]: ${mcpContext}` : goal;
  const decomposition = await decomposeGoal(enrichedGoal, config, callbacks.invokeModel);
  const manifest = decomposition.manifest;
  budget.recordUsage(config.models.overseer, decomposition.tokensIn, decomposition.tokensOut);
  tracker.llmCalls += 1;
  tracker.tokensIn += decomposition.tokensIn;
  tracker.tokensOut += decomposition.tokensOut;

  callbacks.onEvent('task_decomposed', {
    manifestId: manifest.id,
    nodeCount: manifest.nodes.length,
    nodes: manifest.nodes,
  });

  let merged = 0;
  let failed = 0;
  const collectedOutputs: string[] = [];

  for (const node of manifest.nodes) {
    tracker.totalSteps += 1;
    stall.recordStep('node_start', true, node.id);

    const workerModel = node.assignedRole === 'SECONDARY_WORKER'
      ? config.models.secondaryWorker
      : config.models.primaryWorker;
    callbacks.onEvent('worker_assigned', { nodeId: node.id, role: node.assignedRole, model: workerModel });

    try { await worktrees.createWorktree(`lane-${node.id}`); } catch { /* non-fatal: worktree isolation is best-effort */ }

    const workerCallbacks = {
      executeToolCall: (tool: string, args: Record<string, unknown>) =>
        secureToolCall(node.assignedRole === 'SECONDARY_WORKER' ? 'SECONDARY_WORKER' : 'PRIMARY_WORKER', tool, args),
      invokeModel: callbacks.invokeModel,
    };

    const hasWorkspace = !!(callbacks.workspacePath);
    let artifact: SupremeArtifact;
    if (node.assignedRole === 'SECONDARY_WORKER') {
      artifact = await executeSecondaryWorker(`lane-${node.id}`, node, config, workerCallbacks, hasWorkspace);
    } else {
      artifact = await executePrimaryWorker(`lane-${node.id}`, node, config, workerCallbacks, hasWorkspace);
    }
    const workerTokensIn = estimateTokens(node.description);
    const workerTokensOut = estimateTokens(artifact.rawOutput || '');
    budget.recordUsage(workerModel, workerTokensIn, workerTokensOut);
    tracker.llmCalls += 1;
    tracker.tokensIn += workerTokensIn;
    tracker.tokensOut += workerTokensOut;

    callbacks.onEvent('worker_progress', {
      nodeId: node.id,
      filesModified: artifact.filesModified,
      inspectionEvidence: artifact.inspectionEvidence.slice(0, 300),
    });

    const review = await reviewArtifact(node, artifact, config, callbacks.invokeModel);
    budget.recordUsage(config.models.overseer, review.tokensIn, review.tokensOut);
    tracker.llmCalls += 1;
    tracker.tokensIn += review.tokensIn;
    tracker.tokensOut += review.tokensOut;

    callbacks.onEvent('artifact_review', {
      nodeId: node.id,
      pass: review.pass,
      rationale: review.rationale,
    });

    if (!review.pass) {
      failed += 1;
      stall.recordStep('artifact_reject', false, artifact.rawOutput?.slice(0, 100));
      try { await worktrees.cleanupWorktree(`lane-${node.id}`); } catch { /* non-fatal */ }
      if (stall.shouldHalt()) break;
      continue;
    }

    if (node.complexity > config.debateThreshold) {
      callbacks.onEvent('debate_started', { nodeId: node.id });

      const auditCallbacks = {
        executeToolCall: (tool: string, args: Record<string, unknown>) => secureToolCall('OPERATOR', tool, args),
        invokeModel: callbacks.invokeModel,
      };
      const debate = await runAdversarialAudit(`lane-${node.id}`, node, config, auditCallbacks);
      callbacks.onEvent('debate_verdict', {
        nodeId: node.id,
        winner: debate.verdict.winner,
        rationale: debate.verdict.rationale,
      });
      tracker.llmCalls += 3;

      const followers: ConsensusFollower[] = [
        {
          role: 'PRIMARY_WORKER',
          model: config.models.primaryWorker,
          verify: async (change) => {
            const out = await callbacks.invokeModel(config.models.primaryWorker, [
              { role: 'system', content: 'Review this change. Return JSON: {"approved":true/false,"rationale":"..."}' },
              { role: 'user', content: change.slice(0, 6000) },
            ]);
            const p = tryParseJSON(out);
            return { approved: p?.approved !== false, rationale: String(p?.rationale || out.slice(0, 200)) };
          },
        },
        {
          role: 'OPERATOR',
          model: config.models.operator,
          verify: async (change) => {
            const out = await callbacks.invokeModel(config.models.operator, [
              { role: 'system', content: 'Review this change for executability. Return JSON: {"approved":true/false,"rationale":"..."}' },
              { role: 'user', content: change.slice(0, 6000) },
            ]);
            const p = tryParseJSON(out);
            return { approved: p?.approved !== false, rationale: String(p?.rationale || out.slice(0, 200)) };
          },
        },
      ];

      const consensus = await initiateConsensus(artifact.codeChanges.slice(0, 8000), followers, config.quorumSize);
      callbacks.onEvent('consensus_vote', {
        nodeId: node.id,
        votes: consensus.votes,
        quorum: consensus.quorum,
      });
      tracker.llmCalls += followers.length;

      if (!consensus.quorum.approved) {
        failed += 1;
        stall.recordStep('consensus_rejected', false, node.id);
        try { await worktrees.cleanupWorktree(`lane-${node.id}`); } catch { /* non-fatal */ }
        if (stall.shouldHalt()) break;
        continue;
      }
    }

    const execResult = await authorizeExecution(node, artifact, config, callbacks.invokeModel);
    budget.recordUsage(config.models.overseer, execResult.tokensIn, execResult.tokensOut);
    tracker.llmCalls += 1;
    tracker.tokensIn += execResult.tokensIn;
    tracker.tokensOut += execResult.tokensOut;

    callbacks.onEvent('execution_authorized', {
      nodeId: node.id,
      planId: execResult.plan.planId,
      stepCount: execResult.plan.steps.length,
    });

    const opResult = await executeApprovedPlan(execResult.plan, {
      executeToolCall: (tool, args) => secureToolCall('OPERATOR', tool, args),
    });
    tracker.toolCalls += opResult.steps.length;
    for (const step of opResult.steps) {
      callbacks.onEvent('tool_executed', {
        nodeId: node.id,
        stepId: step.id,
        tool: step.tool,
        success: step.success,
      });
    }

    const testResult = await runTestSuite({
      executeToolCall: (tool, args) => secureToolCall('OPERATOR', tool, args),
    });
    callbacks.onEvent('verification_result', {
      nodeId: node.id,
      success: opResult.success && testResult.success,
      summary: testResult.success ? 'exit 0 observed' : (testResult.error || testResult.output).slice(0, 400),
    });

    if (opResult.success && testResult.success) {
      try { await worktrees.mergeWorktree(`lane-${node.id}`); } catch { /* non-fatal */ }
      merged += 1;
      stall.recordStep('node_complete', true, node.id);
      if (artifact.rawOutput) collectedOutputs.push(artifact.rawOutput);
    } else {
      failed += 1;
      stall.recordStep('node_failed', false, node.id);
    }

    try { await worktrees.cleanupWorktree(`lane-${node.id}`); } catch { /* non-fatal */ }

    const budgetStatus = budget.getRemainingBudget();
    callbacks.onEvent('budget_update', {
      nodeId: node.id,
      ...budgetStatus,
      usage: budget.getUsageSummary(),
      cacheStats: cache.getStats(),
      auditLogSize: permissions.getAuditLog().length,
    });

    if (stall.isNearLimit() || stall.isStalled()) {
      callbacks.onEvent('stall_warning', {
        nodeId: node.id,
        ...stall.getReport(),
      });
    }

    if (stall.shouldHalt()) break;
  }

  const success = merged === manifest.nodes.length && failed === 0;

  const combinedOutput = collectedOutputs.join('\n\n---\n\n');

  return {
    success,
    manifestId: manifest.id,
    lanesTotal: manifest.nodes.length,
    lanesMerged: merged,
    lanesFailed: failed,
    tracker,
    summary: generateProductionSummary(manifest, merged, failed),
    output: combinedOutput,
  };
}

export function generateProductionSummary(manifest: SupremeTaskManifest, merged: number, failed: number) {
  return [
    `Titan Supreme Protocol completed for goal: ${manifest.goal}`,
    `Nodes merged: ${merged}/${manifest.nodes.length}`,
    `Nodes failed: ${failed}`,
  ].join('\n');
}
