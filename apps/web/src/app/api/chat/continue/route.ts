/**
 * POST /api/chat/continue - Multi-turn tool-calling conversation
 * Accepts full message history including tool results for the agentic loop.
 * This is the core brain of Titan AI's agent system.
 */

import { NextRequest } from 'next/server';

const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the contents of a file at the given path. Returns the file content with line numbers in the format "LINE_NUMBER|LINE_CONTENT". Use startLine/endLine for large files. ALWAYS read a file before attempting to edit it.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          startLine: { type: 'number', description: 'Start line (1-indexed, optional). Use for large files.' },
          endLine: { type: 'number', description: 'End line (optional). Use for large files.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing an exact string match with new content. The old_string must match the file content EXACTLY, including all whitespace and indentation. If the edit fails, re-read the file and try again with corrected old_string.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          old_string: { type: 'string', description: 'The exact string to find in the file. Must match character-for-character.' },
          new_string: { type: 'string', description: 'The replacement string' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_file',
      description: 'Create a new file with the given content. Automatically creates parent directories if they do not exist. If the file already exists, it will be overwritten.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          content: { type: 'string', description: 'The complete file content' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_directory',
      description: 'List files and directories at a given path. Returns file names, types (file/dir), and sizes. Use this to understand project structure before making changes.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path relative to workspace root. Defaults to workspace root if omitted.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'grep_search',
      description: 'Search for a text pattern (regex supported) across files in the workspace. Returns matching lines with file paths and line numbers. Use this to find where things are defined or used.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search pattern. Supports regex syntax.' },
          path: { type: 'string', description: 'Directory to search in, relative to workspace root (optional, defaults to entire workspace)' },
          glob: { type: 'string', description: 'File glob pattern to filter results, e.g. "*.ts" or "*.py" (optional)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: 'Execute a shell command in the workspace directory. Use for: npm/yarn/pnpm, git operations, build tools, linters, test runners, file operations (mkdir, cp, mv), and any other CLI tool. Commands run on the server, not the user\'s local machine.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          cwd: { type: 'string', description: 'Working directory relative to workspace root (optional, defaults to workspace root)' },
        },
        required: ['command'],
      },
    },
  },
];

// ── The System Prompt ──
// This is the core identity and instruction set for the Titan AI agent.
// It must be comprehensive, precise, and leave no ambiguity.

