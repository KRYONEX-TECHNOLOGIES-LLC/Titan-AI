'use client';

/**
 * Titan Protocol v2 — Lane Control Tower Panel
 *
 * Displays active lanes, their statuses, DAG progress, and stats.
 * Uses inline styles per ADR (T4: no Tailwind in chat UI components).
 */

import { useEffect, useMemo, useState } from 'react';
import { useLaneStore, LANE_STATUS_COLORS, LANE_STATUS_LABELS } from '@/stores/lane-store';
import type { LaneSummary, LaneStatusUI } from '@/types/ide';

// ─── Status Badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: LaneStatusUI }) {
  const color = LANE_STATUS_COLORS[status] || '#6b7280';
  const label = LANE_STATUS_LABELS[status] || status;

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 600,
      color: '#fff',
      backgroundColor: color,
      lineHeight: '16px',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// ─── Lane Card ──────────────────────────────────────────────────────────────

function LaneCard({ lane }: { lane: LaneSummary }) {
  const elapsed = lane.completed_at
    ? Math.round((lane.completed_at - lane.created_at) / 1000)
    : Math.round((Date.now() - lane.created_at) / 1000);

  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: '6px',
      backgroundColor: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      marginBottom: '6px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#e5e7eb', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lane.title}
        </span>
        <StatusBadge status={lane.status} />
      </div>

      <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#9ca3af' }}>
        <span>{elapsed}s</span>
        {lane.files_touched.length > 0 && (
          <span>{lane.files_touched.length} file{lane.files_touched.length !== 1 ? 's' : ''}</span>
        )}
        {lane.failure_count > 0 && (
          <span style={{ color: '#ef4444' }}>
            {lane.failure_count} fail{lane.failure_count !== 1 ? 's' : ''}
          </span>
        )}
        {lane.verifierVerdict && (
          <span style={{ color: lane.verifierVerdict === 'PASS' ? '#10b981' : '#ef4444' }}>
            {lane.verifierVerdict}
          </span>
        )}
      </div>

      {lane.files_touched.length > 0 && (
        <div style={{ marginTop: '4px', fontSize: '10px', color: '#6b7280' }}>
          {lane.files_touched.slice(0, 3).map((f, i) => (
            <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f}
            </div>
          ))}
          {lane.files_touched.length > 3 && (
            <div>+{lane.files_touched.length - 3} more</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Progress Bar ───────────────────────────────────────────────────────────

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div style={{
      width: '100%',
      height: '6px',
      borderRadius: '3px',
      backgroundColor: 'rgba(255,255,255,0.08)',
      overflow: 'hidden',
    }}>
      <div style={{
        width: `${Math.min(100, Math.max(0, percent))}%`,
        height: '100%',
        borderRadius: '3px',
        backgroundColor: color,
        transition: 'width 0.3s ease',
      }} />
    </div>
  );
}

// ─── Stats Card ─────────────────────────────────────────────────────────────

function StatsRow({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
      <span style={{ fontSize: '11px', color: '#9ca3af' }}>{label}</span>
      <span style={{ fontSize: '12px', fontWeight: 600, color: color || '#e5e7eb' }}>{value}</span>
    </div>
  );
}

// ─── DAG Mini Visualization ─────────────────────────────────────────────────

function DAGMini({ nodes }: { nodes: Array<{ id: string; status: string }> }) {
  if (nodes.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px',
      padding: '8px 0',
    }}>
      {nodes.map((node) => {
        let bgColor = '#374151';
        if (node.status === 'COMPLETE') bgColor = '#059669';
        else if (node.status === 'DISPATCHED') bgColor = '#2563eb';
        else if (node.status === 'FAILED') bgColor = '#991b1b';

        return (
          <div
            key={node.id}
            title={`${node.id}: ${node.status}`}
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '3px',
              backgroundColor: bgColor,
              transition: 'background-color 0.3s ease',
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export default function LanePanel() {
  const lanes = useLaneStore(s => s.lanes);
  const activeManifest = useLaneStore(s => s.activeManifest);
  const isOrchestrating = useLaneStore(s => s.isOrchestrating);
  const getStats = useLaneStore(s => s.getStats);

  const laneArray = useMemo(() => {
    const arr = Array.from(lanes.values());
    arr.sort((a, b) => b.updated_at - a.updated_at);
    return arr;
  }, [lanes]);

  const stats = useMemo(() => getStats(), [lanes, getStats]);

  // Auto-refresh elapsed times — use a local tick so only this component re-renders,
  // not the entire Zustand store and all its subscribers.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isOrchestrating && laneArray.length === 0) return;
    const interval = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(interval);
  }, [isOrchestrating, laneArray.length]);

  if (!isOrchestrating && laneArray.length === 0) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        color: '#6b7280',
        fontSize: '13px',
      }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#9ca3af', marginBottom: '8px' }}>
          Titan Protocol v2 -- Parallel Lanes
        </div>
        <div>
          No active lanes. Select <strong>Titan Protocol v2 (Parallel)</strong> from the model selector and send a goal to begin orchestration.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      padding: '12px',
      fontFamily: 'var(--font-mono, monospace)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#e5e7eb' }}>
          Lane Control Tower
        </div>
        {isOrchestrating && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            color: '#10b981',
          }}>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              animation: 'pulse 2s infinite',
            }} />
            Orchestrating
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{
        padding: '10px',
        borderRadius: '6px',
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        marginBottom: '12px',
      }}>
        <ProgressBar percent={stats.percentComplete} color="#059669" />
        <div style={{ marginTop: '8px' }}>
          <StatsRow label="Total Lanes" value={stats.total} />
          <StatsRow label="Working" value={stats.working} color="#2563eb" />
          <StatsRow label="Verifying" value={stats.verifying} color="#d97706" />
          <StatsRow label="Verified" value={stats.verified} color="#10b981" />
          <StatsRow label="Merged" value={stats.merged} color="#059669" />
          {stats.rejected > 0 && <StatsRow label="Rejected" value={stats.rejected} color="#ef4444" />}
          {stats.failed > 0 && <StatsRow label="Failed" value={stats.failed} color="#991b1b" />}
        </div>
      </div>

      {/* DAG Visualization */}
      {activeManifest && activeManifest.nodes.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '4px' }}>
            Task DAG ({activeManifest.nodes.length} nodes)
          </div>
          <DAGMini nodes={activeManifest.nodes} />
        </div>
      )}

      {/* Goal */}
      {activeManifest?.goal && (
        <div style={{
          padding: '8px 10px',
          borderRadius: '4px',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          border: '1px solid rgba(37, 99, 235, 0.2)',
          fontSize: '11px',
          color: '#93c5fd',
          marginBottom: '12px',
          lineHeight: '1.4',
        }}>
          <strong>Goal:</strong> {activeManifest.goal.slice(0, 200)}{activeManifest.goal.length > 200 ? '...' : ''}
        </div>
      )}

      {/* Lane List */}
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '6px' }}>
        Lanes ({laneArray.length})
      </div>
      {laneArray.map(lane => (
        <LaneCard key={lane.lane_id} lane={lane} />
      ))}
    </div>
  );
}
