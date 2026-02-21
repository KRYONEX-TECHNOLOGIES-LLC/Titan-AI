/**
 * GET /api/lanes — List lanes with optional filters
 * Query params:
 *   manifest_id — filter by manifest
 *   status — filter by status
 *   lane_id — get a specific lane
 */

import { NextRequest } from 'next/server';
import { laneStore } from '@/lib/lanes/lane-store';
import type { LaneStatus } from '@/lib/lanes/lane-model';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const manifestId = searchParams.get('manifest_id');
  const status = searchParams.get('status') as LaneStatus | null;
  const laneId = searchParams.get('lane_id');

  if (laneId) {
    const lane = laneStore.getLane(laneId);
    if (!lane) {
      return new Response(JSON.stringify({ error: 'Lane not found' }), { status: 404 });
    }

    return new Response(JSON.stringify({
      lane: {
        lane_id: lane.lane_id,
        task_manifest_id: lane.task_manifest_id,
        subtask_node_id: lane.subtask_node_id,
        status: lane.status,
        spec: lane.spec,
        worker_model_id: lane.worker_model_id,
        verifier_model_id: lane.verifier_model_id,
        files_touched: lane.files_touched,
        artifacts: {
          hasWorkerOutput: !!lane.artifacts.workerOutput,
          hasVerifierReport: !!lane.artifacts.verifierReport,
          verifierVerdict: lane.artifacts.verifierReport?.verdict,
          verifierFindings: lane.artifacts.verifierReport?.findings,
          mergeResult: lane.artifacts.mergeResult,
        },
        audit_trail: lane.audit_trail,
        metrics: lane.metrics,
        failure_count: lane.failure_count,
        created_at: lane.created_at,
        updated_at: lane.updated_at,
        completed_at: lane.completed_at,
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let lanes;
  if (manifestId) {
    lanes = laneStore.getLanesByManifest(manifestId);
  } else if (status) {
    lanes = laneStore.getLanesByStatus(status);
  } else {
    lanes = laneStore.getLanesByManifest('');
  }

  const summaries = lanes.map(lane => ({
    lane_id: lane.lane_id,
    task_manifest_id: lane.task_manifest_id,
    subtask_node_id: lane.subtask_node_id,
    status: lane.status,
    title: lane.spec.title,
    worker_model_id: lane.worker_model_id,
    verifier_model_id: lane.verifier_model_id,
    files_touched: lane.files_touched.map(f => f.filePath),
    failure_count: lane.failure_count,
    created_at: lane.created_at,
    updated_at: lane.updated_at,
    completed_at: lane.completed_at,
    verifierVerdict: lane.artifacts.verifierReport?.verdict,
    elapsedMs: (lane.completed_at || Date.now()) - lane.created_at,
    totalCost: lane.metrics.totalCost,
  }));

  const stats = manifestId ? laneStore.getStats(manifestId) : undefined;

  return new Response(JSON.stringify({
    lanes: summaries,
    stats,
    manifest: manifestId ? laneStore.getManifest(manifestId) : undefined,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
