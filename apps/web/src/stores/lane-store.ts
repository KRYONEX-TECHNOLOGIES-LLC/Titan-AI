'use client';

/**
 * Titan Protocol v2 — Frontend Lane Store (Zustand)
 *
 * Manages lane state on the client side. Subscribes to SSE events
 * from /api/lanes/stream and updates the UI in real-time.
 */

import { create } from 'zustand';
import type {
  LaneSummary,
  TaskManifestUI,
  DAGNodeUI,
  LaneEventUI,
  LaneStatusUI,
} from '@/types/ide';

// ─── Status color mapping for UI ────────────────────────────────────────────

export const LANE_STATUS_COLORS: Record<LaneStatusUI, string> = {
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

export const LANE_STATUS_LABELS: Record<LaneStatusUI, string> = {
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

// ─── Store Interface ────────────────────────────────────────────────────────

interface LaneStoreState {
  lanes: Map<string, LaneSummary>;
  activeManifest: TaskManifestUI | null;
  activeManifestId: string | null;
  isParallelMode: boolean;
  isOrchestrating: boolean;
  eventLog: LaneEventUI[];
  eventSource: EventSource | null;

  setParallelMode: (v: boolean) => void;
  setOrchestrating: (v: boolean) => void;
  setActiveManifest: (manifest: TaskManifestUI | null) => void;

  updateLane: (lane: LaneSummary) => void;
  updateLaneStatus: (laneId: string, status: LaneStatusUI) => void;
  removeLane: (laneId: string) => void;
  clearLanes: () => void;

  addEvent: (event: LaneEventUI) => void;
  clearEvents: () => void;

  subscribeToManifest: (manifestId: string) => void;
  unsubscribeFromManifest: () => void;

  getLanesByStatus: (status: LaneStatusUI) => LaneSummary[];
  getActiveLanes: () => LaneSummary[];
  getCompletedLanes: () => LaneSummary[];

  getStats: () => {
    total: number;
    working: number;
    verifying: number;
    verified: number;
    merged: number;
    failed: number;
    rejected: number;
    percentComplete: number;
  };
}

export const useLaneStore = create<LaneStoreState>((set, get) => ({
  lanes: new Map(),
  activeManifest: null,
  activeManifestId: null,
  isParallelMode: false,
  isOrchestrating: false,
  eventLog: [],
  eventSource: null,

  setParallelMode: (v) => set({ isParallelMode: v }),
  setOrchestrating: (v) => set({ isOrchestrating: v }),
  setActiveManifest: (manifest) => set({
    activeManifest: manifest,
    activeManifestId: manifest?.id || null,
  }),

  updateLane: (lane) => set((state) => {
    const newLanes = new Map(state.lanes);
    newLanes.set(lane.lane_id, lane);
    return { lanes: newLanes };
  }),

  updateLaneStatus: (laneId, status) => set((state) => {
    const newLanes = new Map(state.lanes);
    const existing = newLanes.get(laneId);
    if (existing) {
      newLanes.set(laneId, { ...existing, status, updated_at: Date.now() });
    }
    return { lanes: newLanes };
  }),

  removeLane: (laneId) => set((state) => {
    const newLanes = new Map(state.lanes);
    newLanes.delete(laneId);
    return { lanes: newLanes };
  }),

  clearLanes: () => set({ lanes: new Map(), activeManifest: null, activeManifestId: null }),

  addEvent: (event) => set((state) => ({
    eventLog: [...state.eventLog.slice(-200), event],
  })),

  clearEvents: () => set({ eventLog: [] }),

  subscribeToManifest: (manifestId) => {
    const existing = get().eventSource;
    if (existing) {
      existing.close();
    }

    const es = new EventSource(`/api/lanes/stream?manifest_id=${encodeURIComponent(manifestId)}`);

    es.addEventListener('initial_state', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.manifest) {
          set({
            activeManifest: {
              id: data.manifest.id,
              goal: data.manifest.goal,
              nodes: data.manifest.nodes.map((n: DAGNodeUI) => ({
                id: n.id,
                title: n.title || '',
                dependencies: n.dependencies,
                lane_id: n.lane_id,
                status: n.status,
              })),
              status: data.manifest.status,
              created_at: data.manifest.created_at,
            },
            activeManifestId: data.manifest.id,
          });
        }
        if (data.lanes) {
          const newLanes = new Map(get().lanes);
          for (const lane of data.lanes) {
            newLanes.set(lane.lane_id, lane);
          }
          set({ lanes: newLanes });
        }
      } catch {
        // malformed event
      }
    });

    es.addEventListener('lane_event', (e) => {
      try {
        const event: LaneEventUI = JSON.parse(e.data);
        get().addEvent(event);

        if (event.type === 'lane_created' && event.lane_id) {
          const data = event.data as Record<string, unknown>;
          get().updateLane({
            lane_id: event.lane_id,
            task_manifest_id: event.manifest_id,
            subtask_node_id: (data.subtaskNodeId as string) || '',
            status: 'QUEUED',
            title: (data.title as string) || 'New Lane',
            worker_model_id: (data.workerModelId as string) || '',
            verifier_model_id: (data.verifierModelId as string) || '',
            files_touched: [],
            failure_count: 0,
            created_at: event.timestamp,
            updated_at: event.timestamp,
            elapsedMs: 0,
            totalCost: 0,
          });
        }

        if (event.type === 'lane_status_changed' && event.lane_id) {
          const data = event.data as Record<string, unknown>;
          const toStatus = data.to as LaneStatusUI;
          if (toStatus) {
            get().updateLaneStatus(event.lane_id, toStatus);
          }
        }

        if (event.type === 'manifest_complete' || event.type === 'manifest_updated') {
          const data = event.data as Record<string, unknown>;
          const manifest = get().activeManifest;
          if (manifest) {
            set({
              activeManifest: { ...manifest, status: (data.status as TaskManifestUI['status']) || manifest.status },
            });
          }
        }
      } catch {
        // malformed event
      }
    });

    es.onerror = () => {
      // SSE will auto-reconnect
    };

    set({ eventSource: es, activeManifestId: manifestId });
  },

  unsubscribeFromManifest: () => {
    const es = get().eventSource;
    if (es) {
      es.close();
      set({ eventSource: null });
    }
  },

  getLanesByStatus: (status) => {
    const result: LaneSummary[] = [];
    for (const lane of get().lanes.values()) {
      if (lane.status === status) result.push(lane);
    }
    return result;
  },

  getActiveLanes: () => {
    const terminal = new Set(['MERGED', 'FAILED', 'ARCHIVED']);
    const result: LaneSummary[] = [];
    for (const lane of get().lanes.values()) {
      if (!terminal.has(lane.status)) result.push(lane);
    }
    return result;
  },

  getCompletedLanes: () => {
    const result: LaneSummary[] = [];
    for (const lane of get().lanes.values()) {
      if (lane.status === 'MERGED') result.push(lane);
    }
    return result;
  },

  getStats: () => {
    const lanes = Array.from(get().lanes.values());
    const total = lanes.length;
    let working = 0, verifying = 0, verified = 0, merged = 0, failed = 0, rejected = 0;

    for (const lane of lanes) {
      switch (lane.status) {
        case 'WORKING': case 'ASSIGNED': working++; break;
        case 'VERIFYING': case 'PENDING_VERIFY': verifying++; break;
        case 'VERIFIED': verified++; break;
        case 'MERGED': merged++; break;
        case 'FAILED': failed++; break;
        case 'REJECTED': case 'PENDING_REWORK': rejected++; break;
      }
    }

    return {
      total,
      working,
      verifying,
      verified,
      merged,
      failed,
      rejected,
      percentComplete: total > 0 ? Math.round((merged / total) * 100) : 0,
    };
  },
}));
