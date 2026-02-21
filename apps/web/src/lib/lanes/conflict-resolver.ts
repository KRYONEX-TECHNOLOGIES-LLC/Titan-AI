/**
 * Titan Protocol v2 — Conflict Resolver
 *
 * When two lanes modify the same file with overlapping regions, the
 * Supervisor must resolve the conflict. This module provides:
 *   - Overlap detection between file regions
 *   - Reconciliation lane creation (a new lane that takes both
 *     candidate versions as input)
 *   - Supervisor-driven conflict resolution (pick a winner or reconcile)
 */

import type { Lane, SubtaskSpec, FileRegion, DAGNode } from './lane-model';
import { laneStore } from './lane-store';
import { createDAGNode } from './task-manifest';

// ─── File Region Overlap Detection ──────────────────────────────────────────

export interface FileOverlap {
  filePath: string;
  laneA: { laneId: string; regions: FileRegion[] };
  laneB: { laneId: string; regions: FileRegion[] };
}

/**
 * Find all file overlaps between two lanes.
 */
export function findOverlaps(laneA: Lane, laneB: Lane): FileOverlap[] {
  const overlaps: FileOverlap[] = [];
  const filesA = groupByFile(laneA.files_touched);
  const filesB = groupByFile(laneB.files_touched);

  for (const [filePath, regionsA] of filesA) {
    const regionsB = filesB.get(filePath);
    if (!regionsB) continue;

    const hasOverlap = regionsA.some(a =>
      regionsB.some(b => doRegionsOverlap(a, b))
    );

    if (hasOverlap) {
      overlaps.push({
        filePath,
        laneA: { laneId: laneA.lane_id, regions: regionsA },
        laneB: { laneId: laneB.lane_id, regions: regionsB },
      });
    }
  }

  return overlaps;
}

function groupByFile(regions: FileRegion[]): Map<string, FileRegion[]> {
  const map = new Map<string, FileRegion[]>();
  for (const region of regions) {
    const existing = map.get(region.filePath) || [];
    existing.push(region);
    map.set(region.filePath, existing);
  }
  return map;
}

function doRegionsOverlap(a: FileRegion, b: FileRegion): boolean {
  if (a.filePath !== b.filePath) return false;

  // If either lacks line-level granularity, assume full-file overlap
  if (!a.startLine || !a.endLine || !b.startLine || !b.endLine) {
    return true;
  }

  return a.startLine <= b.endLine && b.startLine <= a.endLine;
}

// ─── Reconciliation Lane Creation ───────────────────────────────────────────

export interface ReconciliationSpec {
  dagNode: DAGNode;
  subtaskSpec: SubtaskSpec;
  sourceLaneIds: string[];
}

/**
 * Create a reconciliation subtask spec for the Supervisor to dispatch.
 * The reconciliation lane receives both conflicting lane outputs as context
 * and must produce a unified version.
 */
export function createReconciliationSpec(
  conflictingLanes: Lane[],
  overlaps: FileOverlap[],
): ReconciliationSpec {
  const filesList = overlaps.map(o => o.filePath);
  const laneIds = conflictingLanes.map(l => l.lane_id);

  const candidateOutputs = conflictingLanes.map(lane => {
    const artifact = lane.artifacts.workerOutput;
    return {
      laneId: lane.lane_id,
      title: lane.spec.title,
      codeChanges: artifact?.codeChanges || '(no output)',
      filesModified: artifact?.filesModified?.map(f => f.filePath) || [],
    };
  });

  const spec: SubtaskSpec = {
    title: `Reconcile conflict in: ${filesList.join(', ')}`,
    description: [
      `Two parallel lanes produced conflicting changes to the same files.`,
      `Your job is to merge both sets of changes into a single, correct version.`,
      ``,
      `Conflicting files: ${filesList.join(', ')}`,
      ``,
      `=== CANDIDATE A (Lane ${candidateOutputs[0]?.laneId}) ===`,
      `Title: ${candidateOutputs[0]?.title}`,
      `Changes: ${candidateOutputs[0]?.codeChanges?.slice(0, 3000)}`,
      ``,
      `=== CANDIDATE B (Lane ${candidateOutputs[1]?.laneId}) ===`,
      `Title: ${candidateOutputs[1]?.title}`,
      `Changes: ${candidateOutputs[1]?.codeChanges?.slice(0, 3000)}`,
      ``,
      `Produce a unified version that incorporates the intent of both changes.`,
      `If the changes are fundamentally incompatible, explain why and keep`,
      `the version that best satisfies the overall goal.`,
    ].join('\n'),
    relevantFiles: filesList,
    successCriteria: [
      'All conflicting files are resolved into a single coherent version',
      'Both lanes\' intended functionality is preserved where possible',
      'No regressions introduced',
      'Code compiles and passes basic lint checks',
    ],
    verificationCriteria: [
      'Verify the merged code is correct and complete',
      'Verify no functionality from either lane was silently dropped',
      'Verify the code handles all edge cases from both original implementations',
    ],
    constraints: [
      'Do not introduce new features beyond what the two lanes implemented',
      'Preserve the architectural patterns of the existing codebase',
    ],
  };

  const dagNode = createDAGNode(spec, []);

  return {
    dagNode,
    subtaskSpec: spec,
    sourceLaneIds: laneIds,
  };
}

