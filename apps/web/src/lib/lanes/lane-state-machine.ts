/**
 * Titan Protocol v2 — Lane State Machine
 *
 * Enforces valid status transitions. Every transition is validated against
 * the allowed transition map. Invalid transitions throw. Every valid
 * transition is recorded in the lane's audit trail.
 *
 * State flow:
 *   QUEUED → PROVISIONING → ASSIGNED → WORKING → PENDING_VERIFY →
 *   VERIFYING → VERIFIED → MERGED
 *
 * Recovery paths:
 *   VERIFYING → REJECTED → PENDING_REWORK → ASSIGNED (re-enter cycle)
 *   VERIFIED  → MERGE_CONFLICT → PENDING_RECONCILIATION → QUEUED (new lane)
 *
 * Terminal:
 *   MERGED, FAILED, ARCHIVED
 */

import type { LaneStatus, AuditEntry } from './lane-model';

type Actor = AuditEntry['actor'];

const TRANSITION_MAP: Record<LaneStatus, LaneStatus[]> = {
  QUEUED:                   ['PROVISIONING', 'FAILED', 'ARCHIVED'],
  PROVISIONING:             ['ASSIGNED', 'FAILED', 'ARCHIVED'],
  ASSIGNED:                 ['WORKING', 'FAILED', 'ARCHIVED'],
  WORKING:                  ['PENDING_VERIFY', 'FAILED', 'ARCHIVED'],
  PENDING_VERIFY:           ['VERIFYING', 'FAILED', 'ARCHIVED'],
  VERIFYING:                ['VERIFIED', 'REJECTED', 'FAILED', 'ARCHIVED'],
  VERIFIED:                 ['MERGED', 'MERGE_CONFLICT', 'REJECTED', 'FAILED', 'ARCHIVED'],
  REJECTED:                 ['PENDING_REWORK', 'FAILED', 'ARCHIVED'],
  PENDING_REWORK:           ['ASSIGNED', 'FAILED', 'ARCHIVED'],
  MERGE_CONFLICT:           ['PENDING_RECONCILIATION', 'FAILED', 'ARCHIVED'],
  PENDING_RECONCILIATION:   ['QUEUED', 'FAILED', 'ARCHIVED'],
  MERGED:                   ['ARCHIVED'],
  FAILED:                   ['ARCHIVED'],
  ARCHIVED:                 [],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: LaneStatus,
    public readonly to: LaneStatus,
    public readonly laneId: string,
  ) {
    super(
      `Invalid lane transition: ${from} → ${to} for lane ${laneId}. ` +
      `Allowed from ${from}: [${TRANSITION_MAP[from].join(', ')}]`
    );
    this.name = 'InvalidTransitionError';
  }
}

export function validateTransition(
  from: LaneStatus,
  to: LaneStatus,
  laneId: string,
): void {
  const allowed = TRANSITION_MAP[from];
  if (!allowed || !allowed.includes(to)) {
    throw new InvalidTransitionError(from, to, laneId);
  }
}

export function isTransitionAllowed(from: LaneStatus, to: LaneStatus): boolean {
  const allowed = TRANSITION_MAP[from];
  return !!allowed && allowed.includes(to);
}

export function getAllowedTransitions(from: LaneStatus): LaneStatus[] {
  return TRANSITION_MAP[from] || [];
}

export function createAuditEntry(
  fromStatus: LaneStatus | null,
  toStatus: LaneStatus,
  actor: Actor,
  reason: string,
  metadata?: Record<string, unknown>,
): AuditEntry {
  return {
    timestamp: Date.now(),
    fromStatus,
    toStatus,
    actor,
    reason,
    metadata,
  };
}

/**
 * Perform a validated transition. Returns the audit entry to append.
 * Throws InvalidTransitionError if the transition is not allowed.
 */
export function transition(
  currentStatus: LaneStatus,
  targetStatus: LaneStatus,
  laneId: string,
  actor: Actor,
  reason: string,
  metadata?: Record<string, unknown>,
): AuditEntry {
  validateTransition(currentStatus, targetStatus, laneId);
  return createAuditEntry(currentStatus, targetStatus, actor, reason, metadata);
}

/**
 * Human-readable label for a status, suitable for UI display.
 */
export const STATUS_LABELS: Record<LaneStatus, string> = {
  QUEUED: 'Queued',
  PROVISIONING: 'Provisioning',
  ASSIGNED: 'Assigned',
  WORKING: 'Working',
  PENDING_VERIFY: 'Pending Verification',
  VERIFYING: 'Verifying',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
  PENDING_REWORK: 'Pending Rework',
  MERGE_CONFLICT: 'Merge Conflict',
  PENDING_RECONCILIATION: 'Reconciling',
  MERGED: 'Merged',
  FAILED: 'Failed',
  ARCHIVED: 'Archived',
};

/**
 * Color codes for UI status badges (inline-style friendly, no Tailwind).
 */
export const STATUS_COLORS: Record<LaneStatus, string> = {
  QUEUED: '#6b7280',
  PROVISIONING: '#8b5cf6',
  ASSIGNED: '#3b82f6',
  WORKING: '#2563eb',
  PENDING_VERIFY: '#f59e0b',
  VERIFYING: '#d97706',
  VERIFIED: '#10b981',
  REJECTED: '#ef4444',
  PENDING_REWORK: '#f97316',
  MERGE_CONFLICT: '#dc2626',
  PENDING_RECONCILIATION: '#e11d48',
  MERGED: '#059669',
  FAILED: '#991b1b',
  ARCHIVED: '#4b5563',
};
