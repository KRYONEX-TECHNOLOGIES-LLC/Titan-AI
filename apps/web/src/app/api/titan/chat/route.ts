import { NextRequest } from 'next/server';
import { DEFAULT_TITAN_CHAT_CONFIG } from '@/lib/titan-chat/titan-chat-model';
import { orchestrateTitanChat, TitanChatEventType } from '@/lib/titan-chat/titan-chat-orchestrator';

export const dynamic = 'force-dynamic';

interface TitanChatRequestBody {
  goal: string;
  sessionId: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  workspacePath?: string;
  fileTree?: string;
  cartographyContext?: string;
}

export async function POST(request: NextRequest) {
  let body: TitanChatRequestBody;
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
          // stream closed
        }
      };

      const invokeModel = async (
        model: string,
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      ) => {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: body.sessionId,
            message: messages.filter(m => m.role !== 'system').map((m) => `[${m.role}] ${m.content}`).join('\n\n'),
            model,
            stream: false,
          }),
        });
        const data = await res.json() as { content?: string; error?: string };
        if (!res.ok) throw new Error(data?.error || `Model call failed (${res.status})`);
        return String(data.content || '');
      };

      try {
        const result = await orchestrateTitanChat(
          body.goal,
          body.history || [],
          {
            onEvent: (type: TitanChatEventType, payload: Record<string, unknown>) => emit(type, payload),
            invokeModel,
          },
          DEFAULT_TITAN_CHAT_CONFIG,
          {
            workspacePath: body.workspacePath,
            fileTree: body.fileTree,
            cartographyContext: body.cartographyContext,
          },
        );

        emit('chat_result', {
          success: result.success,
          output: result.output,
          pipeline: result.pipeline,
          complexity: result.complexity,
          elapsedMs: result.elapsedMs,
          cost: result.cost,
        });
      } catch (error) {
        emit('chat_error', {
          message: error instanceof Error ? error.message : 'Titan Chat orchestration failed',
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
