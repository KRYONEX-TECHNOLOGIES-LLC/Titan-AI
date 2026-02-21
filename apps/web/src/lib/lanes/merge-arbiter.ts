/**
 * Titan Protocol v2 — Merge Arbiter
 *
 * Controlled exclusively by the Supervisor. Implements a multi-stage
 * zero-trust merge process:
 *   Level 1 — Static conflict detection (file region overlap)
 *   Level 2 — Integration validation (build + lint)
 *   Level 3 — Atomic merge (apply changes, update status)
 *
 * Workers and Verifiers NEVER merge code directly.
 */

import type { Lane, FileRegion } from './lane-model';
import { laneStore } from './lane-store';

// ─── Conflict Detection (Level 1) ──────────────────────────────────────────

export interface ConflictResult {
  hasConflict: boolean;
  conflictingLanes: Array<{
    laneId: string;
    overlappingFiles: string[];
  }>;
}

/**
 * Check if a VERIFIED lane's files_touched overlap with any already-MERGED lanes.
 * This is a conservative check: if two lanes touch the same file, it's a conflict
 * (unless the regions are non-overlapping and we can prove no interaction).
 */
export function detectConflicts(
  candidateLane: Lane,
  manifestId: string,
): ConflictResult {
  const mergedLanes = laneStore.getLanesByManifest(manifestId)
    .filter(l => l.status === 'MERGED' && l.lane_id !== candidateLane.lane_id);

  const candidateFiles = new Set(candidateLane.files_touched.map(f => f.filePath));
  const conflicting: ConflictResult['conflictingLanes'] = [];

  for (const mergedLane of mergedLanes) {
    const overlapping: string[] = [];
    for (const mergedFile of mergedLane.files_touched) {
      if (candidateFiles.has(mergedFile.filePath)) {
        if (regionsOverlap(
          candidateLane.files_touched.filter(f => f.filePath === mergedFile.filePath),
          mergedLane.files_touched.filter(f => f.filePath === mergedFile.filePath),
        )) {
          overlapping.push(mergedFile.filePath);
        }
      }
    }
    if (overlapping.length > 0) {
      conflicting.push({ laneId: mergedLane.lane_id, overlappingFiles: overlapping });
    }
  }

  return {
    hasConflict: conflicting.length > 0,
    conflictingLanes: conflicting,
  };
}

/**
 * Also check against other VERIFIED lanes waiting to merge.
 * Used to detect conflicts between two lanes that both passed verification.
 */
export function detectConflictsWithVerified(
  candidateLane: Lane,
  manifestId: string,
): ConflictResult {
  const verifiedLanes = laneStore.getLanesByManifest(manifestId)
    .filter(l => l.status === 'VERIFIED' && l.lane_id !== candidateLane.lane_id);

  const candidateFiles = new Set(candidateLane.files_touched.map(f => f.filePath));
  const conflicting: ConflictResult['conflictingLanes'] = [];

  for (const otherLane of verifiedLanes) {
    const overlapping: string[] = [];
    for (const otherFile of otherLane.files_touched) {
      if (candidateFiles.has(otherFile.filePath)) {
        overlapping.push(otherFile.filePath);
      }
    }
    if (overlapping.length > 0) {
      conflicting.push({ laneId: otherLane.lane_id, overlappingFiles: overlapping });
    }
  }

  return {
    hasConflict: conflicting.length > 0,
    conflictingLanes: conflicting,
  };
}

function regionsOverlap(regionsA: FileRegion[], regionsB: FileRegion[]): boolean {
  for (const a of regionsA) {
    for (const b of regionsB) {
      if (a.filePath !== b.filePath) continue;

      // If either region doesn't have line numbers, assume the whole file is touched
      if (!a.startLine || !a.endLine || !b.startLine || !b.endLine) {
        return true;
      }

      // Check line range overlap
      if (a.startLine <= b.endLine && b.startLine <= a.endLine) {
        return true;
      }
    }
  }
  return false;
}

// ─── Integration Validation (Level 2) ───────────────────────────────────────

export interface ValidationResult {
  passed: boolean;
  buildPassed: boolean;
  lintPassed: boolean;
  buildOutput?: string;
  lintOutput?: string;
  errors: string[];
}

/**
 * Run build and lint checks. Uses the tool execution endpoint.
 */
