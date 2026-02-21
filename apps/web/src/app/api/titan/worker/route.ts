/**
 * POST /api/titan/worker — Execute a single Worker lane
 *
 * Receives a lane_id and workspace context, executes the Coder agent
 * for that lane, streams tool calls and tokens via SSE, and returns
 * the completed worker artifact.
 */

import { NextRequest } from 'next/server';
import { laneStore } from '@/lib/lanes/lane-store';
import { executeWorkerLane } from '@/lib/lanes/worker';

export async function POST(request: NextRequest) {
  let body: { lane_id: string; workspacePath: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { lane_id, workspacePath } = body;
  if (!lane_id) {
    return new Response(JSON.stringify({ error: 'lane_id required' }), { status: 400 });
  }

  const lane = laneStore.getLane(lane_id);
  if (!lane) {
    return new Response(JSON.stringify({ error: `Lane not found: ${lane_id}` }), { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // stream may have been closed
        }
      };

      try {
        emit('start', { lane_id, status: 'WORKING' });

        const executeToolCall = async (tool: string, args: Record<string, unknown>) => {
          try {
            const res = await fetch(`${request.nextUrl.origin}/api/agent/tools`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tool, args, workspacePath }),
            });
            const data = await res.json();
            return {
              success: data.success !== false,
              output: data.output || data.result || '',
              error: data.error,
            };
          } catch (e) {
            return {
              success: false,
              output: '',
              error: e instanceof Error ? e.message : 'Tool execution failed',
            };
          }
        };

        const artifact = await executeWorkerLane(lane, {
          onToken: (lId, token) => {
            emit('token', { lane_id: lId, content: token });
          },
          onToolCall: (lId, tool, args) => {
            emit('tool_call', { lane_id: lId, tool, args });
          },
          onToolResult: (lId, tool, result, success) => {
            emit('tool_result', { lane_id: lId, tool, success, result: result.slice(0, 2000) });
          },
          executeToolCall,
        });

        emit('done', {
          lane_id,
          status: 'PENDING_VERIFY',
          artifact: {
            inspectionEvidence: artifact.inspectionEvidence.slice(0, 500),
            codeChanges: artifact.codeChanges.slice(0, 1000),
            selfReview: artifact.selfReview.slice(0, 500),
            verificationHints: artifact.verificationHints.slice(0, 500),
            filesModified: artifact.filesModified,
            toolCallCount: artifact.toolCallLog.length,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Worker execution failed';
        emit('error', { lane_id, message });

        try {
          laneStore.transitionLane(lane_id, 'FAILED', 'system', `Worker error: ${message}`);
        } catch {
          // lane may already be in a terminal state
        }
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