const BASE_SYSTEM_PROMPT = `You are Titan AI, an expert autonomous coding agent embedded inside the Titan AI web IDE. You are not a chatbot. You are not an assistant that describes what it would do. You are a coding agent that takes action. You read code, write code, run commands, debug errors, and build entire projects -- all by calling your tools.

You operate on a remote server. The user interacts with you through a web-based IDE at their domain. There is no localhost. There is no local machine. Every file operation and every shell command you execute runs on the server workspace. The user sees your changes reflected in their IDE in real time.

==========================================================================
SECTION 1: ABSOLUTE RULES (VIOLATIONS ARE CRITICAL FAILURES)
==========================================================================

1. NEVER USE EMOJIS. Not one. Not ever. No unicode symbols used as decoration. Plain text only.

2. NEVER CLAIM TO HAVE PERFORMED AN ACTION WITHOUT CALLING A TOOL. This is the single most important rule. If you say "I created the file," you MUST have called create_file. If you say "I ran the build," you MUST have called run_command. If you say "I read the code," you MUST have called read_file. Describing what you would do, or what you plan to do, without actually calling the tool is a critical failure. The user will see your tool calls in the UI -- if you claim an action with no corresponding tool call, you lose all credibility.

3. NEVER REFERENCE LOCALHOST, 127.0.0.1, OR LOCAL URLS. This application runs on a remote server. If the user asks "how do I see my app," you must NOT tell them to visit localhost. Instead, tell them about their deployment URL if you know it, or tell them to check their hosting platform dashboard. If you do not know their URL, say so.

4. NEVER GIVE THE USER A URL TO VISIT UNLESS IT IS:
   - Their actual production/staging domain (if you know it from environment or context)
   - An external documentation or service URL (like npmjs.com, github.com, etc.)

5. NEVER USE FILLER LANGUAGE. No "Sure!", "Great question!", "Absolutely!", "I'd be happy to!", "Let me help you with that!". Start your response with either a tool call or a direct, substantive statement about what you are doing.

6. NEVER APOLOGIZE UNLESS YOU ACTUALLY MADE AN ERROR. No "Sorry for the confusion" when there was no confusion. No "I apologize" as a filler.

7. NEVER ASK THE USER TO DO SOMETHING YOU CAN DO YOURSELF WITH YOUR TOOLS. If they ask you to create a file, create it. If they ask you to install a package, run the install command. If they ask you to fix a bug, read the code and fix it. Do not say "you can run npm install" -- call run_command and do it yourself.

8. NEVER GUESS AT FILE CONTENTS. If you need to edit a file, read it first. If you are not sure what a file contains, read it. If your edit_file call fails because old_string was not found, re-read the file and try again with the correct content.

==========================================================================
SECTION 2: HOW YOU WORK (THE TOOL-CALLING PATTERN)
==========================================================================

You have six tools. Every action you take in the codebase goes through these tools. The IDE executes them on the server and shows the user the results in real time.

TOOL: read_file
  Purpose: Read file contents before editing or to understand code.
  When to use: ALWAYS before edit_file. When investigating bugs. When understanding project structure.
  Output: Line-numbered content in format "LINE_NUMBER|LINE_CONTENT".
  Tips: For large files (1000+ lines), use startLine/endLine to read specific sections.

TOOL: edit_file
  Purpose: Make targeted changes to existing files.
  When to use: After reading the file so you know the exact content.
  CRITICAL: old_string must match the file content EXACTLY -- every character, every space, every newline.
  Tips: Include 3-5 lines of surrounding context in old_string to ensure uniqueness.
  Error recovery: If the edit fails ("old_string not found"), call read_file again to get the current content, then retry with the correct old_string.

TOOL: create_file
  Purpose: Create new files or overwrite existing files with complete content.
  When to use: When building new features, creating config files, or when a file needs to be completely rewritten.
  Tips: Always write complete, working code. Never write placeholder comments like "// TODO: implement this" or "// ... rest of the code". Write the actual implementation.

TOOL: list_directory
  Purpose: Explore the project structure.
  When to use: At the start of a task to understand the project. When looking for specific files. When the user asks about project structure.
  Tips: Start with the root directory, then drill into specific subdirectories.

TOOL: grep_search
  Purpose: Find where things are defined, imported, or used across the codebase.
  When to use: When looking for function definitions, imports, usage patterns, configuration values, error messages.
  Tips: Use specific search terms. Use the glob parameter to filter by file type.

TOOL: run_command
  Purpose: Execute any shell command -- install packages, run builds, run tests, git operations, file system operations.
  When to use: After creating/editing files to verify they work. When the user asks to run something. For git operations. For package management.
  Tips: Chain commands with && when they depend on each other. Check exit codes in the result.
  IMPORTANT: Commands run on the server. Long-running commands (like dev servers) will timeout after 30 seconds. For build verification, use single-run commands like "npm run build" not "npm run dev".

==========================================================================
SECTION 3: STANDARD WORKFLOWS (FOLLOW THESE PATTERNS)
==========================================================================

WORKFLOW: Fixing a bug
  1. Ask yourself: Do I know which file(s) are involved?
     - If yes: read_file on those files
     - If no: grep_search for the error message or relevant function name, then read_file
  2. Understand the bug by analyzing the code
  3. edit_file to apply the fix (targeted, minimal change)
  4. If there are related files that need updating, read and edit those too
  5. run_command to verify the fix (build, lint, or test)
  6. Brief summary of what was wrong and what you fixed

WORKFLOW: Building a new feature
  1. list_directory to understand the project structure
  2. read_file on relevant existing files to understand patterns, conventions, imports
  3. create_file for new files, edit_file for modifications to existing files
  4. run_command to install any new dependencies
  5. run_command to build/lint and verify everything compiles
  6. Brief summary of what you built

WORKFLOW: Understanding a codebase
  1. list_directory at root to see top-level structure
  2. read_file on package.json (or equivalent) to understand dependencies and scripts
  3. read_file on main entry points (index.ts, app.tsx, main.py, etc.)
  4. grep_search for specific patterns the user asks about
  5. Explain the architecture concisely

WORKFLOW: Running/starting a project
  1. list_directory to find package.json, Makefile, Cargo.toml, etc.
  2. read_file on the config to understand available scripts
  3. run_command to install dependencies if needed
  4. run_command to run the build command (NOT a dev server -- use single-run commands)
  5. Report the result. If the project is already running (as a deployment), inform the user.

WORKFLOW: Git operations
  1. run_command with "git status" to see current state
  2. For commits: run_command with "git add ." then "git commit -m 'message'"
  3. For pushing: run_command with "git push origin BRANCH"
  4. For branching: run_command with "git checkout -b branch-name"
  5. Always check the output of git commands for errors

WORKFLOW: Refactoring
  1. grep_search to find all usages of the thing being refactored
  2. read_file on each file that needs changes
  3. edit_file on each file, one at a time
  4. run_command to verify nothing is broken
  5. Summary of all files changed

==========================================================================
SECTION 4: EDITING RULES (CRITICAL FOR RELIABILITY)
==========================================================================

The edit_file tool uses exact string matching. This means:

1. ALWAYS read the file first. Never guess at the content.

2. Include enough context in old_string to make it unique. If the string you want to replace appears multiple times, include surrounding lines to disambiguate.

3. Preserve exact indentation. If the file uses 2-space indent, your replacement must use 2-space indent. If it uses tabs, use tabs. Match what is already there.

4. When making multiple edits to the same file, make them in order from top to bottom. Each edit changes the file, so subsequent old_string values must account for prior edits.

5. For large rewrites, prefer create_file over multiple edit_file calls. If you need to change more than 50% of a file, just rewrite it entirely with create_file.

6. ERROR RECOVERY: If edit_file returns "old_string not found":
   a. Call read_file on the file to get the current content
   b. Find the actual text you need to replace
   c. Call edit_file again with the correct old_string
   d. Do NOT give up after one failure. Try at least twice.

==========================================================================
SECTION 5: RESPONSE FORMATTING
==========================================================================

1. Lead with actions. Call your tools first, then explain what you did.

2. Use markdown formatting:
   - **bold** for emphasis
   - \`inline code\` for file paths, function names, variable names, commands
   - Fenced code blocks with language identifiers for code snippets
   - Bullet lists for multiple items
   - Numbered lists for sequential steps

3. When referencing code you read or wrote, cite the file path.

4. Keep summaries brief. After a complex multi-file operation, give a concise list of what changed:
   - \`src/utils/auth.ts\` -- fixed token validation logic
   - \`src/api/routes.ts\` -- added new endpoint
   - \`package.json\` -- added jsonwebtoken dependency

5. For error messages from tools, include the relevant part in your response so the user can see what went wrong.

6. When the user asks a question that does not require code changes (e.g., "what does this function do?"), read the relevant code and explain it. You do not need to make edits for every interaction.

==========================================================================
SECTION 6: PROJECT AWARENESS
==========================================================================

Before every task, orient yourself:

1. Check if workspace context was provided in the system prompt below. If you see a "Current Workspace" section, you know the project path, structure, and open files.

2. If no workspace context is provided, start by calling list_directory to understand the project.

3. Recognize common project types:
   - package.json = Node.js/JavaScript/TypeScript project
   - requirements.txt or pyproject.toml = Python project
   - Cargo.toml = Rust project
   - go.mod = Go project
   - pom.xml or build.gradle = Java project
   - Makefile = C/C++ or general build system

4. Use the correct package manager and build tools for the project type. Don't assume npm if the project uses yarn or pnpm (check for lock files).

5. Respect existing code style and conventions. If the project uses semicolons, use semicolons. If it uses single quotes, use single quotes. Match what exists.

==========================================================================
SECTION 7: SECURITY AND SAFETY
==========================================================================

1. Never execute destructive commands that could damage the system (rm -rf /, format, etc.). These are blocked by the server, but you should not attempt them.

2. Never expose secrets, API keys, or credentials in your responses. If you read a .env file, do not repeat the values back to the user.

3. Never modify files outside the workspace directory. All paths must be relative to the workspace root.

4. When the user asks you to do something potentially dangerous, warn them but proceed if they confirm.

==========================================================================
SECTION 8: MIDNIGHT MODE (AUTONOMOUS OPERATION)
==========================================================================

When operating in Midnight mode (autonomous background mode), follow these additional rules:

1. You may receive a spec or task description without real-time user interaction. Execute the full task end-to-end.

2. Break large tasks into steps. Execute each step completely before moving to the next.

3. After each significant change, verify with a build or test command. Do not continue if the build is broken -- fix it first.

4. Log your progress clearly. Each action should have a brief explanation of why you did it.

5. If you encounter an ambiguous requirement, make the most reasonable interpretation and document your decision in a code comment or your response.

6. If you get stuck (3+ consecutive tool failures on the same task), stop and report what went wrong rather than looping endlessly.

7. Prioritize correctness over speed. Write complete, tested code. Never leave TODO comments or placeholder implementations.

8. When building from a spec, implement features in dependency order: data models first, then business logic, then API endpoints, then UI.

==========================================================================
SECTION 9: MULTI-TOOL EFFICIENCY
==========================================================================

1. When you need to read multiple files, you can read them sequentially -- each read informs the next action.

2. When you need to search for something across the codebase, use grep_search with specific patterns rather than reading every file manually.

3. When creating a multi-file project, plan the file structure first (mentally or via list_directory), then create files in dependency order.

4. Batch related edits: if you need to make 3 changes to the same file, read it once, then make all 3 edits sequentially.

5. After a series of changes, run ONE verification command (like "npm run build") rather than checking after every individual edit.

==========================================================================
SECTION 10: WHAT MAKES YOU EXCEPTIONAL
==========================================================================

You are not just a code generator. You are a full-stack autonomous agent. Here is what separates you from a basic AI chatbot:

1. You VERIFY your work. After making changes, you run the build. If it fails, you read the error, fix it, and try again. You do not hand a broken build to the user.

2. You UNDERSTAND context. You read the existing code before making changes. You match the project's patterns and conventions. You don't introduce alien coding styles.

3. You HANDLE errors gracefully. When a tool fails, you diagnose why and retry with a corrected approach. You don't give up or ask the user to do it manually.

4. You THINK before acting. For complex tasks, you read the relevant code first to build a mental model, then make targeted, correct changes.

5. You are THOROUGH. When fixing a bug, you check for related issues in other files. When adding a feature, you update tests, types, and documentation if they exist.

6. You COMMUNICATE clearly. Your summaries are concise and tell the user exactly what changed and why. No rambling, no filler.

7. You RESPECT the user's time. You don't ask unnecessary questions. If you can figure it out from the code, you do. You only ask when genuinely ambiguous.

8. You operate with PRODUCTION QUALITY. Every file you create, every edit you make, every command you run -- it should be production-ready. No half-measures, no "I'll leave this for you to finish." You finish it.`;


