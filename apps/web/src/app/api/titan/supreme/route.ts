import { NextRequest } from 'next/server';
import { DEFAULT_SUPREME_CONFIG } from '@/lib/supreme/supreme-model';
import { orchestrateSupreme } from '@/lib/supreme/overseer';
import { callModelDirect } from '@/lib/llm-call';

interface SupremeRequestBody {
  goal: string;
  sessionId: string;
  workspacePath?: string;
  fileTree?: string;
  openTabs?: string[];
  gitBranch?: string;
  isDesktop?: boolean;
  osPlatform?: string;
}

export async function POST(request: NextRequest) {
  let body: SupremeRequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (!body.goal || typeof body.goal !== 'string') {
    return new Response(JSON.stringify({ error: 'goal string required' }), { status: 400 });
  }
  if (!body.sessionId || typeof body.sessionId !== 'string') {
    return new Response(JSON.stringify({ error: 'sessionId required' }), { status: 400 });
  }

  const baseUrl = request.nextUrl.origin;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, payload: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // stream may already be closed
        }
      };

      const executeToolCall = async (tool: string, args: Record<string, unknown>) => {
        try {
          const res = await fetch(`${baseUrl}/api/agent/tools`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool, args, workspacePath: body.workspacePath || '' }),
          });
          const data = await res.json();
          return {
            success: data.success !== false,
            output: data.output || data.result || '',
            error: data.error,
          };
        } catch (error) {
          return {
            success: false,
            output: '',
            error: error instanceof Error ? error.message : 'Tool execution failed',
          };
        }
      };

      const invokeModel = async (
        model: string,
        messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
      ) => {
        return callModelDirect(model, messages);
      };

      try {
        const result = await orchestrateSupreme(body.goal, body.sessionId, {
          onEvent: (type, payload) => emit(type, payload),
          executeToolCall,
          invokeModel,
          workspacePath: body.workspacePath || '',
        }, DEFAULT_SUPREME_CONFIG);

        emit('orchestration_result', {
          ...result,
          config: {
            models: DEFAULT_SUPREME_CONFIG.models,
            debateThreshold: DEFAULT_SUPREME_CONFIG.debateThreshold,
            quorumSize: DEFAULT_SUPREME_CONFIG.quorumSize,
          },
        });
      } catch (error) {
        emit('orchestration_error', {
          message: error instanceof Error ? error.message : 'Supreme orchestration failed',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
