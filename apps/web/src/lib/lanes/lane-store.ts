/**
 * Titan Protocol v2 — Lane Store (Backend / Server-side)
 *
 * In-memory store for lane and manifest state. Provides CRUD operations,
 * status transitions via the state machine, event pub/sub, and query
 * helpers. This is a singleton used by the orchestration API routes.
 *
 * Thread safety: Node.js is single-threaded. Async operations yield
 * at await points but don't cause data races on in-memory Maps.
 */

import type {
  Lane,
  LaneStatus,
  LaneArtifacts,
  LaneMetrics,
  LaneEvent,
  LaneEventType,
  TaskManifest,
  DAGNode,
  SubtaskSpec,
  FileRegion,
  AuditEntry,
} from './lane-model';

import {
  generateLaneId,
  generateManifestId,
  createEmptyMetrics,
  isTerminal,
} from './lane-model';

import { transition } from './lane-state-machine';

// ─── Event Listener ─────────────────────────────────────────────────────────

type EventListener = (event: LaneEvent) => void;

// ─── The Store ──────────────────────────────────────────────────────────────

class LaneStoreImpl {
  private lanes: Map<string, Lane> = new Map();
  private manifests: Map<string, TaskManifest> = new Map();
  private listeners: Set<EventListener> = new Set();
  private manifestListeners: Map<string, Set<EventListener>> = new Map();

  // ── Manifests ───────────────────────────────────────────────────────────

  createManifest(goal: string, sessionId: string, nodes: DAGNode[]): TaskManifest {
    const id = generateManifestId();
    const edges = [];
    for (const node of nodes) {
      for (const dep of node.dependencies) {
        edges.push({ from: dep, to: node.id });
      }
    }

    const manifest: TaskManifest = {
      id,
      goal,
      sessionId,
      nodes,
      edges,
      status: 'ACTIVE',
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    this.manifests.set(id, manifest);
    this.emit({
      type: 'manifest_created',
      timestamp: Date.now(),
      manifest_id: id,
      data: { goal, nodeCount: nodes.length },
    });

    return manifest;
  }

  getManifest(id: string): TaskManifest | undefined {
    return this.manifests.get(id);
  }

  updateManifestStatus(id: string, status: TaskManifest['status']): void {
    const manifest = this.manifests.get(id);
    if (!manifest) return;
    manifest.status = status;
    manifest.updated_at = Date.now();
    if (status === 'COMPLETE' || status === 'FAILED' || status === 'CANCELLED') {
      manifest.completed_at = Date.now();
    }
    this.emit({
      type: status === 'COMPLETE' ? 'manifest_complete' : 'manifest_updated',
      timestamp: Date.now(),
      manifest_id: id,
      data: { status },
    });
  }

  updateDAGNodeStatus(manifestId: string, nodeId: string, status: DAGNode['status'], laneId?: string): void {
    const manifest = this.manifests.get(manifestId);
    if (!manifest) return;
    const node = manifest.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.status = status;
    if (laneId) node.lane_id = laneId;
    manifest.updated_at = Date.now();
  }

  getReadyNodes(manifestId: string): DAGNode[] {
    const manifest = this.manifests.get(manifestId);
    if (!manifest || manifest.status !== 'ACTIVE') return [];

    const completedNodeIds = new Set(
      manifest.nodes.filter(n => n.status === 'COMPLETE').map(n => n.id)
    );

    return manifest.nodes.filter(node => {
      if (node.status !== 'PENDING') return false;
      return node.dependencies.every(depId => completedNodeIds.has(depId));
    });
  }

  isManifestComplete(manifestId: string): boolean {
    const manifest = this.manifests.get(manifestId);
    if (!manifest) return false;
    return manifest.nodes.every(n => n.status === 'COMPLETE' || n.status === 'FAILED');
  }

  isManifestSuccessful(manifestId: string): boolean {
    const manifest = this.manifests.get(manifestId);
    if (!manifest) return false;
    return manifest.nodes.every(n => n.status === 'COMPLETE');
  }

  // ── Lanes ───────────────────────────────────────────────────────────────

  createLane(
    manifestId: string,
    subtaskNodeId: string,
    spec: SubtaskSpec,
    workerModelId: string,
    verifierModelId: string,
    branch: string,
  ): Lane {
    const lane_id = generateLaneId();
    const now = Date.now();

    const lane: Lane = {
      lane_id,
      task_manifest_id: manifestId,
      subtask_node_id: subtaskNodeId,
      status: 'QUEUED',
      spec,
      worker_model_id: workerModelId,
      verifier_model_id: verifierModelId,
      workspace_branch: branch,
      files_touched: [],
      artifacts: {},
      audit_trail: [{
        timestamp: now,
        fromStatus: null,
        toStatus: 'QUEUED',
        actor: 'supervisor',
        reason: 'Lane created by Supervisor',
      }],
      metrics: createEmptyMetrics(),
      failure_count: 0,
      max_failures: 3,
      created_at: now,
      updated_at: now,
    };

    this.lanes.set(lane_id, lane);
    this.emit({
      type: 'lane_created',
      timestamp: now,
      manifest_id: manifestId,
      lane_id,
      data: {
        subtaskNodeId,
        title: spec.title,
        workerModelId,
        verifierModelId,
        branch,
      },
    });

    return lane;
  }

  getLane(laneId: string): Lane | undefined {
    return this.lanes.get(laneId);
  }

  getLanesByManifest(manifestId: string): Lane[] {
    const result: Lane[] = [];
    for (const lane of this.lanes.values()) {
      if (lane.task_manifest_id === manifestId) {
        result.push(lane);
      }
    }
    return result;
  }

  getLanesByStatus(status: LaneStatus): Lane[] {
    const result: Lane[] = [];
    for (const lane of this.lanes.values()) {
      if (lane.status === status) {
        result.push(lane);
      }
    }
    return result;
  }

  getActiveLanesByManifest(manifestId: string): Lane[] {
    return this.getLanesByManifest(manifestId).filter(l => !isTerminal(l.status));
  }

  getWorkingLaneCount(): number {
    let count = 0;
    for (const lane of this.lanes.values()) {
      if (lane.status === 'WORKING' || lane.status === 'ASSIGNED') count++;
    }
    return count;
  }

  getVerifyingLaneCount(): number {
    let count = 0;
    for (const lane of this.lanes.values()) {
      if (lane.status === 'VERIFYING') count++;
    }
    return count;
  }

  // ── Status Transitions ────────────────────────────────────────────────

  transitionLane(
    laneId: string,
    targetStatus: LaneStatus,
    actor: AuditEntry['actor'],
    reason: string,
    metadata?: Record<string, unknown>,
  ): Lane {
    const lane = this.lanes.get(laneId);
    if (!lane) throw new Error(`Lane not found: ${laneId}`);

    const auditEntry = transition(
      lane.status,
      targetStatus,
      laneId,
      actor,
      reason,
      metadata,
    );

    lane.status = targetStatus;
    lane.audit_trail.push(auditEntry);
    lane.updated_at = Date.now();

    if (isTerminal(targetStatus)) {
      lane.completed_at = Date.now();
      lane.metrics.totalDurationMs = lane.completed_at - lane.created_at;
    }

    this.emit({
      type: 'lane_status_changed',
      timestamp: Date.now(),
      manifest_id: lane.task_manifest_id,
      lane_id: laneId,
      data: {
        from: auditEntry.fromStatus,
        to: targetStatus,
        actor,
        reason,
        ...metadata,
      },
    });

    return lane;
  }

  // ── Artifact & Metric Updates ─────────────────────────────────────────

  updateArtifacts(laneId: string, updates: Partial<LaneArtifacts>): void {
    const lane = this.lanes.get(laneId);
    if (!lane) return;
    Object.assign(lane.artifacts, updates);
    lane.updated_at = Date.now();
    this.emit({
      type: 'lane_artifact_updated',
      timestamp: Date.now(),
      manifest_id: lane.task_manifest_id,
      lane_id: laneId,
      data: { artifactKeys: Object.keys(updates) },
    });
  }

  updateMetrics(laneId: string, updates: Partial<LaneMetrics>): void {
    const lane = this.lanes.get(laneId);
    if (!lane) return;
    Object.assign(lane.metrics, updates);
    lane.updated_at = Date.now();
  }

  updateFilesTouched(laneId: string, files: FileRegion[]): void {
    const lane = this.lanes.get(laneId);
    if (!lane) return;
    lane.files_touched = files;
    lane.updated_at = Date.now();
  }

  incrementFailureCount(laneId: string): number {
    const lane = this.lanes.get(laneId);
    if (!lane) return 0;
    lane.failure_count++;
    lane.metrics.reworkCount++;
    lane.updated_at = Date.now();
    return lane.failure_count;
  }

  // ── Event System ──────────────────────────────────────────────────────

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  subscribeToManifest(manifestId: string, listener: EventListener): () => void {
    if (!this.manifestListeners.has(manifestId)) {
      this.manifestListeners.set(manifestId, new Set());
    }
    this.manifestListeners.get(manifestId)!.add(listener);
    return () => {
      const set = this.manifestListeners.get(manifestId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.manifestListeners.delete(manifestId);
      }
    };
  }

  private emit(event: LaneEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* don't let one listener crash others */ }
    }
    const manifestSet = this.manifestListeners.get(event.manifest_id);
    if (manifestSet) {
      for (const listener of manifestSet) {
        try { listener(event); } catch { /* swallow */ }
      }
    }
  }

