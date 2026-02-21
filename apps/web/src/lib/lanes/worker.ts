/**
 * Titan Protocol v2 — Worker (Coder) Agent
 *
 * Executes a single lane's coding task. The Worker receives a scoped
 * context (subtask spec + relevant files) and produces the mandatory
 * 4-section output defined in apps/desktop/docs/coder.md:
 *   1) INSPECTION EVIDENCE
 *   2) CODE ARTIFACT
 *   3) SELF-REVIEW
 *   4) VERIFICATION HINTS
 *
 * The Worker never sees the full plan, memory.md, or other lanes' output
 * (Law 9: Context Isolation).
 */

import type { Lane, WorkerArtifact, FileRegion, ToolCallLogEntry } from './lane-model';
import { laneStore } from './lane-store';
import { MODEL_REGISTRY } from '@/lib/model-registry';

// ─── Worker System Prompt ───────────────────────────────────────────────────

function buildWorkerSystemPrompt(lane: Lane): string {
  return `You are a Coder agent operating under the Titan Governance Protocol v2.

"I have read and I am bound by the Titan Governance Protocol."

You are executing Lane ${lane.lane_id} for subtask: ${lane.spec.title}

=== YOUR ROLE ===
You are a Technical Implementation Worker. You produce code artifacts ONLY.
You do NOT:
- Make architectural decisions
- Choose libraries (unless specified in the subtask)
- Decide on file structure (unless specified)
- Execute terminal commands
- Read memory.md or plan.md

If you encounter a situation requiring a decision outside your scope, STOP and include a DECISION REQUEST section.

=== SUBTASK SPECIFICATION ===
Title: ${lane.spec.title}
Description: ${lane.spec.description}

Success Criteria:
${lane.spec.successCriteria.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}

Verification Criteria:
${lane.spec.verificationCriteria.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}

Relevant Files:
${lane.spec.relevantFiles.map(f => `  - ${f}`).join('\n')}

${lane.spec.constraints?.length ? `Constraints:\n${lane.spec.constraints.map(c => `  - ${c}`).join('\n')}` : ''}

${lane.spec.codeSnippets?.length ? `Existing Code Context:\n${lane.spec.codeSnippets.map(s => `--- ${s.path} ---\n${s.content}`).join('\n\n')}` : ''}

=== MANDATORY OUTPUT FORMAT ===
Your output MUST include these four sections in order:

## 1. INSPECTION EVIDENCE
Prove you read existing code before writing. List:
- Files read (with paths)
- Grep queries run
- Key findings from inspection

## 2. CODE ARTIFACT
The actual code changes. Requirements:
- Complete, working code -- no placeholders
- No TODO comments
- No stub functions returning hardcoded values
- Error handling at every I/O boundary
- Proper typing (TypeScript: no 'any' unless unavoidable)

## 3. SELF-REVIEW
List every edge case you considered and how you handled each:
- Null/undefined inputs
- Empty collections
- Maximum-size inputs
- Concurrent access (if applicable)
- Network failures (if applicable)

## 4. VERIFICATION HINTS
Adversarial self-disclosure -- tell the Verifier exactly what to check:
- "The hardest part to verify is [X] because [Y]"
- "I'm least confident about [Z]"
- "Check the edge case where [W]"

=== FORBIDDEN PATTERNS (Any = Automatic FAIL) ===
1. Placeholder code: // TODO: implement this
2. Stub functions: function foo() { return null; }
3. Happy-path-only code: no error handling on fetch/fs/db calls
4. Missing type safety: 'any' types without justification
5. Hardcoded values that should be configurable
6. Imports of modules that don't exist in the project
7. Functions longer than 50 lines without decomposition

=== TOOLS ===
You have access to: read_file, edit_file, create_file, delete_file, list_directory, grep_search, glob_search, run_command, read_lints

Use them to inspect the codebase before making changes. ALWAYS read a file before editing it.
Use relative paths from the workspace root.`;
}

// ─── LLM Call Infrastructure ────────────────────────────────────────────────

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