// ─── Conflict Resolution Strategies ─────────────────────────────────────────

export type ResolutionStrategy = 'reconcile' | 'pick_a' | 'pick_b' | 'requeue_both';

export interface ConflictResolution {
  strategy: ResolutionStrategy;
  reconciliationSpec?: ReconciliationSpec;
  winnerLaneId?: string;
  loserLaneId?: string;
}

/**
 * Determine how to resolve a conflict between two lanes.
 * The Supervisor decides the strategy; this function implements it.
 */
export function resolveConflict(
  laneA: Lane,
  laneB: Lane,
  strategy: ResolutionStrategy,
): ConflictResolution {
  const overlaps = findOverlaps(laneA, laneB);

  switch (strategy) {
    case 'reconcile': {
      const reconciliation = createReconciliationSpec([laneA, laneB], overlaps);
      return { strategy, reconciliationSpec: reconciliation };
    }

    case 'pick_a': {
      return { strategy, winnerLaneId: laneA.lane_id, loserLaneId: laneB.lane_id };
    }

    case 'pick_b': {
      return { strategy, winnerLaneId: laneB.lane_id, loserLaneId: laneA.lane_id };
    }

    case 'requeue_both': {
      return { strategy };
    }

    default:
      return { strategy: 'reconcile', reconciliationSpec: createReconciliationSpec([laneA, laneB], overlaps) };
  }
}

/**
 * Apply a conflict resolution. Updates lane statuses and optionally
 * creates a new reconciliation lane.
 */
export function applyResolution(
  resolution: ConflictResolution,
  laneA: Lane,
  laneB: Lane,
  manifestId: string,
): { newLaneSpec?: ReconciliationSpec } {
  switch (resolution.strategy) {
    case 'pick_a': {
      // laneA wins, laneB is archived
      laneStore.transitionLane(laneB.lane_id, 'ARCHIVED', 'supervisor',
        `Conflict resolution: Lane ${laneA.lane_id} selected as winner`);
      // laneA stays VERIFIED for merge
      if (laneA.status === 'MERGE_CONFLICT') {
        laneStore.transitionLane(laneA.lane_id, 'PENDING_RECONCILIATION', 'supervisor', 'Conflict resolved by picking this lane');
      }
      return {};
    }

    case 'pick_b': {
      laneStore.transitionLane(laneA.lane_id, 'ARCHIVED', 'supervisor',
        `Conflict resolution: Lane ${laneB.lane_id} selected as winner`);
      if (laneB.status === 'MERGE_CONFLICT') {
        laneStore.transitionLane(laneB.lane_id, 'PENDING_RECONCILIATION', 'supervisor', 'Conflict resolved by picking this lane');
      }
      return {};
    }

    case 'reconcile': {
      // Both lanes are kept but blocked; a new reconciliation lane is created
      laneStore.transitionLane(laneA.lane_id, 'PENDING_RECONCILIATION', 'supervisor',
        'Awaiting reconciliation lane');
      laneStore.transitionLane(laneB.lane_id, 'PENDING_RECONCILIATION', 'supervisor',
        'Awaiting reconciliation lane');
      return { newLaneSpec: resolution.reconciliationSpec };
    }

    case 'requeue_both': {
      laneStore.transitionLane(laneA.lane_id, 'PENDING_RECONCILIATION', 'supervisor', 'Requeued for rework');
      laneStore.transitionLane(laneB.lane_id, 'PENDING_RECONCILIATION', 'supervisor', 'Requeued for rework');
      return {};
    }

    default:
      return {};
  }
}
