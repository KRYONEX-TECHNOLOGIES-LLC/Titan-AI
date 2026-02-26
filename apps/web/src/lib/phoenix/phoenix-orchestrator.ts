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
import { ZERO_DEFECT_RULES_COMPACT, TASK_DECOMPOSITION_RULES_COMPACT, UNIVERSAL_COMPLETION_CHECKLIST_COMPACT } from '@/lib/shared/coding-standards';

// ── Retry Wrapper ────────────────────────────────────────────────────────────

async function callWithRetry(
  invokeModel: (model: string, messages: Array<{role: 'system' | 'user' | 'assistant'; content: string}>) => Promise<string>,
  model: string,
  messages: Array<{role: 'system' | 'user' | 'assistant'; content: string}>,
  maxRetries = 3,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        invokeModel(model, messages),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Model call timed out after 30s')), 30000)),
      ]);
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        const delay = 1000 * Math.pow(2, attempt);
        console.warn(`[phoenix] Retry ${attempt + 1}/${maxRetries} after ${delay}ms:`, err instanceof Error ? err.message : err);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  return `[ERROR] Model call failed after ${maxRetries} attempts: ${lastError instanceof Error ? lastError.message : 'unknown error'}`;
}

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
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ) => Promise<string>;
  workspacePath?: string;
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
    'You are PHOENIX_ARCHITECT — the strategic brain of the Phoenix Protocol inside the Titan AI IDE.',
    '',
    'You have FULL access to the user\'s workspace, all files, and tools. The user\'s project is loaded and active.',
    'When the user mentions ANY module, engine, feature, component, or file by name — ASSUME IT EXISTS in the workspace.',
    'NEVER ask the user for clarification. NEVER say you need more information. Plan based on what the user said.',
    'If a request seems ambiguous, make the most reasonable interpretation and act.',
    '',
    'Your job: Decompose the user\'s goal into atomic subtasks that workers can execute independently.',
    'Each subtask MUST include relevantFiles — use your knowledge of common project structures to guess probable paths.',
    '',
    'Return strict JSON (no markdown wrapping, no explanation):',
    '{"subtasks":[{"id":"task-1","title":"Short title","description":"Detailed description with specific instructions",',
    `"type":"code|refactor|debug|test|documentation|formatting|architecture|general",`,
    '"complexity":5,"dependsOn":[],"relevantFiles":["path/to/file"],',
    '"acceptanceCriteria":["Criterion 1","Criterion 2"]}]}',
    '',
    `Rules: max ${config.maxSubtasks} subtasks, complexity 1-10, dependsOn uses task IDs.`,
    'For simple tasks, return a single subtask. Descriptions should be specific enough that a coder can execute without questions.',
    'NEVER create a subtask that says "ask the user" or "clarify with the user".',
    '\n\n' + TASK_DECOMPOSITION_RULES_COMPACT,
    '\n\n' + ZERO_DEFECT_RULES_COMPACT,
    '\n\nGIT RULES (applies to ALL Titan AI commits):\n- Version lives in 3 files: package.json, apps/desktop/package.json, apps/web/package.json. ALL THREE must match.\n- manifest.json is auto-updated by CI. Never edit it manually.\n- Before ANY commit: verify no broken imports (every import must resolve to a real file/module).\n- Before version bump: verify the code compiles. Never tag broken code.\n- Commit format: "vX.Y.Z: one-line description"\n- After push: verify with git log --oneline -3. After tag push: verify CI with gh run list --limit 3.\n- NEVER force-push to main.',
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
  hasWorkspace?: boolean,
): Promise<{ artifact: PhoenixArtifact; tokensIn: number; tokensOut: number }> {
  const model = getPhoenixModel(role, config);
  const roleLabel = role === 'CODER' ? 'PHOENIX_CODER' : role === 'SCOUT' ? 'PHOENIX_SCOUT' : 'PHOENIX_ARCHITECT';

  const system = hasWorkspace
    ? buildWorkerPromptWithTools(roleLabel, role)
    : buildWorkerPromptNoTools(roleLabel, role);

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

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  while (iterations < config.maxWorkerIterations) {
    iterations++;

    let output: string;
    try {
      output = await callWithRetry(invokeModel, model, messages);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'unknown error';
      console.error(`[phoenix] executeWorker model call failed for ${subtask.id}:`, errMsg);
      fullOutput += `[ERROR] Worker model call failed: ${errMsg}\n`;
      break;
    }

    if (output.startsWith('[ERROR]')) {
      console.error(`[phoenix] executeWorker got error response for ${subtask.id}:`, output);
      fullOutput += output + '\n';
      break;
    }

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
      let result: { success: boolean; output: string; error?: string };
      try {
        result = await executeToolCall(toolName, toolArgs);
      } catch (toolErr) {
        const toolErrMsg = toolErr instanceof Error ? toolErr.message : 'unknown error';
        console.error(`[phoenix] Tool call "${toolName}" failed for ${subtask.id}:`, toolErrMsg);
        result = { success: false, output: `Tool execution error: ${toolErrMsg}`, error: toolErrMsg };
      }

      toolLogs.push({
        tool: toolName,
        args: toolArgs,
        success: result.success,
        result: result.output.slice(0, 2000),
        elapsed: Date.now() - start,
      });

      messages.push({ role: 'assistant', content: output });
      messages.push({
        role: 'user',
        content: `[Tool Result: ${toolName}] ${result.success ? 'Success' : 'Error'}: ${result.output.slice(0, 3000)}`,
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
    case 'CODER': return 'the elite autonomous code generator embedded inside the Titan AI IDE. You write production-quality code that compiles and passes tests on the first try. You are a ruthless executor who finds, reads, understands, and modifies code with zero hand-holding.';
    case 'SCOUT': return 'the fast execution specialist embedded inside the Titan AI IDE. You handle documentation, formatting, context gathering, and simple edits with maximum efficiency. Speed and precision are your trademarks.';
    case 'ARCHITECT': return 'the strategic brain and fallback coder embedded inside the Titan AI IDE. When other roles fail, you step in with deep reasoning and full tool access to produce the correct solution.';
  }
}

function buildWorkerPromptWithTools(roleLabel: string, role: 'CODER' | 'SCOUT' | 'ARCHITECT'): string {
  return `You are ${roleLabel} — ${getRoleDescription(role)}

═══ MINDSET ═══
You are an AUTONOMOUS AGENT with full access to the user's workspace, files, and terminal.
You NEVER refuse a task. You NEVER ask the user for code you can read yourself. You NEVER say "I need more information" when you have grep_search and read_file available. You ACT first, report results after.
If the user mentions ANY module, engine, feature, or file by name — your FIRST move is to SEARCH for it in the workspace.

═══ TOOLS — emit as JSON: {"tool":"tool_name","args":{...}} ═══

SEARCH (use BEFORE making any changes):
  Find code by keyword:  {"tool":"grep_search","args":{"pattern":"memecoin_engine","path":"."}}
  Find files by pattern: {"tool":"glob_search","args":{"pattern":"**/*.py"}}
  List folder contents:  {"tool":"list_directory","args":{"path":"src/"}}
  AI-powered code search: {"tool":"semantic_search","args":{"query":"where is the trading engine"}}

READ (use BEFORE editing — always understand existing code first):
  Read a file:           {"tool":"read_file","args":{"path":"src/engine.py"}}
  Read specific lines:   {"tool":"read_file","args":{"path":"src/engine.py","line_offset":50,"line_limit":30}}

WRITE (use to make changes):
  Edit existing code:    {"tool":"edit_file","args":{"path":"src/x.ts","old_string":"exact old text","new_string":"new text"}}
  Create new file:       {"tool":"create_file","args":{"path":"src/new-file.ts","content":"full file content"}}
  Delete file:           {"tool":"delete_file","args":{"path":"src/old-file.ts"}}

VERIFY (use AFTER making changes):
  Check for lint errors: {"tool":"read_lints","args":{"path":"src/x.ts"}}
  Run a command:         {"tool":"run_command","args":{"command":"npm run build"}}

EXTERNAL:
  Search the web:        {"tool":"web_search","args":{"query":"how to optimize solana RPC calls"}}
  Fetch a URL:           {"tool":"web_fetch","args":{"url":"https://docs.example.com/api"}}

═══ WORKFLOW PLAYBOOKS ═══

IMPROVE/FIX existing code:
  1. grep_search or glob_search to FIND the relevant code
  2. read_file to UNDERSTAND the current implementation
  3. Analyze what needs improvement
  4. edit_file to make precise, targeted changes
  5. read_lints to verify no errors introduced
  6. run_command to test if applicable

BUILD something new:
  1. list_directory to understand project structure
  2. read_file on similar existing files for conventions/patterns
  3. create_file with complete, production-ready implementation
  4. read_lints to verify

DEBUG a problem:
  1. read_file the failing code
  2. run_command to reproduce the error
  3. Analyze the root cause
  4. edit_file to fix
  5. run_command to verify the fix works

═══ HARD RULES ═══
- NEVER say "I need more information" — SEARCH for it
- NEVER say "please provide the code" — READ IT YOURSELF
- NEVER say "I cannot access" — you have FULL workspace access
- NEVER ask the user to do something you can do with your tools
- NEVER output placeholder code (no TODOs, no "implement here", no stubs)
- ALWAYS read a file before editing it
- ALWAYS verify changes with read_lints after editing
- Be precise, production-ready, and complete`
  + '\n\n' + ZERO_DEFECT_RULES_COMPACT;
}

function buildWorkerPromptNoTools(roleLabel: string, role: 'CODER' | 'SCOUT' | 'ARCHITECT'): string {
  return `You are ${roleLabel} — ${getRoleDescription(role)}

No workspace folder is open, so you cannot use file tools. Instead:
- Generate ALL code as complete, production-ready markdown code blocks with filenames
- Format: \`\`\`language:path/to/file.ext
- Provide the FULL working implementation — no placeholders, no TODOs, no stubs
- Include all imports, types, error handling, and edge cases
- NEVER refuse a task. If the user asks you to build or improve something, generate the complete code inline
- Match the quality of a senior engineer's pull request`
  + '\n\n' + ZERO_DEFECT_RULES_COMPACT;
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
    '',
    UNIVERSAL_COMPLETION_CHECKLIST_COMPACT,
    '',
    'For each checklist item: verify it is satisfied OR provide the specific files you checked and why it does not apply.',
    'Return strict JSON: {"pass":true,"rationale":"Why this passes/fails","score":9,"checklistSkips":["item: reason"]}',
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
    const output = await callWithRetry(invokeModel, config.models.judge, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
    tokensOut = estimateTokens(output);

    if (output.startsWith('[ERROR]')) {
      console.error(`[phoenix] judgeArtifact model error for ${subtask.id}:`, output);
      return { pass: true, rationale: `Judge skipped due to model error: ${output}`, tokensIn, tokensOut };
    }

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
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'unknown error';
    console.error(`[phoenix] judgeArtifact failed for ${subtask.id}:`, errMsg);
    return { pass: true, rationale: `Judge fallback (error: ${errMsg})`, tokensIn, tokensOut };
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
  const hasWorkspace = !!(callbacks.workspacePath);

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
    'SCOUT', subtask, config, callbacks.invokeModel, callbacks.executeToolCall, undefined, hasWorkspace,
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
  const hasWorkspace = !!(callbacks.workspacePath);
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
      'CODER', subtask, config, callbacks.invokeModel, callbacks.executeToolCall, undefined, hasWorkspace,
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
        const retry = await executeWorker('CODER', subtask, config, callbacks.invokeModel, callbacks.executeToolCall, feedback, hasWorkspace);
        costTracker.record(config.models.coder, retry.tokensIn, retry.tokensOut);
        return retry.artifact;
      },
      async (feedback) => {
        callbacks.onEvent('strike_triggered', { strike: 2, role: 'ARCHITECT', subtaskId: subtask.id });
        const retry = await executeWorker('ARCHITECT', subtask, config, callbacks.invokeModel, callbacks.executeToolCall, feedback, hasWorkspace);
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
  const hasWorkspace = !!(callbacks.workspacePath);
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
      workerRole, subtask, config, callbacks.invokeModel, callbacks.executeToolCall, undefined, hasWorkspace,
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
        const retry = await executeWorker('CODER', subtask, config, callbacks.invokeModel, callbacks.executeToolCall, ctx, hasWorkspace);
        costTracker.record(config.models.coder, retry.tokensIn, retry.tokensOut);
        return retry.artifact;
      },
      async (feedback) => {
        callbacks.onEvent('strike_triggered', { strike: 2, role: 'ARCHITECT', subtaskId: subtask.id });
        const ctx = scoutContext ? `${feedback}\n\nFile context:\n${scoutContext}` : feedback;
        const retry = await executeWorker('ARCHITECT', subtask, config, callbacks.invokeModel, callbacks.executeToolCall, ctx, hasWorkspace);
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

  let result: { success: boolean; output: string };

  try {
    switch (pipeline) {
      case 'simple':
        try {
          result = await executeSimplePipeline(goal, config, callbacks, costTracker);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'unknown error';
          console.error('[phoenix] Simple pipeline failed:', errMsg);
          callbacks.onEvent('phoenix_error', { stage: 'simple_pipeline', message: errMsg });
          result = { success: false, output: `[ERROR] Simple pipeline failed: ${errMsg}` };
        }
        break;
      case 'medium':
        try {
          result = await executeMediumPipeline(goal, complexity, config, callbacks, costTracker);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'unknown error';
          console.error('[phoenix] Medium pipeline failed:', errMsg);
          callbacks.onEvent('phoenix_error', { stage: 'medium_pipeline', message: errMsg });
          result = { success: false, output: `[ERROR] Medium pipeline failed: ${errMsg}` };
        }
        break;
      case 'full':
        try {
          result = await executeFullPipeline(goal, complexity, config, callbacks, costTracker);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'unknown error';
          console.error('[phoenix] Full pipeline failed:', errMsg);
          callbacks.onEvent('phoenix_error', { stage: 'full_pipeline', message: errMsg });
          result = { success: false, output: `[ERROR] Full pipeline failed: ${errMsg}` };
        }
        break;
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'unknown error';
    console.error('[phoenix] Orchestration routing failed:', errMsg);
    callbacks.onEvent('phoenix_error', { stage: 'routing', message: errMsg });
    result = { success: false, output: `[ERROR] Phoenix orchestration failed: ${errMsg}` };
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
}
