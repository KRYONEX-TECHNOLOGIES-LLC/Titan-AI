import { NextRequest, NextResponse } from 'next/server';
import { callMidnightAction, jsonProxyResult } from '../_lib/proxy';

/**
 * GET /api/midnight/queue - List queued projects
 */
export async function GET(request: NextRequest) {
  const result = await callMidnightAction(request, { action: 'getQueue' });
  if (!result.ok) return jsonProxyResult(result);

  const queue = ((result.body as { queue?: unknown[] }).queue || []) as unknown[];
  return NextResponse.json({
    projects: queue,
    total: queue.length,
    currentProject: (queue as Array<{ status?: string }>).find(p => p.status === 'building') || null,
  });
}

/**
 * POST /api/midnight/queue - Add project to queue
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectPath } = body;

  if (!projectPath) {
    return NextResponse.json(
      { error: 'projectPath is required' },
      { status: 400 }
    );
  }

  const result = await callMidnightAction(request, { action: 'addToQueue', path: projectPath });
  return jsonProxyResult(result);
}

/**
 * DELETE /api/midnight/queue - Remove project from queue
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('id');

  if (!projectId) {
    return NextResponse.json(
      { error: 'id parameter is required' },
      { status: 400 }
    );
  }

  const result = await callMidnightAction(request, { action: 'removeFromQueue', projectId });
  return jsonProxyResult(result);
}

/**
 * PATCH /api/midnight/queue - Reorder project priority
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { projectId, newPriority } = body;

  if (!projectId || newPriority === undefined) {
    return NextResponse.json(
      { error: 'projectId and newPriority are required' },
      { status: 400 }
    );
  }

  const result = await callMidnightAction(request, {
    action: 'reorderQueue',
    projectId,
    newIndex: newPriority,
  });
  return jsonProxyResult(result);
}
