import { NextRequest, NextResponse } from 'next/server';
import { callMidnightAction, jsonProxyResult } from '../_lib/proxy';

/**
 * GET /api/midnight/snapshots - List snapshots
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const result = await callMidnightAction(request, {
    action: 'getSnapshots',
    ...(projectId ? { projectId } : {}),
  });
  return jsonProxyResult(result);
}

/**
 * POST /api/midnight/snapshots - Create a manual snapshot
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectId } = body;

  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId is required' },
      { status: 400 }
    );
  }

  const result = await callMidnightAction(request, {
    action: 'createSnapshot',
    projectId,
    label: body.label || 'manual',
  });
  return jsonProxyResult(result);
}