interface LLMStreamResult {
  content: string;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}

const WORKER_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read file contents. Returns line-numbered content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          startLine: { type: 'number', description: 'Start line (1-indexed, optional)' },
          endLine: { type: 'number', description: 'End line (optional)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing an exact string match.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          old_string: { type: 'string', description: 'Exact string to find' },
          new_string: { type: 'string', description: 'Replacement string' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_file',
      description: 'Create a new file with content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'File content' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_file',
      description: 'Delete a file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_directory',
      description: 'List files and directories.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (defaults to root)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'grep_search',
      description: 'Search for a pattern across files.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search pattern' },
          path: { type: 'string', description: 'Directory (optional)' },
          glob: { type: 'string', description: 'File glob (optional)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'glob_search',
      description: 'Find files matching a glob pattern.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern' },
          path: { type: 'string', description: 'Base directory (optional)' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: 'Execute a shell command.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command' },
          cwd: { type: 'string', description: 'Working directory (optional)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_lints',
      description: 'Check file for linter errors.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
        },
        required: ['path'],
      },
    },
  },
];

// ─── Stream LLM Response ────────────────────────────────────────────────────

async function streamLLMCall(
  messages: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; name?: string }>,
  modelId: string,
  tools: typeof WORKER_TOOL_DEFINITIONS,
  onToken?: (token: string) => void,
): Promise<LLMStreamResult> {
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
      'X-Title': 'Titan AI - Worker Lane',
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
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature: 0,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${text.slice(0, 300)}`);
  }

  if (!response.body) throw new Error('No response body from LLM');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  const toolCallAccumulator: Record<number, { id: string; name: string; args: string }> = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          fullContent += delta.content;
          onToken?.(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallAccumulator[idx]) {
              toolCallAccumulator[idx] = { id: tc.id || `call_${Date.now()}_${idx}`, name: '', args: '' };
            }
            if (tc.id) toolCallAccumulator[idx].id = tc.id;
            if (tc.function?.name) toolCallAccumulator[idx].name = tc.function.name;
            if (tc.function?.arguments) toolCallAccumulator[idx].args += tc.function.arguments;
          }
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  const toolCalls = Object.values(toolCallAccumulator).map(tc => {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(tc.args); } catch { args = { raw: tc.args }; }
    return { id: tc.id, name: tc.name, args };
  });

  return { content: fullContent, toolCalls };
}

// ─── Worker Execution ───────────────────────────────────────────────────────

export interface WorkerExecutionCallbacks {
  onToken?: (laneId: string, token: string) => void;
  onToolCall?: (laneId: string, tool: string, args: Record<string, unknown>) => void;
  onToolResult?: (laneId: string, tool: string, result: string, success: boolean) => void;
  executeToolCall: (tool: string, args: Record<string, unknown>) => Promise<{ success: boolean; output: string; error?: string }>;
}

const MAX_WORKER_TOOL_CALLS = 80;
const MAX_WORKER_ITERATIONS = 40;

export async function executeWorkerLane(
  lane: Lane,
  callbacks: WorkerExecutionCallbacks,
): Promise<WorkerArtifact> {
  const startTime = Date.now();
  const systemPrompt = buildWorkerSystemPrompt(lane);
  const toolCallLog: ToolCallLogEntry[] = [];
  const filesModified: FileRegion[] = [];

  laneStore.transitionLane(lane.lane_id, 'WORKING', 'worker', 'Worker execution started');

  const messages: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; name?: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Execute the subtask: ${lane.spec.title}\n\n${lane.spec.description}\n\nBegin by inspecting the relevant files, then implement the changes.` },
  ];

  let totalToolCalls = 0;
  let iterations = 0;
  let fullWorkerOutput = '';

  while (iterations < MAX_WORKER_ITERATIONS) {
    iterations++;

    const result = await streamLLMCall(
      messages,
      lane.worker_model_id,
      WORKER_TOOL_DEFINITIONS,
      (token) => callbacks.onToken?.(lane.lane_id, token),
    );

    fullWorkerOutput += result.content;

    if (result.toolCalls.length === 0) {
      break;
    }

    messages.push({
      role: 'assistant',
      content: result.content || null,
      tool_calls: result.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    });

    for (const tc of result.toolCalls) {
      totalToolCalls++;
      if (totalToolCalls > MAX_WORKER_TOOL_CALLS) break;

      callbacks.onToolCall?.(lane.lane_id, tc.name, tc.args);
      const tcStart = Date.now();
      const toolResult = await callbacks.executeToolCall(tc.name, tc.args);
      const tcEnd = Date.now();

      toolCallLog.push({
        id: tc.id,
        tool: tc.name,
        args: tc.args,
        result: toolResult.output.slice(0, 3000),
        success: toolResult.success,
        startedAt: tcStart,
        finishedAt: tcEnd,
      });

      callbacks.onToolResult?.(lane.lane_id, tc.name, toolResult.output, toolResult.success);

      if ((tc.name === 'edit_file' || tc.name === 'create_file') && toolResult.success) {
        const filePath = tc.args.path as string;
        if (filePath && !filesModified.some(f => f.filePath === filePath)) {
          filesModified.push({ filePath });
        }
      }

      const resultContent = toolResult.success
        ? toolResult.output
        : `Error: ${toolResult.error || 'Unknown error'}\n${toolResult.output || ''}`;

      messages.push({
        role: 'tool',
        content: resultContent.slice(0, 12000),
        tool_call_id: tc.id,
        name: tc.name,
      });
    }

    if (totalToolCalls > MAX_WORKER_TOOL_CALLS) break;
  }

  const endTime = Date.now();
  const artifact = parseWorkerOutput(fullWorkerOutput, filesModified, toolCallLog);

  laneStore.updateArtifacts(lane.lane_id, { workerOutput: artifact });
  laneStore.updateFilesTouched(lane.lane_id, filesModified);
  laneStore.updateMetrics(lane.lane_id, {
    workerDurationMs: endTime - startTime,
    toolCallCount: totalToolCalls,
  });

  laneStore.transitionLane(lane.lane_id, 'PENDING_VERIFY', 'worker', 'Worker completed, awaiting verification');

  return artifact;
}

