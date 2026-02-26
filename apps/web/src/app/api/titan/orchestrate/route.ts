/**
 * POST /api/titan/orchestrate — Main Titan Protocol v2 Orchestration Endpoint
 *
 * Receives a user's goal and workspace context, spawns the Supervisor,
 * decomposes into parallel lanes, and streams all events back via SSE.
 *
 * This is the entry point for Titan Protocol v2 (Parallel) mode.
 */

import { NextRequest } from 'next/server';
import { orchestrate } from '@/lib/lanes/supervisor';
import { DEFAULT_PROTOCOL_V2_CONFIG } from '@/lib/lanes/lane-model';
import type { LaneEvent } from '@/lib/lanes/lane-model';
import { laneStore } from '@/lib/lanes/lane-store';

interface OrchestrateRequest {
  goal: string;
  sessionId: string;
  workspacePath: string;
  fileTree?: string;
  openTabs?: string[];
  gitBranch?: string;
  isDesktop?: boolean;
  osPlatform?: string;
  cartographyContext?: string;
}

export async function POST(request: NextRequest) {
  let body: OrchestrateRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { goal, sessionId, workspacePath } = body;

  if (!goal || typeof goal !== 'string') {
    return new Response(JSON.stringify({ error: 'goal string required' }), { status: 400 });
  }
  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'sessionId required' }), { status: 400 });
  }

  // Build workspace context for the Supervisor's decomposition
  const workspaceContext = buildWorkspaceContext(body);
  const baseUrl = request.nextUrl.origin;

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

      const onEvent = (laneEvent: LaneEvent) => {
        emit('lane_event', laneEvent);
      };

      const executeToolCall = async (tool: string, args: Record<string, unknown>) => {
        try {
          const res = await fetch(`${baseUrl}/api/agent/tools`, {
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

      try {
        emit('orchestration_start', {
          goal,
          sessionId,
          config: DEFAULT_PROTOCOL_V2_CONFIG,
        });

        const result = await orchestrate(
          goal,
          sessionId,
          workspaceContext,
          {
            onEvent,
            executeToolCall,
            baseUrl,
            workspacePath: workspacePath || '',
          },
          DEFAULT_PROTOCOL_V2_CONFIG,
        );

        const lanes = laneStore.getLanesByManifest(result.manifestId);
        const workerOutputs = lanes
          .map(l => l.artifacts?.workerOutput?.rawOutput || l.artifacts?.workerOutput?.codeChanges || '')
          .filter(o => o.trim().length > 0);
        const combinedOutput = workerOutputs.join('\n\n---\n\n');

        emit('orchestration_complete', {
          manifestId: result.manifestId,
          success: result.success,
          lanesTotal: result.lanesTotal,
          lanesMerged: result.lanesMerged,
          lanesFailed: result.lanesFailed,
          totalCost: result.totalCost,
          totalDurationMs: result.totalDurationMs,
          output: combinedOutput.slice(0, 50000),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Orchestration failed';
        emit('orchestration_error', { message });
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

function buildWorkspaceContext(body: OrchestrateRequest): string {
  const parts: string[] = [];

  if (body.workspacePath) {
    parts.push(`Workspace: ${body.workspacePath}`);
  }

  if (body.fileTree) {
    parts.push(`Project structure (loaded in IDE):\n${body.fileTree.slice(0, 8000)}`);
  }

  if (body.openTabs && body.openTabs.length > 0) {
    parts.push(`Open files:\n${body.openTabs.map(t => `  - ${t}`).join('\n')}`);
  }

  if (body.gitBranch) {
    parts.push(`Git branch: ${body.gitBranch}`);
  }

  if (body.isDesktop) {
    parts.push(`Environment: Titan AI Desktop (Electron)`);
    parts.push(`OS: ${body.osPlatform || 'unknown'}`);
  }

  if (body.cartographyContext) {
    parts.push(body.cartographyContext);
  }

  return parts.join('\n\n');
}
