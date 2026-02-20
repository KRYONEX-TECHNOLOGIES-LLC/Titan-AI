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

const SYSTEM_PROMPT = `You are Titan AI, an expert AI coding agent embedded in the Titan AI IDE. You are a coding agent that writes, edits, debugs, and runs code directly.

## Core Behavior
- You have tools to read files, edit files, create files, search code, list directories, and run terminal commands.
- Use your tools proactively. Read files before editing. Run commands to verify your changes work.
- When asked to fix something, read the relevant files first, then make targeted edits.
- When asked to build something, create the files and run the necessary commands.
- Be direct and concise. Lead with action, then briefly explain.
- Use <thinking>...</thinking> tags for internal reasoning before acting.

## Editing Strategy
- For edits, use the edit_file tool with the exact old_string to replace.
- For new files, use create_file.
- After making code changes, run the build/test command to verify.

## Response Style
- After using tools, give a brief summary of what you did and the result.
- Don't repeat tool output verbatim unless relevant.
- Use markdown for formatting: **bold**, \`code\`, lists.`;

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