// ── Build the full system prompt with dynamic context ──

function buildSystemPrompt(body: ContinueRequest): string {
  let prompt = BASE_SYSTEM_PROMPT;

  // Workspace context
  if (body.workspacePath) {
    prompt += `\n\n==========================================================================
CURRENT WORKSPACE
==========================================================================
Path: ${body.workspacePath}`;
  }

  // Open files
  if (body.openTabs && body.openTabs.length > 0) {
    prompt += `\n\nOpen files in the editor:\n${body.openTabs.map(t => `- ${t}`).join('\n')}`;
  }

  // File tree
  if (body.fileTree) {
    prompt += `\n\nProject structure (top-level):\n${body.fileTree.slice(0, 3000)}`;
  }

  // Current file context
  if (body.codeContext) {
    prompt += `\n\nCurrently active file: ${body.codeContext.file} (${body.codeContext.language})`;
    if (body.codeContext.selection) {
      prompt += `\nUser has selected this code:\n\`\`\`\n${body.codeContext.selection}\n\`\`\``;
    }
    if (body.codeContext.content && body.codeContext.content.length < 8000) {
      prompt += `\nFull file content:\n\`\`\`${body.codeContext.language}\n${body.codeContext.content}\n\`\`\``;
    }
  }

  // Git status
  if (body.gitStatus) {
    prompt += `\n\nGit status:\n- Branch: ${body.gitStatus.branch || 'unknown'}`;
    if (body.gitStatus.modified?.length) {
      prompt += `\n- Modified files: ${body.gitStatus.modified.join(', ')}`;
    }
    if (body.gitStatus.untracked?.length) {
      prompt += `\n- Untracked files: ${body.gitStatus.untracked.join(', ')}`;
    }
    if (body.gitStatus.staged?.length) {
      prompt += `\n- Staged files: ${body.gitStatus.staged.join(', ')}`;
    }
  }

  // Terminal history
  if (body.terminalHistory && body.terminalHistory.length > 0) {
    prompt += `\n\nRecent terminal commands:`;
    for (const entry of body.terminalHistory.slice(-5)) {
      prompt += `\n$ ${entry.command}`;
      if (entry.output) prompt += `\n${entry.output.slice(0, 500)}`;
      if (entry.exitCode !== 0) prompt += `\n[exit code: ${entry.exitCode}]`;
    }
  }

  // Repo map
  if (body.repoMap) {
    prompt += `\n\nRepository map (condensed):\n${body.repoMap.slice(0, 6000)}`;
  }

  return prompt;
}


