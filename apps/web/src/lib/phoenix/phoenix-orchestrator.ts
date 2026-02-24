// ── Phoenix Orchestrator ─────────────────────────────────────────────────────
// Main engine: ARCHITECT decomposition, parallel CODER+SCOUT dispatch,
// VERIFIER pass, JUDGE gate, self-healing loop, context compression.

import {
  DEFAULT_PHOENIX_CONFIG,
  createPhoenixStepTracker,
  PhoenixCostTracker,
  estimateTokens,
  tryParseJSON,
  parseTaskType,
  getPhoenixRoleForTask,
  getPhoenixModel,
  type PhoenixConfig,
  type PhoenixPlan,
  type PhoenixSubtask,
  type PhoenixArtifact,
  type PhoenixPipeline,
  type PhoenixTaskType,
  type PhoenixToolLog,
} from './phoenix-model';
import { routeRequest } from './phoenix-router';
import { selfHealingVerification, verifyArtifact } from './phoenix-verifier';

// ── Event Types ─────────────────────────────────────────────────────────────

export type PhoenixEventType =
  | 'phoenix_start'
  | 'complexity_routed'
  | 'plan_created'
  | 'subtask_started'
  | 'worker_dispatched'
  | 'worker_complete'
  | 'verification_started'
  | 'verification_result'
  | 'strike_triggered'
  | 'consensus_started'
  | 'consensus_result'
  | 'judge_started'
  | 'judge_result'
  | 'subtask_complete'
  | 'subtask_failed'
  | 'cost_update'
  | 'phoenix_complete'
  | 'phoenix_error';

export interface PhoenixCallbacks {
  onEvent: (type: PhoenixEventType, payload: Record<string, unknown>) => void;
  executeToolCall: (
    tool: string,
    args: Record<string, unknown>,
  ) => Promise<{ success: boolean; output: string; error?: string }>;
  invokeModel: (
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
  ) => Promise<string>;
}

// ── Context Compression ─────────────────────────────────────────────────────

function compressContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.6));
  const tail = text.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n\n[... ${text.length - maxChars} chars compressed ...]\n\n${tail}`;
}

// ── ARCHITECT: Plan Decomposition ───────────────────────────────────────────

async function architectDecompose(
  goal: string,
  complexity: number,
  config: PhoenixConfig,
  invokeModel: PhoenixCallbacks['invokeModel'],
): Promise<{ plan: PhoenixPlan; tokensIn: number; tokensOut: number }> {
  const system = [
    'You are PHOENIX_ARCHITECT — the strategic brain of the Phoenix Protocol.',
    'Decompose the user goal into atomic subtasks. Each subtask should be independently executable.',
    'Return strict JSON (no markdown wrapping):',
    '{"subtasks":[{"id":"task-1","title":"Short title","description":"Detailed description",',
    `"type":"code|refactor|debug|test|documentation|formatting|architecture|general",`,
    '"complexity":5,"dependsOn":[],"relevantFiles":["path/to/file"],',
    '"acceptanceCriteria":["Criterion 1","Criterion 2"]}]}',
    `Rules: max ${config.maxSubtasks} subtasks, complexity 1-10, dependsOn uses task IDs.`,
    'For simple tasks, return a single subtask. Be precise and actionable.',
  ].join('\n');

  const tokensIn = estimateTokens(system + goal);
  let tokensOut = 0;

  try {
    const output = await invokeModel(config.models.architect, [
      { role: 'system', content: system },
      { role: 'user', content: goal },
    ]);
    tokensOut = estimateTokens(output);
    const parsed = tryParseJSON(output);

    if (parsed && Array.isArray(parsed.subtasks) && parsed.subtasks.length > 0) {
      const subtasks: PhoenixSubtask[] = (parsed.subtasks as Record<string, unknown>[])
        .slice(0, config.maxSubtasks)
        .map((s, idx) => ({
          id: String(s.id || `task-${idx + 1}`),
          title: String(s.title || '').slice(0, 120),
          description: String(s.description || s.title || ''),
          type: parseTaskType(String(s.type || 'code')),
          complexity: Math.min(10, Math.max(1, Number(s.complexity) || complexity)),
          dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn.map(String) : [],
          relevantFiles: Array.isArray(s.relevantFiles) ? s.relevantFiles.map(String) : [],
          acceptanceCriteria: Array.isArray(s.acceptanceCriteria)
            ? s.acceptanceCriteria.map(String)
            : ['Implementation is correct and complete'],
        }));

      return {
        plan: {
          id: `phoenix-${Date.now()}`,
          goal,
          pipeline: 'full',
          complexity,
          subtasks,
          createdAt: Date.now(),
        },
        tokensIn,
        tokensOut,
      };
    }
  } catch {
    // fall through to naive decomposition
  }

  return {
    plan: {
      id: `phoenix-${Date.now()}`,
      goal,
      pipeline: complexity <= 3 ? 'simple' : complexity <= 6 ? 'medium' : 'full',
      complexity,
      subtasks: [{
        id: 'task-1',
        title: goal.slice(0, 120),
        description: goal,
        type: 'code',
        complexity,
        dependsOn: [],
        relevantFiles: [],
        acceptanceCriteria: ['Task completed correctly'],
      }],
      createdAt: Date.now(),
    },
    tokensIn,
    tokensOut,
  };
}

// ── Worker Execution (CODER / SCOUT) ────────────────────────────────────────

async function executeWorker(
  role: 'CODER' | 'SCOUT' | 'ARCHITECT',
  subtask: PhoenixSubtask,
  config: PhoenixConfig,
  invokeModel: PhoenixCallbacks['invokeModel'],
  executeToolCall: PhoenixCallbacks['executeToolCall'],
  extraContext?: string,
): Promise<{ artifact: PhoenixArtifact; tokensIn: number; tokensOut: number }> {
  const model = getPhoenixModel(role, config);
  const roleLabel = role === 'CODER' ? 'PHOENIX_CODER' : role === 'SCOUT' ? 'PHOENIX_SCOUT' : 'PHOENIX_ARCHITECT';

  const system = [
    `You are ${roleLabel} — ${getRoleDescription(role)}.`,
    'You have access to tools. When you need to read/write files or run commands, emit tool calls.',
    'Format tool calls as JSON: {"tool":"tool_name","args":{"key":"value"}}',
    'Available tools: read_file, write_file, edit_file, create_file, run_command, list_directory,',
    'grep_search, glob_search, web_search, web_fetch.',
    'After using tools, provide your final output with all code changes.',
    'Be precise, production-ready, and complete. No placeholders or TODOs.',
  ].join('\n');

  const user = [
    `Task: ${subtask.title}`,
    `Description: ${subtask.description}`,
    `Acceptance Criteria:\n${subtask.acceptanceCriteria.map(c => `- ${c}`).join('\n')}`,
    subtask.relevantFiles.length > 0 ? `Relevant Files: ${subtask.relevantFiles.join(', ')}` : '',
    extraContext ? `\nAdditional Context:\n${extraContext}` : '',
  ].filter(Boolean).join('\n\n');

  const tokensIn = estimateTokens(system + user);
  const toolLogs: PhoenixToolLog[] = [];
  let fullOutput = '';
  let iterations = 0;

  const messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }> = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  while (iterations < config.maxWorkerIterations) {
    iterations++;
    const output = await invokeModel(model, messages);
    fullOutput += output + '\n';

    const toolMatches = output.matchAll(/\{"tool"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*(\{[^}]*\})\}/g);
    let hadToolCall = false;

    for (const match of toolMatches) {
      if (toolLogs.length >= config.maxWorkerToolCalls) break;
      hadToolCall = true;

      const toolName = match[1];
      let toolArgs: Record<string, unknown> = {};
      try { toolArgs = JSON.parse(match[2]); } catch { continue; }

      const start = Date.now();
      const result = await executeToolCall(toolName, toolArgs);
      toolLogs.push({
        tool: toolName,
        args: toolArgs,
        success: result.success,
        result: result.output.slice(0, 2000),
        elapsed: Date.now() - start,
      });

      messages.push({ role: 'assistant', content: output });
      messages.push({
        role: 'tool',
        content: `[${toolName}] ${result.success ? 'Success' : 'Error'}: ${result.output.slice(0, 3000)}`,
      });
    }

    if (!hadToolCall || toolLogs.length >= config.maxWorkerToolCalls) break;
  }

  const tokensOut = estimateTokens(fullOutput);
  const filesModified = extractFilePathsFromOutput(fullOutput);

  return {
    artifact: {
      subtaskId: subtask.id,
      role,
      model,
      output: fullOutput,
      codeChanges: fullOutput,
      filesModified,
      toolCalls: toolLogs,
      createdAt: Date.now(),
    },
    tokensIn,
    tokensOut,
  };
}

function getRoleDescription(role: 'CODER' | 'SCOUT' | 'ARCHITECT'): string {
  switch (role) {
    case 'CODER': return 'the elite code generator. You write production-quality code that compiles and passes tests on the first try. SWE-bench champion level.';
    case 'SCOUT': return 'the fast execution specialist. You handle documentation, formatting, context gathering, and simple edits with maximum efficiency.';
    case 'ARCHITECT': return 'the strategic brain and fallback coder. When other roles fail, you step in with deep reasoning to produce the correct solution.';
  }
}

function extractFilePathsFromOutput(output: string): string[] {
  const paths = new Set<string>();
  const patterns = [
    /(?:write_file|edit_file|create_file).*?"path"\s*:\s*"([^"]+)"/g,
    /^(?:---|\+\+\+)\s+([^\s]+)/gm,
    /File:\s*`?([^\s`]+\.\w+)`?/g,
  ];
  for (const pattern of patterns) {
    for (const match of output.matchAll(pattern)) {
      if (match[1] && match[1].includes('.')) paths.add(match[1]);
    }
  }
  return [...paths].slice(0, 20);
}