// ─── Output Parser ──────────────────────────────────────────────────────────

function parseWorkerOutput(
  raw: string,
  filesModified: FileRegion[],
  toolCallLog: ToolCallLogEntry[],
): WorkerArtifact {
  const sections = {
    inspectionEvidence: '',
    codeChanges: '',
    selfReview: '',
    verificationHints: '',
  };

  const sectionPatterns: Array<{ key: keyof typeof sections; pattern: RegExp }> = [
    { key: 'inspectionEvidence', pattern: /##?\s*1\.?\s*INSPECTION\s*EVIDENCE([\s\S]*?)(?=##?\s*2\.?\s*CODE|$)/i },
    { key: 'codeChanges', pattern: /##?\s*2\.?\s*CODE\s*(?:ARTIFACT)?([\s\S]*?)(?=##?\s*3\.?\s*SELF[- ]?REVIEW|$)/i },
    { key: 'selfReview', pattern: /##?\s*3\.?\s*SELF[- ]?REVIEW([\s\S]*?)(?=##?\s*4\.?\s*VERIFICATION|$)/i },
    { key: 'verificationHints', pattern: /##?\s*4\.?\s*VERIFICATION\s*HINTS([\s\S]*?)$/i },
  ];

  for (const { key, pattern } of sectionPatterns) {
    const match = raw.match(pattern);
    if (match) {
      sections[key] = match[1].trim();
    }
  }

  if (!sections.inspectionEvidence && !sections.codeChanges) {
    sections.codeChanges = raw;
  }

  return {
    inspectionEvidence: sections.inspectionEvidence,
    codeChanges: sections.codeChanges,
    selfReview: sections.selfReview,
    verificationHints: sections.verificationHints,
    rawOutput: raw,
    filesModified,
    toolCallLog,
  };
}
