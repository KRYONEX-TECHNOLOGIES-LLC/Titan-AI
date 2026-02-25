import { NextRequest } from 'next/server';
import { orchestrateSniper } from '@/lib/sniper/sniper-orchestrator';
import { DEFAULT_SNIPER_CONFIG } from '@/lib/sniper/sniper-model';

interface SniperRequestBody {
  goal: string;
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    phase: number;
    priority: string;
    tags: string[];
    blockedBy: string[];
  }>;
  workspacePath?: string;
  fileTree?: string;
  openFiles?: string[];
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: SniperRequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (!body.goal || typeof body.goal !== 'string') {
    return new Response(JSON.stringify({ error: 'goal string required' }), { status: 400 });
  }
  if (!Array.isArray(body.tasks) || body.tasks.length === 0) {
    return new Response(JSON.stringify({ error: 'tasks array required' }), { status: 400 });
  }

  const baseUrl = request.nextUrl.origin;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, payload: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
        } catch { /* stream closed */ }
      };

      const executeTool = async (tool: string, args: Record<string, unknown>) => {
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
          };
        } catch (error) {
          return {
            success: false,
            output: error instanceof Error ? error.message : 'Tool execution failed',
          };
        }
      };

      const readFile = async (path: string): Promise<string> => {
        const result = await executeTool('read_file', { path });
        return result.output;
      };

      try {
        const result = await orchestrateSniper({
          goal: body.goal,
          tasks: body.tasks,
          workspacePath: body.workspacePath || '',
          fileTree: body.fileTree || '',
          openFiles: body.openFiles,
          config: DEFAULT_SNIPER_CONFIG,
          executeTool,
          readFile,
          onEvent: (event) => emit(event.type, event.data),
          onTaskStatusUpdate: (taskId, status, errorLog) => {
            emit('task_status', { taskId, status, errorLog });
          },
        });

        emit('sniper_result', {
          success: result.success,
          dagId: result.dagId,
          totalNodes: result.totalNodes,
          completedNodes: result.completedNodes,
          failedNodes: result.failedNodes,
          judgeScore: result.judgeVerdict?.score,
          totalCost: result.totalCost,
          durationMs: result.totalDurationMs,
          summary: result.summary,
        });
      } catch (error) {
        emit('sniper_error', {
          message: error instanceof Error ? error.message : 'Plan Sniper orchestration failed',
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
