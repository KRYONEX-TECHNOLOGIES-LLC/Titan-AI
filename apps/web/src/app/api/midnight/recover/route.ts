import { NextRequest, NextResponse } from 'next/server';
import { callMidnightAction, jsonProxyResult } from '../_lib/proxy';

/**
 * POST /api/midnight/recover - Recover from a snapshot
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { snapshotId } = body;

  if (!snapshotId) {
    return NextResponse.json(
      { error: 'snapshotId is required' },
      { status: 400 }
    );
  }

  const result = await callMidnightAction(request, {
    action: 'recoverSnapshot',
    snapshotId,
  });
  return jsonProxyResult(result);
}