  emitCustom(type: LaneEventType, manifestId: string, laneId: string | undefined, data: Record<string, unknown>): void {
    this.emit({
      type,
      timestamp: Date.now(),
      manifest_id: manifestId,
      lane_id: laneId,
      data,
    });
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  clearManifest(manifestId: string): void {
    for (const [id, lane] of this.lanes) {
      if (lane.task_manifest_id === manifestId) {
        this.lanes.delete(id);
      }
    }
    this.manifests.delete(manifestId);
    this.manifestListeners.delete(manifestId);
  }

  clearAll(): void {
    this.lanes.clear();
    this.manifests.clear();
    this.listeners.clear();
    this.manifestListeners.clear();
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  getStats(manifestId?: string): {
    totalLanes: number;
    byStatus: Record<string, number>;
    totalCost: number;
    totalDurationMs: number;
  } {
    const lanes = manifestId
      ? this.getLanesByManifest(manifestId)
      : Array.from(this.lanes.values());

    const byStatus: Record<string, number> = {};
    let totalCost = 0;
    let totalDurationMs = 0;

    for (const lane of lanes) {
      byStatus[lane.status] = (byStatus[lane.status] || 0) + 1;
      totalCost += lane.metrics.totalCost;
      totalDurationMs += lane.metrics.totalDurationMs;
    }

    return {
      totalLanes: lanes.length,
      byStatus,
      totalCost,
      totalDurationMs,
    };
  }
}

// Singleton instance
export const laneStore = new LaneStoreImpl();
