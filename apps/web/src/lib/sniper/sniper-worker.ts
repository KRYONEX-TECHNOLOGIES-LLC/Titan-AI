// ── Titan Plan Sniper V2 — CODER Role (Worker) ───────────────────────────────
// Uses native tool/function calling to directly execute create_file, edit_file,
// run_command, etc. Eliminates the EXECUTOR role entirely.

import { callModelWithTools, type ModelToolResponse } from '@/lib/llm-call';
import { ZERO_DEFECT_RULES_COMPACT, TASK_DECOMPOSITION_RULES_COMPACT, GIT_RULES, UNIVERSAL_COMPLETION_CHECKLIST_COMPACT } from '@/lib/shared/coding-standards';
import type {
  SniperConfig,
  SniperDAGNode,
  ScanResult,
  CodeArtifact,
  ToolCallLog,
  SniperCostTracker,
} from './sniper-model';
import { estimateTokens, getCoderModel } from './sniper-model';

export type ToolCallFn = (
  tool: string,
  args: Record<string, unknown>,
) => Promise<{ success: boolean; output: string }>;

const WORKER_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'create_file',
      description: 'Create a new file with content. Parent directories are created automatically.',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'Relative file path' }, content: { type: 'string', description: 'Full file content' } }, required: ['path', 'content'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing an exact string match.',
      parameters: { type: 'object', properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['path', 'old_string', 'new_string'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read file contents.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_directory',
      description: 'List files and directories.',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'Directory path (default: .)' } }, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: 'Run a shell command. Use for npm install, git init, etc.',
      parameters: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string', description: 'Working directory (optional)' } }, required: ['command'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_file',
      description: 'Delete a file or directory.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'grep_search',
      description: 'Search for text/patterns across the codebase. Use BEFORE creating files to find existing patterns and conventions.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Text or regex pattern to search for' }, path: { type: 'string', description: 'Directory to search in (default: .)' }, glob: { type: 'string', description: 'File type filter (e.g. *.tsx,*.ts)' } }, required: ['query'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'glob_search',
      description: 'Find files matching a name pattern across the workspace.',
      parameters: { type: 'object', properties: { pattern: { type: 'string', description: 'Filename pattern (e.g. *.test.ts, layout.tsx)' }, path: { type: 'string', description: 'Base directory (default: .)' } }, required: ['pattern'] },
    },
  },
];

const WORKER_SYSTEM = `You are CODER, the implementation agent in the Titan Plan Sniper V2 pipeline.
You receive a specific task with context about the codebase. Your job is to DIRECTLY EXECUTE
the code changes needed to complete the task using tool calls.

YOU HAVE DIRECT TOOL ACCESS. Do NOT write code in text. Use the tools:
- create_file(path, content): Create a new file with COMPLETE content
- edit_file(path, old_string, new_string): Edit existing file by replacing exact string match
- read_file(path): Read file contents before editing
- list_directory(path): List directory contents
- run_command(command): Run shell commands (npm install, etc.)
- delete_file(path): Delete files
- grep_search(query): Search codebase for patterns
- glob_search(pattern): Find files by name pattern

MANDATORY WORKFLOW:
1. RESEARCH FIRST: Use list_directory, grep_search, glob_search, read_file to understand the codebase
2. IMPLEMENT: Use create_file and edit_file to make changes. Every file must have COMPLETE content.
3. VERIFY: Use read_file on modified files to confirm changes are correct.

RULES:
- ALWAYS read a file before editing it (read_file then edit_file)
- For edit_file: old_string must be a VERBATIM copy of existing text
- For create_file: content must be COMPLETE, production-quality code (min 20 chars for code files)
- No TODOs, no placeholders, no stubs, no "implement here"
- Match existing codebase conventions (naming, imports, patterns)
- Handle edge cases, errors, and loading states
- Use TypeScript types, proper error handling
- Plain text only. NO emojis. Professional, direct, technical language.
- After writing code, read it back to verify correctness

${TASK_DECOMPOSITION_RULES_COMPACT}
${ZERO_DEFECT_RULES_COMPACT}
${UNIVERSAL_COMPLETION_CHECKLIST_COMPACT}
${GIT_RULES}`;

