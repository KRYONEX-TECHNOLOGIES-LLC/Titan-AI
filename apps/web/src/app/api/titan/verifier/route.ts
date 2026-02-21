/**
 * POST /api/titan/verifier — Execute verification on a lane
 *
 * Receives a lane_id, runs the Ruthless Verifier against the lane's
 * worker artifact, and returns the PASS/FAIL verdict with findings.
 */

import { NextRequest } from 'next/server';
import { laneStore } from '@/lib/lanes/lane-store';
import { executeVerifierLane } from '@/lib/lanes/verifier';

export async function POST(request: NextRequest) {
  let body: { lane_id: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { lane_id } = body;
  if (!lane_id) {
    return new Response(JSON.stringify({ error: 'lane_id required' }), { status: 400 });
  }

  const lane = laneStore.getLane(lane_id);
  if (!lane) {
    return new Response(JSON.stringify({ error: `Lane not found: ${lane_id}` }), { status: 404 });
  }

  if (!lane.artifacts.workerOutput) {
    return new Response(JSON.stringify({ error: `Lane ${lane_id} has no worker artifact to verify` }), { status: 400 });
  }

  if (lane.status !== 'PENDING_VERIFY') {
    return new Response(JSON.stringify({ error: `Lane ${lane_id} is in status ${lane.status}, expected PENDING_VERIFY` }), { status: 400 });
  }

  try {
    const artifact = await executeVerifierLane(lane);

    return new Response(JSON.stringify({
      lane_id,
      verdict: artifact.verdict,
      status: artifact.verdict === 'PASS' ? 'VERIFIED' : 'REJECTED',
      findings: artifact.findings,
      checklistResults: artifact.checklistResults,
      rationale: artifact.rationale,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed';

    try {
      laneStore.transitionLane(lane_id, 'FAILED', 'system', `Verifier error: ${message}`);
    } catch {
      // lane may already be in terminal state
    }

    return new Response(JSON.stringify({
      lane_id,
      error: message,
      status: 'FAILED',
    }), { status: 500 });
  }
}
