// ── Titan Plan Sniper — EXECUTOR Role ────────────────────────────────────────
// Uses Qwen3 Coder Next ($0.12/$0.75) to translate CODER output into
// concrete tool calls (file edits, creates, commands) and execute them.

import { callModelDirect } from '@/lib/llm-call';
import { ZERO_DEFECT_RULES_COMPACT, TASK_DECOMPOSITION_RULES_COMPACT, UNIVERSAL_COMPLETION_CHECKLIST_COMPACT } from '@/lib/shared/coding-standards';
import type {
  SniperConfig,
  CodeArtifact,
  ToolCallLog,
  SniperCostTracker,
} from './sniper-model';
import { estimateTokens } from './sniper-model';

export type ToolCallFn = (
  tool: string,
  args: Record<string, unknown>,
) => Promise<{ success: boolean; output: string }>;

const EXECUTOR_SYSTEM = `You are EXECUTOR, the tool-calling agent in the Titan Plan Sniper pipeline.
You receive code changes from the CODER and must translate them into precise tool calls.

PRECISION IS EVERYTHING:
- Every tool call must be exact. A wrong path, a mismatched old_string, or a missing edit = task failure.
- Never assume a file exists — if the CODER references a file for editing, verify the path matches exactly what was provided in the codebase context. If uncertain, use run_command to scan/list the directory first.
- Never assume file structure without evidence. If the CODER's output references paths you haven't seen in the context, flag it — do not blindly create edit_file calls for paths that may not exist.

TOOL CALL ACCURACY:
- For edit_file: the old_string must be a VERBATIM copy of the text currently in the file. If the CODER provided a SEARCH block, use it exactly — do not paraphrase or approximate.
- For create_file: the content must be the COMPLETE file content. Do not truncate.
- Tool calls must match the code changes exactly — do not add, skip, or alter any change from the CODER output.
- If the CODER output is ambiguous or contradictory, prefer the most conservative interpretation (fewer changes over more).

AVAILABLE TOOLS:
- create_file(path, content): Create a new file with the given content
- edit_file(path, old_string, new_string): Replace old_string with new_string in the file
- delete_file(path): Delete a file
- run_command(command): Run a shell command

OUTPUT FORMAT (JSON array of tool calls):
[
  { "tool": "create_file", "args": { "path": "src/foo.ts", "content": "..." } },
  { "tool": "edit_file", "args": { "path": "src/bar.ts", "old_string": "...", "new_string": "..." } },
  { "tool": "run_command", "args": { "command": "npm install somepackage" } }
]

RULES:
- Parse the CODER output carefully to extract all file changes.
- For SEARCH/REPLACE blocks, use edit_file with the exact old_string and new_string.
- For new files (--- FILE: path ---), use create_file with the complete content.
- Include ALL changes — missing a file edit will cause verification to fail.
- Order tool calls logically: creates before edits, installs before imports.
- After constructing your tool call list, count the file changes in the CODER output and verify your tool call count matches. If they don't match, you missed something.

${TASK_DECOMPOSITION_RULES_COMPACT}

${ZERO_DEFECT_RULES_COMPACT}

${UNIVERSAL_COMPLETION_CHECKLIST_COMPACT}

GIT RULES (applies to ALL Titan AI commits):
- Version lives in 3 files: package.json, apps/desktop/package.json, apps/web/package.json. ALL THREE must match.
- manifest.json is auto-updated by CI. Never edit it manually.
- Before ANY commit: verify no broken imports (every import must resolve to a real file/module).
- Before version bump: verify the code compiles. Never tag broken code.
- Commit format: "vX.Y.Z: one-line description"
- After push: verify with git log --oneline -3. After tag push: verify CI with gh run list --limit 3.
- NEVER force-push to main.`;

export async function runExecutor(
  artifact: CodeArtifact,
  config: SniperConfig,
  costTracker: SniperCostTracker,
  executeTool: ToolCallFn,
): Promise<{ toolCalls: ToolCallLog[]; success: boolean }> {
  const userMessage = `## CODER Output\n${artifact.codeChanges}`;

  const response = await callModelDirect(
    config.models.executor,
    [
      { role: 'system', content: EXECUTOR_SYSTEM },
      { role: 'user', content: userMessage },
    ],
    { temperature: 0.05, maxTokens: 8000 },
  );

  costTracker.record(config.models.executor, estimateTokens(userMessage), estimateTokens(response));

  let toolCallSpecs: Array<{ tool: string; args: Record<string, unknown> }>;
  try {
    const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    const raw = jsonMatch ? jsonMatch[1] : response;
    const parsed = JSON.parse(raw.trim());
    toolCallSpecs = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    toolCallSpecs = parseToolCallsFromText(artifact.codeChanges);
  }

  const toolCalls: ToolCallLog[] = [];
  let allSuccess = true;

  for (const spec of toolCallSpecs) {
    const start = Date.now();
    try {
      const result = await executeTool(spec.tool, spec.args);
      toolCalls.push({
        tool: spec.tool,
        args: spec.args,
        success: result.success,
        result: result.output.slice(0, 500),
        elapsed: Date.now() - start,
      });
      if (!result.success) allSuccess = false;
    } catch (err) {
      toolCalls.push({
        tool: spec.tool,
        args: spec.args,
        success: false,
        result: (err as Error).message,
        elapsed: Date.now() - start,
      });
      allSuccess = false;
    }
  }

  return { toolCalls, success: allSuccess };
}

function parseToolCallsFromText(
  coderOutput: string,
): Array<{ tool: string; args: Record<string, unknown> }> {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];

  const fileBlockRegex = /--- FILE: (.+?) ---\n([\s\S]*?)--- END FILE ---/g;
  let match;
  while ((match = fileBlockRegex.exec(coderOutput)) !== null) {
    calls.push({
      tool: 'create_file',
      args: { path: match[1].trim(), content: match[2].trim() },
    });
  }

  const searchReplaceRegex = /<<<SEARCH\n([\s\S]*?)\n===\n([\s\S]*?)\nREPLACE>>>/g;
  let srMatch;
  while ((srMatch = searchReplaceRegex.exec(coderOutput)) !== null) {
    calls.push({
      tool: 'edit_file',
      args: { old_string: srMatch[1], new_string: srMatch[2] },
    });
  }

  return calls;
}