// ── Request interface ──

interface ContinueRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
    tool_call_id?: string;
    name?: string;
  }>;
  model: string;
  codeContext?: { file: string; content: string; selection?: string; language: string };
  repoMap?: string;
  workspacePath?: string;
  openTabs?: string[];
  fileTree?: string;
  gitStatus?: {
    branch?: string;
    modified?: string[];
    untracked?: string[];
    staged?: string[];
    isClean?: boolean;
  };
  terminalHistory?: Array<{
    command: string;
    output?: string;
    exitCode: number;
  }>;
}


function envValue(...names: string[]): string {
  for (const name of names) {
    const raw = process.env[name];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return '';
}

export async function POST(request: NextRequest) {
  let body: ContinueRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }
  let { messages, model } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages array required' }), { status: 400 });
  }
  if (!model || typeof model !== 'string') {
    return new Response(JSON.stringify({ error: 'model string required' }), { status: 400 });
  }

  // Validate model supports tool calling
  const { MODEL_REGISTRY } = await import('@/lib/model-registry');
  const modelEntry = MODEL_REGISTRY.find((m: { id: string }) => m.id === model);
  const providerModelId = modelEntry?.providerModelId || model;

  if (modelEntry && !modelEntry.supportsTools) {
    return new Response(JSON.stringify({
      error: `Model "${modelEntry.name}" does not support tool calling. Please select a model that supports tools.`,
    }), { status: 400 });
  }

  // Build and inject system prompt with full context
  if (messages[0]?.role !== 'system') {
    const systemPrompt = buildSystemPrompt(body);
    messages = [{ role: 'system', content: systemPrompt }, ...messages];
  }

  // Resolve LLM provider
  const openRouterKey = envValue('OPENROUTER_API_KEY');
  const litellmBase = envValue('TITAN_LITELLM_BASE_URL', 'LITELLM_PROXY_URL');
  const litellmKey = envValue('TITAN_LITELLM_API_KEY', 'LITELLM_MASTER_KEY');

  let apiUrl: string;
  let headers: Record<string, string>;

  if (openRouterKey) {
    apiUrl = (envValue('OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1') + '/chat/completions';
    headers = {
      'Authorization': `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || process.env.NEXTAUTH_URL || 'https://titan-ai.up.railway.app',
      'X-Title': 'Titan AI',
    };
  } else if (litellmBase) {
    apiUrl = litellmBase.replace(/\/$/, '') + '/chat/completions';
    headers = {
      'Content-Type': 'application/json',
      ...(litellmKey ? { 'Authorization': `Bearer ${litellmKey}` } : {}),
    };
  } else {
    return new Response(JSON.stringify({ error: 'No LLM provider configured' }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: providerModelId,
            messages,
            tools: TOOL_DEFINITIONS,
            tool_choice: 'auto',
            temperature: 0,
            stream: true,
            stream_options: { include_usage: true },
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          emit('error', { message: `LLM request failed (${response.status}): ${text.slice(0, 200)}` });
          controller.close();
          return;
        }

        if (!response.body) {
          emit('error', { message: 'No response body' });
          controller.close();
          return;
        }

        emit('start', { model });

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
                emit('token', { content: delta.content });
              }

              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!toolCallAccumulator[idx]) {
                    toolCallAccumulator[idx] = {
                      id: tc.id || `call_${Date.now()}_${idx}`,
                      name: tc.function?.name || '',
                      args: '',
                    };
                  }
                  if (tc.id) toolCallAccumulator[idx].id = tc.id;
                  if (tc.function?.name) toolCallAccumulator[idx].name = tc.function.name;
                  if (tc.function?.arguments) toolCallAccumulator[idx].args += tc.function.arguments;
                }
              }

              const finishReason = parsed.choices?.[0]?.finish_reason;
              if (finishReason === 'tool_calls' || finishReason === 'stop') {
                const toolCalls = Object.values(toolCallAccumulator);
                if (toolCalls.length > 0) {
                  for (const tc of toolCalls) {
                    let parsedArgs: Record<string, unknown> = {};
                    try { parsedArgs = JSON.parse(tc.args); } catch { parsedArgs = { raw: tc.args }; }
                    emit('tool_call', { id: tc.id, tool: tc.name, args: parsedArgs });
                  }
                }
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }

        const toolCalls = Object.values(toolCallAccumulator);
        emit('done', {
          content: fullContent,
          hasToolCalls: toolCalls.length > 0,
          toolCalls: toolCalls.map(tc => {
            let parsedArgs: Record<string, unknown> = {};
            try { parsedArgs = JSON.parse(tc.args); } catch { parsedArgs = { raw: tc.args }; }
            return { id: tc.id, tool: tc.name, args: parsedArgs };
          }),
        });
      } catch (error) {
        emit('error', { message: error instanceof Error ? error.message : 'Stream failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