export async function runWorker(
  node: SniperDAGNode,
  scanResult: ScanResult,
  config: SniperConfig,
  costTracker: SniperCostTracker,
  executeTool: ToolCallFn,
  fileContents?: Record<string, string>,
): Promise<CodeArtifact> {
  const model = getCoderModel(node.risk, config);
  const maxRounds = config.maxWorkerIterations;

  const contextParts = [
    `## Task: ${node.title}`,
    `Description: ${node.description}`,
    `Type: ${node.taskType} | Risk: ${node.risk}`,
    `\n## Acceptance Criteria\n${node.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
    `\n## Relevant Files: ${node.relevantFiles.join(', ') || 'none specified'}`,
    `\n## Codebase Context`,
    `File Tree:\n${scanResult.fileTree.slice(0, 4000)}`,
    `Conventions: ${scanResult.conventions.join('; ')}`,
    `Patterns: ${scanResult.existingPatterns.join('; ')}`,
    `Dependencies: ${scanResult.dependencies.slice(0, 20).join(', ')}`,
  ];

  if (fileContents && Object.keys(fileContents).length > 0) {
    contextParts.push('\n## Existing File Contents');
    for (const [filePath, content] of Object.entries(fileContents)) {
      contextParts.push(`\n### ${filePath}\n\`\`\`\n${content.slice(0, 6000)}\n\`\`\``);
    }
  }

  const userMessage = contextParts.join('\n');
  const toolCalls: ToolCallLog[] = [];
  const filesModified: string[] = [];

  const messages: Array<{ role: string; content: string | null; tool_call_id?: string; tool_calls?: unknown[] }> = [
    { role: 'system', content: WORKER_SYSTEM },
    { role: 'user', content: userMessage },
  ];

  let totalOutput = '';

  for (let round = 0; round < maxRounds; round++) {
    let response: ModelToolResponse;
    try {
      response = await callModelWithTools(model, messages, WORKER_TOOL_DEFINITIONS, {
        temperature: 0.15,
        maxTokens: 16000,
      });
    } catch (err) {
      totalOutput += `\n[CODER ERROR round ${round}]: ${(err as Error).message}`;
      break;
    }

    costTracker.record(model, estimateTokens(userMessage), estimateTokens(response.content || ''));

    if (response.content) {
      totalOutput += response.content + '\n';
    }

    if (response.toolCalls.length === 0) {
      messages.push({ role: 'assistant', content: response.content });
      break;
    }

    messages.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    for (const tc of response.toolCalls) {
      const start = Date.now();
      try {
        const result = await executeTool(tc.name, tc.arguments);
        const elapsed = Date.now() - start;

        toolCalls.push({
          tool: tc.name,
          args: tc.arguments,
          success: result.success,
          result: result.output.slice(0, 500),
          elapsed,
        });

        if ((tc.name === 'create_file' || tc.name === 'write_file') && result.success) {
          const fp = tc.arguments.path as string;
          if (!filesModified.includes(fp)) filesModified.push(fp);
        }
        if (tc.name === 'edit_file' && result.success) {
          const fp = tc.arguments.path as string;
          if (!filesModified.includes(fp)) filesModified.push(fp);
        }

        messages.push({
          role: 'tool',
          content: JSON.stringify({ success: result.success, output: result.output.slice(0, 4000) }),
          tool_call_id: tc.id,
        });
      } catch (err) {
        const elapsed = Date.now() - start;
        toolCalls.push({
          tool: tc.name,
          args: tc.arguments,
          success: false,
          result: (err as Error).message,
          elapsed,
        });

        messages.push({
          role: 'tool',
          content: JSON.stringify({ success: false, output: '', error: (err as Error).message }),
          tool_call_id: tc.id,
        });
      }
    }
  }

  return {
    nodeId: node.id,
    model,
    role: 'CODER',
    output: totalOutput,
    codeChanges: totalOutput,
    filesModified,
    toolCalls,
    createdAt: Date.now(),
  };
}