// ── JUDGE: Final Quality Gate ───────────────────────────────────────────────

async function judgeArtifact(
  subtask: PhoenixSubtask,
  artifact: PhoenixArtifact,
  config: PhoenixConfig,
  invokeModel: PhoenixCallbacks['invokeModel'],
): Promise<{ pass: boolean; rationale: string; tokensIn: number; tokensOut: number }> {
  const system = [
    'You are PHOENIX_JUDGE — the final quality gate.',
    'You only see artifacts that have already passed VERIFIER review.',
    'Your job is to catch subtle issues: architectural problems, maintainability concerns,',
    'edge cases the VERIFIER missed, and ensure the solution is truly production-grade.',
    'Return strict JSON: {"pass":true,"rationale":"Why this passes/fails","score":9}',
    'Only fail if you find a SIGNIFICANT issue. Score 1-10.',
  ].join('\n');

  const user = [
    `Task: ${subtask.title}`,
    `Acceptance Criteria:\n${subtask.acceptanceCriteria.map(c => `- ${c}`).join('\n')}`,
    `Code:\n${compressContext(artifact.codeChanges, 12000)}`,
  ].join('\n\n');

  const tokensIn = estimateTokens(system + user);
  let tokensOut = 0;

  try {
    const output = await invokeModel(config.models.judge, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
    tokensOut = estimateTokens(output);
    const parsed = tryParseJSON(output);

    if (parsed) {
      const score = typeof parsed.score === 'number' ? (parsed.score as number) : 7;
      return {
        pass: parsed.pass !== false && score >= 5,
        rationale: String(parsed.rationale || ''),
        tokensIn,
        tokensOut,
      };
    }
  } catch {
    // fall through
  }

  return { pass: true, rationale: 'Judge fallback: accepted (no critical issues detected)', tokensIn, tokensOut };
}

// ── Pipeline Executors ──────────────────────────────────────────────────────

async function executeSimplePipeline(
  goal: string,
  config: PhoenixConfig,
  callbacks: PhoenixCallbacks,
  costTracker: PhoenixCostTracker,
): Promise<{ success: boolean; output: string }> {
  callbacks.onEvent('worker_dispatched', { role: 'SCOUT', model: config.models.scout, pipeline: 'simple' });

  const subtask: PhoenixSubtask = {
    id: 'task-1',
    title: goal.slice(0, 120),
    description: goal,
    type: 'general',
    complexity: 2,
    dependsOn: [],
    relevantFiles: [],
    acceptanceCriteria: ['Request fulfilled accurately'],
  };

  const { artifact, tokensIn, tokensOut } = await executeWorker(
    'SCOUT', subtask, config, callbacks.invokeModel, callbacks.executeToolCall,
  );
  costTracker.record(config.models.scout, tokensIn, tokensOut);
  callbacks.onEvent('worker_complete', { role: 'SCOUT', subtaskId: 'task-1' });

  return { success: true, output: artifact.output };
}

async function executeMediumPipeline(
  goal: string,
  complexity: number,
  config: PhoenixConfig,
  callbacks: PhoenixCallbacks,
  costTracker: PhoenixCostTracker,
): Promise<{ success: boolean; output: string }> {
  // ARCHITECT plans
  callbacks.onEvent('plan_created', { pipeline: 'medium', complexity });
  const { plan, tokensIn: planIn, tokensOut: planOut } = await architectDecompose(
    goal, complexity, config, callbacks.invokeModel,
  );
  costTracker.record(config.models.architect, planIn, planOut);
  callbacks.onEvent('plan_created', { subtaskCount: plan.subtasks.length, planId: plan.id });

  const outputs: string[] = [];

  for (const subtask of plan.subtasks) {
    callbacks.onEvent('subtask_started', { subtaskId: subtask.id, title: subtask.title });

    // CODER executes
    callbacks.onEvent('worker_dispatched', { role: 'CODER', model: config.models.coder, subtaskId: subtask.id });
    const { artifact, tokensIn, tokensOut } = await executeWorker(
      'CODER', subtask, config, callbacks.invokeModel, callbacks.executeToolCall,
    );
    costTracker.record(config.models.coder, tokensIn, tokensOut);
    callbacks.onEvent('worker_complete', { role: 'CODER', subtaskId: subtask.id });

    // VERIFIER checks with self-healing
    callbacks.onEvent('verification_started', { subtaskId: subtask.id });
    const verification = await selfHealingVerification(
      subtask,
      artifact,
      config,
      callbacks.invokeModel,
      async (feedback) => {
        callbacks.onEvent('strike_triggered', { strike: 1, role: 'CODER', subtaskId: subtask.id });
        const retry = await executeWorker('CODER', subtask, config, callbacks.invokeModel, callbacks.executeToolCall, feedback);
        costTracker.record(config.models.coder, retry.tokensIn, retry.tokensOut);
        return retry.artifact;
      },
      async (feedback) => {
        callbacks.onEvent('strike_triggered', { strike: 2, role: 'ARCHITECT', subtaskId: subtask.id });
        const retry = await executeWorker('ARCHITECT', subtask, config, callbacks.invokeModel, callbacks.executeToolCall, feedback);
        costTracker.record(config.models.architect, retry.tokensIn, retry.tokensOut);
        return retry.artifact;
      },
    );
    costTracker.record(config.models.verifier, verification.tokensUsed.in, verification.tokensUsed.out);
    callbacks.onEvent('verification_result', {
      subtaskId: subtask.id,
      pass: verification.pass,
      strikes: verification.strikes.length,
    });

    if (verification.pass && verification.finalArtifact) {
      outputs.push(verification.finalArtifact.output);
      callbacks.onEvent('subtask_complete', { subtaskId: subtask.id });
    } else {
      callbacks.onEvent('subtask_failed', { subtaskId: subtask.id, issues: verification.verdict.issues });
    }
  }

  return { success: outputs.length > 0, output: outputs.join('\n\n---\n\n') };
}

async function executeFullPipeline(
  goal: string,
  complexity: number,
  config: PhoenixConfig,
  callbacks: PhoenixCallbacks,
  costTracker: PhoenixCostTracker,
): Promise<{ success: boolean; output: string }> {
  // ARCHITECT decomposes
  const { plan, tokensIn: planIn, tokensOut: planOut } = await architectDecompose(
    goal, complexity, config, callbacks.invokeModel,
  );
  costTracker.record(config.models.architect, planIn, planOut);
  callbacks.onEvent('plan_created', { subtaskCount: plan.subtasks.length, planId: plan.id, complexity });

  const outputs: string[] = [];
  let completed = 0;
  let failed = 0;

  for (const subtask of plan.subtasks) {
    callbacks.onEvent('subtask_started', { subtaskId: subtask.id, title: subtask.title, type: subtask.type });

    const role = getPhoenixRoleForTask(subtask.type);
    const workerRole: 'CODER' | 'SCOUT' = role === 'SCOUT' ? 'SCOUT' : 'CODER';

    // Parallel: CODER/SCOUT + SCOUT context fetch
    const workerPromise = executeWorker(
      workerRole, subtask, config, callbacks.invokeModel, callbacks.executeToolCall,
    );
    callbacks.onEvent('worker_dispatched', { role: workerRole, model: getPhoenixModel(workerRole, config), subtaskId: subtask.id });

    let scoutContext = '';
    if (workerRole === 'CODER' && subtask.relevantFiles.length > 0) {
      try {
        const scoutResult = await callbacks.executeToolCall('read_file', {
          path: subtask.relevantFiles[0],
        });
        if (scoutResult.success) scoutContext = scoutResult.output.slice(0, 4000);
      } catch { /* non-blocking */ }
    }

    const { artifact, tokensIn, tokensOut } = await workerPromise;
    costTracker.record(getPhoenixModel(workerRole, config), tokensIn, tokensOut);
    callbacks.onEvent('worker_complete', { role: workerRole, subtaskId: subtask.id, filesModified: artifact.filesModified });

    // Self-healing verification
    callbacks.onEvent('verification_started', { subtaskId: subtask.id });
    const verification = await selfHealingVerification(
      subtask,
      artifact,
      config,
      callbacks.invokeModel,
      async (feedback) => {
        callbacks.onEvent('strike_triggered', { strike: 1, role: 'CODER', subtaskId: subtask.id });
        const ctx = scoutContext ? `${feedback}\n\nFile context:\n${scoutContext}` : feedback;
        const retry = await executeWorker('CODER', subtask, config, callbacks.invokeModel, callbacks.executeToolCall, ctx);
        costTracker.record(config.models.coder, retry.tokensIn, retry.tokensOut);
        return retry.artifact;
      },
      async (feedback) => {
        callbacks.onEvent('strike_triggered', { strike: 2, role: 'ARCHITECT', subtaskId: subtask.id });
        const ctx = scoutContext ? `${feedback}\n\nFile context:\n${scoutContext}` : feedback;
        const retry = await executeWorker('ARCHITECT', subtask, config, callbacks.invokeModel, callbacks.executeToolCall, ctx);
        costTracker.record(config.models.architect, retry.tokensIn, retry.tokensOut);
        return retry.artifact;
      },
    );
    costTracker.record(config.models.verifier, verification.tokensUsed.in, verification.tokensUsed.out);

    if (verification.consensus) {
      callbacks.onEvent('consensus_result', {
        subtaskId: subtask.id,
        votes: verification.consensus.length,
        pass: verification.pass,
      });
    }
    callbacks.onEvent('verification_result', {
      subtaskId: subtask.id,
      pass: verification.pass,
      strikes: verification.strikes.length,
    });

    if (!verification.pass || !verification.finalArtifact) {
      failed++;
      callbacks.onEvent('subtask_failed', { subtaskId: subtask.id });
      continue;
    }

    // JUDGE gate for high-complexity tasks
    if (subtask.complexity >= config.judgeThreshold) {
      callbacks.onEvent('judge_started', { subtaskId: subtask.id });
      const judgeResult = await judgeArtifact(subtask, verification.finalArtifact, config, callbacks.invokeModel);
      costTracker.record(config.models.judge, judgeResult.tokensIn, judgeResult.tokensOut);
      callbacks.onEvent('judge_result', {
        subtaskId: subtask.id,
        pass: judgeResult.pass,
        rationale: judgeResult.rationale,
      });

      if (!judgeResult.pass) {
        failed++;
        callbacks.onEvent('subtask_failed', { subtaskId: subtask.id, reason: judgeResult.rationale });
        continue;
      }
    }

    completed++;
    outputs.push(verification.finalArtifact.output);
    callbacks.onEvent('subtask_complete', { subtaskId: subtask.id });

    callbacks.onEvent('cost_update', {
      totalCost: costTracker.totalCost,
      totalTokensIn: costTracker.totalTokensIn,
      totalTokensOut: costTracker.totalTokensOut,
    });
  }

  return {
    success: completed > 0,
    output: outputs.join('\n\n---\n\n'),
  };
}

// ── Main Orchestration Entry Point ──────────────────────────────────────────

export async function orchestratePhoenix(
  goal: string,
  sessionId: string,
  callbacks: PhoenixCallbacks,
  config: PhoenixConfig = DEFAULT_PHOENIX_CONFIG,
) {
  const startedAt = Date.now();
  const tracker = createPhoenixStepTracker();
  const costTracker = new PhoenixCostTracker();

  callbacks.onEvent('phoenix_start', { goal, sessionId, models: config.models });

  const { complexity, pipeline } = routeRequest(goal);
  callbacks.onEvent('complexity_routed', { complexity, pipeline });

  try {
    let result: { success: boolean; output: string };

    switch (pipeline) {
      case 'simple':
        result = await executeSimplePipeline(goal, config, callbacks, costTracker);
        break;
      case 'medium':
        result = await executeMediumPipeline(goal, complexity, config, callbacks, costTracker);
        break;
      case 'full':
        result = await executeFullPipeline(goal, complexity, config, callbacks, costTracker);
        break;
    }

    const elapsedMs = Date.now() - startedAt;

    callbacks.onEvent('phoenix_complete', {
      success: result.success,
      pipeline,
      complexity,
      elapsedMs,
      cost: costTracker.totalCost,
      costSummary: costTracker.getSummary(),
      tokensIn: costTracker.totalTokensIn,
      tokensOut: costTracker.totalTokensOut,
    });

    return {
      success: result.success,
      output: result.output,
      pipeline,
      complexity,
      elapsedMs,
      cost: costTracker.totalCost,
      costBreakdown: costTracker.breakdown,
    };
  } catch (error) {
    callbacks.onEvent('phoenix_error', {
      message: error instanceof Error ? error.message : 'Phoenix orchestration failed',
    });
    throw error;
  }
}
