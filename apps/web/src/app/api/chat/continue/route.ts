/**
 * POST /api/chat/continue - Multi-turn tool-calling conversation
 * Accepts full message history including tool results for the agentic loop.
 */

import { NextRequest } from 'next/server';

const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Returns the file content with line numbers.',
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
      description: 'Edit a file by replacing a specific string with new content. The old_string must match exactly.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          old_string: { type: 'string', description: 'Exact string to find and replace' },
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
      description: 'Create a new file with the given content. Creates parent directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          content: { type: 'string', description: 'File content' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_directory',
      description: 'List files and directories at a path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (default: workspace root)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'grep_search',
      description: 'Search for a text pattern across files. Returns matching lines with file paths.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search pattern (regex supported)' },
          path: { type: 'string', description: 'Directory to search in (optional)' },
          glob: { type: 'string', description: 'File glob pattern, e.g. *.ts (optional)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: 'Execute a shell command in the workspace. Use for npm, git, build tools, etc.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          cwd: { type: 'string', description: 'Working directory (optional)' },
        },
        required: ['command'],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are Titan AI, an expert coding agent inside the Titan AI web IDE. You operate on a remote server -- there is no localhost. All file operations and commands run on the server workspace.

## Rules
- NEVER use emojis in your responses. Not one.
- NEVER claim you performed an action without actually calling a tool. If you say you created a file, you must have called create_file. If you say you ran a command, you must have called run_command. No exceptions.
- NEVER reference localhost, 127.0.0.1, or local URLs. This is a deployed web application.
- NEVER give the user a URL to visit unless it is their actual production domain or an external service.
- Be direct and concise. No filler, no pleasantries, no "Sure!", no "Great question!".

## How You Work
You have tools. Use them. Do not describe what you would do -- do it.
1. Read files before editing them (call read_file first).
2. Make targeted edits with edit_file (exact old_string match required).
3. Create new files with create_file.
4. Run shell commands with run_command (npm, git, build tools, etc.).
5. Search code with grep_search when you need to find something.
6. List directories with list_directory to understand project structure.

## Editing Strategy
- Always read the file first so you know the exact content to match.
- Use edit_file with precise old_string -> new_string replacements.
- For new files, use create_file with complete content.
- After changes, run the relevant build/lint/test command to verify.

## Response Style
- Lead with action (tool calls), then give a brief summary of what you did.
- Use markdown: **bold** for emphasis, \`code\` for identifiers, fenced blocks for code.
- Keep explanations short. The code speaks for itself.
- When showing code, always include the file path.`;

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
  let { messages, model, codeContext, repoMap } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages array required' }), { status: 400 });
  }
  if (!model || typeof model !== 'string') {
    return new Response(JSON.stringify({ error: 'model string required' }), { status: 400 });
  }

  // Inject system prompt if not present
  if (messages[0]?.role !== 'system') {
    let sys = SYSTEM_PROMPT;
    if (codeContext) {
      sys += `\n\nCurrent file: ${codeContext.file} (${codeContext.language})`;
      if (codeContext.selection) sys += `\nSelected code:\n\`\`\`\n${codeContext.selection}\n\`\`\``;
    }
    if (repoMap) sys += `\n\n## Repository Map\n${repoMap.slice(0, 6000)}`;
    messages = [{ role: 'system', content: sys }, ...messages];
  }

  // Resolve provider
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
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
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

  // Look up the provider model ID from the model registry
  const { MODEL_REGISTRY } = await import('@/lib/model-registry');
  const modelEntry = MODEL_REGISTRY.find((m: any) => m.id === model);
  const providerModelId = modelEntry?.providerModelId || model;

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
            temperature: 0.2,
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

              // Text content
              if (delta.content) {
                fullContent += delta.content;
                emit('token', { content: delta.content });
              }

              // Tool calls (streamed incrementally)
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

              // Finish reason
              const finishReason = parsed.choices?.[0]?.finish_reason;
              if (finishReason === 'tool_calls' || finishReason === 'stop') {
                // Emit accumulated tool calls
                const toolCalls = Object.values(toolCallAccumulator);
                if (toolCalls.length > 0) {
                  for (const tc of toolCalls) {
                    let parsedArgs: Record<string, unknown> = {};
                    try { parsedArgs = JSON.parse(tc.args); } catch { parsedArgs = { raw: tc.args }; }
                    emit('tool_call', {
                      id: tc.id,
                      tool: tc.name,
                      args: parsedArgs,
                    });
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