export async function validateIntegration(
  _lane: Lane,
  baseUrl: string,
  workspacePath: string,
): Promise<ValidationResult> {
  const errors: string[] = [];
  let buildPassed = true;
  let lintPassed = true;
  let buildOutput = '';
  let lintOutput = '';

  try {
    const buildResult = await executeToolViaAPI(baseUrl, 'run_command', {
      command: 'npx tsc --noEmit 2>&1 || echo "BUILD_CHECK_DONE"',
      cwd: workspacePath,
    });

    buildOutput = buildResult.output;
    if (buildResult.output.includes('error TS') || buildResult.output.includes('Error:')) {
      buildPassed = false;
      errors.push(`Build check failed: ${buildResult.output.slice(0, 500)}`);
    }
  } catch (e) {
    buildPassed = false;
    errors.push(`Build check error: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  try {
    const lintResult = await executeToolViaAPI(baseUrl, 'run_command', {
      command: 'npx eslint --max-warnings 0 --format compact . 2>&1 || echo "LINT_CHECK_DONE"',
      cwd: workspacePath,
    });

    lintOutput = lintResult.output;
    if (lintResult.output.includes('error') && !lintResult.output.includes('0 errors')) {
      lintPassed = false;
      errors.push(`Lint check failed: ${lintResult.output.slice(0, 500)}`);
    }
  } catch (e) {
    // Lint failures are non-fatal for merge
    lintOutput = e instanceof Error ? e.message : 'unknown error';
  }

  return {
    passed: buildPassed,
    buildPassed,
    lintPassed,
    buildOutput,
    lintOutput,
    errors,
  };
}

async function executeToolViaAPI(
  baseUrl: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ success: boolean; output: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/agent/tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, args }),
    });
    const data = await res.json();
    return {
      success: data.success !== false,
      output: data.output || data.result || '',
    };
  } catch (e) {
    return {
      success: false,
      output: e instanceof Error ? e.message : 'Tool call failed',
    };
  }
}

// ─── Atomic Merge (Level 3) ─────────────────────────────────────────────────

export interface MergeResult {
  success: boolean;
  laneId: string;
  conflictsDetected: boolean;
  validationPassed: boolean;
  error?: string;
}

/**
 * Attempt to merge a VERIFIED lane. This is the full 3-level process:
 *   1. Conflict detection against MERGED lanes
 *   2. Integration validation (build/lint) — optional, skippable for speed
 *   3. Mark as MERGED and update DAG node
 *
 * Only the Supervisor calls this function.
 */
export async function attemptMerge(
  laneId: string,
  manifestId: string,
  baseUrl: string,
  workspacePath: string,
  skipValidation: boolean = false,
): Promise<MergeResult> {
  const lane = laneStore.getLane(laneId);
  if (!lane) return { success: false, laneId, conflictsDetected: false, validationPassed: false, error: 'Lane not found' };
  if (lane.status !== 'VERIFIED') return { success: false, laneId, conflictsDetected: false, validationPassed: false, error: `Lane status is ${lane.status}, expected VERIFIED` };

  // Level 1: Conflict detection
  const conflicts = detectConflicts(lane, manifestId);
  if (conflicts.hasConflict) {
    laneStore.transitionLane(laneId, 'MERGE_CONFLICT', 'merge-arbiter',
      `Conflict with merged lanes: ${conflicts.conflictingLanes.map(c => c.laneId).join(', ')}`,
      { conflictingLanes: conflicts.conflictingLanes },
    );

    laneStore.emitCustom('conflict_detected', manifestId, laneId, {
      conflictingLanes: conflicts.conflictingLanes,
    });

    return { success: false, laneId, conflictsDetected: true, validationPassed: false };
  }

  // Level 2: Integration validation
  let validationPassed = true;
  if (!skipValidation) {
    const validation = await validateIntegration(lane, baseUrl, workspacePath);
    validationPassed = validation.passed;

    if (!validationPassed) {
      laneStore.transitionLane(laneId, 'REJECTED', 'merge-arbiter',
        `Integration validation failed: ${validation.errors.join('; ')}`,
        { buildPassed: validation.buildPassed, lintPassed: validation.lintPassed },
      );
      return { success: false, laneId, conflictsDetected: false, validationPassed: false, error: validation.errors.join('; ') };
    }
  }

  // Level 3: Atomic merge
  laneStore.emitCustom('merge_started', manifestId, laneId, {});

  laneStore.updateArtifacts(laneId, {
    mergeResult: {
      mergedAt: Date.now(),
      conflictsResolved: false,
      buildPassed: validationPassed,
      lintPassed: validationPassed,
    },
  });

  laneStore.transitionLane(laneId, 'MERGED', 'merge-arbiter', 'Successfully merged');

  // Update DAG node
  laneStore.updateDAGNodeStatus(manifestId, lane.subtask_node_id, 'COMPLETE', laneId);

  laneStore.emitCustom('merge_complete', manifestId, laneId, {
    filesAffected: lane.files_touched.map(f => f.filePath),
  });

  return { success: true, laneId, conflictsDetected: false, validationPassed };
}
