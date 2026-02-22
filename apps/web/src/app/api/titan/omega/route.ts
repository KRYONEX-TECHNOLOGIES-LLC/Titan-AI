import { NextRequest } from 'next/server';
import { DEFAULT_OMEGA_CONFIG, orchestrateOmega } from '../../../../lib/omega';

interface OmegaRequestBody {
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
  let body: OmegaRequestBody;
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
          // Stream may already be closed.
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
            metadata: data.metadata,
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
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: body.sessionId,
            message: messages.map((m) => `[${m.role}] ${m.content}`).join('\n\n'),
            model,
            stream: false,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Model call failed (${res.status})`);
        return String(data.content || '');
      };

      try {
        const result = await orchestrateOmega(body.goal, DEFAULT_OMEGA_CONFIG, {
          onEvent: (type, payload) => emit(type, payload),
          executeToolCall,
          invokeModel,
        });
        emit('orchestration_result', {
          ...result,
          config: DEFAULT_OMEGA_CONFIG,
        });
      } catch (error) {
        emit('orchestration_error', {
          message: error instanceof Error ? error.message : 'Omega orchestration failed',
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
