'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { electronAPI, isElectron } from '@/lib/electron';
import { QueueList } from '@/components/midnight/QueueList';
import TrustSlider from '@/components/midnight/TrustSlider';
import {
  AnimatedCounter,
  HudButton,
  HudCard,
  HudGauge,
  HudHeader,
  HudTerminal,
  PulsingDot,
} from '@/components/hud/HudStyles';

type QueueProject = {
  id: string;
  name: string;
  status: string;
  priority: number;
  progress?: number;
};

type Snapshot = {
  id: string;
  createdAt?: string;
  timestamp?: string;
  label?: string;
  projectId?: string;
};

type MidnightProps = {
  midnightActive: boolean;
  trustLevel: 1 | 2 | 3;
  protocolMode: boolean;
  setTrustLevel: (level: 1 | 2 | 3) => void;
  setProtocolMode: (enabled: boolean) => void;
  startMidnight: () => Promise<void>;
  stopMidnight: () => Promise<void>;
  activeModel: string;
};

export default function MidnightPanel({
  midnightActive,
  trustLevel,
  protocolMode,
  setTrustLevel,
  setProtocolMode,
  startMidnight,
  stopMidnight,
  activeModel,
}: MidnightProps) {
  const [queue, setQueue] = useState<QueueProject[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [actorLines, setActorLines] = useState<Array<{ ts: string; text: string; level?: 'info' | 'warn' | 'error' | 'success' }>>([]);
  const [sentinelLines, setSentinelLines] = useState<Array<{ ts: string; text: string; level?: 'info' | 'warn' | 'error' | 'success' }>>([]);
  const [uptime, setUptime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [tasksTotal, setTasksTotal] = useState(1);
  const [confidence, setConfidence] = useState(100);
  const [lastStatus, setLastStatus] = useState<'healthy' | 'warning' | 'error'>('healthy');
  const [currentTask, setCurrentTask] = useState('Awaiting assignment');
  const [currentProject, setCurrentProject] = useState('No active project');
  const streamRef = useRef<EventSource | null>(null);

  const statusLabel = useMemo(() => {
    if (isPaused) return 'PAUSED';
    if (midnightActive) return 'ACTIVE';
    if (queue.length > 0) return 'BUILDING';
    return 'DORMANT';
  }, [isPaused, midnightActive, queue.length]);

  useEffect(() => {
    const poll = async () => {
      try {
        const statusRes = await fetch('/api/midnight', { cache: 'no-store' });
        if (statusRes.ok) {
          const status = await statusRes.json();
          setUptime(Number(status.uptime || 0));
          setTasksCompleted(Number(status.tasksCompleted || 0));
          const queued = Number(status.queueLength || 0);
          setTasksTotal(Math.max(1, Number(status.tasksCompleted || 0) + queued));
          setConfidence(Number(status.confidenceScore || 100));
          setLastStatus((status.confidenceStatus as 'healthy' | 'warning' | 'error') || 'healthy');
          if (status.currentProject?.name) setCurrentProject(String(status.currentProject.name));
          if (status.currentProject?.currentTask) setCurrentTask(String(status.currentProject.currentTask));
        }
        const queueRes = await fetch('/api/midnight/queue', { cache: 'no-store' });
        if (queueRes.ok) {
          const q = await queueRes.json();
          setQueue(Array.isArray(q.projects) ? q.projects : []);
        }
        const snapRes = await fetch('/api/midnight/snapshots', { cache: 'no-store' });
        if (snapRes.ok) {
          const snap = await snapRes.json();
          setSnapshots(Array.isArray(snap.snapshots) ? snap.snapshots : []);
        }
      } catch {
        // best effort
      }
    };
    void poll();
    const interval = setInterval(poll, 6000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    const source = new EventSource('/api/midnight/stream');
    streamRef.current = source;

    const stamp = () => new Date().toLocaleTimeString();

    source.addEventListener('actor_log', (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as { message?: string };
      setActorLines((prev) => [...prev.slice(-99), { ts: stamp(), text: String(payload.message || '') }]);
    });
    source.addEventListener('sentinel_log', (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as { message?: string };
      setSentinelLines((prev) => [...prev.slice(-99), { ts: stamp(), text: String(payload.message || '') }]);
    });
    source.addEventListener('confidence_update', (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as { score?: number; status?: 'healthy' | 'warning' | 'error' };
      setConfidence(Number(payload.score || 100));
      setLastStatus(payload.status || 'healthy');
    });
    source.addEventListener('error', () => {
      setActorLines((prev) => [...prev.slice(-99), { ts: stamp(), text: 'Stream error — retrying', level: 'warn' }]);
    });

    return () => {
      source.close();
    };
  }, []);

  const queueProgress = Math.round((tasksCompleted / Math.max(1, tasksTotal)) * 100);
  const uptimeText = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`;

  const handlePauseResume = async () => {
    const action = isPaused ? 'resume' : 'pause';
    try {
      await fetch('/api/midnight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      setIsPaused((p) => !p);
    } catch {
      // best effort
    }
  };

  const addProject = async () => {
    try {
      const path = isElectron && electronAPI ? await electronAPI.dialog.openFolder() : null;
      if (!path) return;
      await fetch('/api/midnight/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: path }),
      });
      const queueRes = await fetch('/api/midnight/queue', { cache: 'no-store' });
      if (queueRes.ok) {
        const q = await queueRes.json();
        setQueue(Array.isArray(q.projects) ? q.projects : []);
      }
    } catch {
      // best effort
    }
  };

  const reorderProject = async (projectId: string, newIndex: number) => {
    try {
      await fetch('/api/midnight/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, newPriority: newIndex }),
      });
      setQueue((prev) => {
        const idx = prev.findIndex((p) => p.id === projectId);
        if (idx < 0) return prev;
        const next = [...prev];
        const [moved] = next.splice(idx, 1);
        next.splice(Math.max(0, Math.min(newIndex, next.length)), 0, moved);
        return next;
      });
    } catch {
      // best effort
    }
  };

  const removeProject = async (projectId: string) => {
    try {
      await fetch(`/api/midnight/queue?id=${encodeURIComponent(projectId)}`, { method: 'DELETE' });
      setQueue((prev) => prev.filter((p) => p.id !== projectId));
    } catch {
      // best effort
    }
  };

  const recoverSnapshot = async (snapshotId: string) => {
    try {
      await fetch('/api/midnight/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId }),
      });
    } catch {
      // best effort
    }
  };

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3 bg-[#090f1b] text-slate-100">
      <HudHeader
        title="PROJECT MIDNIGHT"
        subtitle="Autonomous build command center with live actor/sentinel streams."
        right={<div className="flex items-center gap-2 text-[11px] text-slate-200"><PulsingDot tone={midnightActive ? 'green' : 'amber'} />{statusLabel}</div>}
      />

      <div className="grid grid-cols-2 gap-2">
        <AnimatedCounter label="Uptime" value={uptimeText} />
        <AnimatedCounter label="Active Model" value={activeModel.split('/').pop() || activeModel} />
        <AnimatedCounter label="Tasks" value={`${tasksCompleted}/${tasksTotal}`} />
        <AnimatedCounter label="Queue" value={queue.length} />
      </div>

      <HudCard
        title="Controls"
        tone="purple"
        actions={<span className="text-[10px] text-violet-300 uppercase tracking-[0.14em]">{statusLabel}</span>}
      >
        <div className="space-y-3">
          <TrustSlider value={trustLevel} onChange={setTrustLevel} />
          <label className="flex items-center justify-between text-[12px]">
            <span className="text-slate-300">Protocol Team (8-model)</span>
            <input type="checkbox" checked={protocolMode} onChange={(e) => setProtocolMode(e.target.checked)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <HudButton tone="green" onClick={() => void startMidnight()}>Start</HudButton>
            <HudButton tone="amber" onClick={() => void handlePauseResume()}>{isPaused ? 'Resume' : 'Pause'}</HudButton>
            <HudButton tone="red" onClick={() => void stopMidnight()}>Stop</HudButton>
          </div>
        </div>
      </HudCard>

      <HudCard title="Live Factory Dashboard" tone="cyan">
        <div className="space-y-3">
          <HudGauge label="Confidence" value={confidence} tone={lastStatus === 'error' ? 'red' : lastStatus === 'warning' ? 'amber' : 'green'} />
          <HudGauge label="Current Task Progress" value={queueProgress} tone="purple" />
          <div className="text-[11px] text-slate-300">Project: <span className="text-cyan-200">{currentProject}</span></div>
          <div className="text-[11px] text-slate-300">Task: <span className="text-violet-200">{currentTask}</span></div>
          <div className="grid grid-cols-1 gap-2">
            <HudTerminal title="Actor Stream" lines={actorLines.slice(-40)} />
            <HudTerminal title="Sentinel Stream" lines={sentinelLines.slice(-40)} />
          </div>
        </div>
      </HudCard>

      <HudCard
        title="Queue Manager"
        tone="amber"
        actions={<HudButton tone="amber" onClick={() => void addProject()}>Add Project</HudButton>}
      >
        <QueueList
          projects={queue}
          onReorder={reorderProject}
          onRemove={removeProject}
          currentProjectId={queue.find((q) => q.status === 'building')?.id}
        />
      </HudCard>

      <HudCard title="Snapshots & Recovery" tone="red">
        <div className="space-y-2">
          {snapshots.length === 0 ? <div className="text-[12px] text-slate-400">No snapshots found.</div> : null}
          {snapshots.slice(0, 10).map((snap) => (
            <div key={snap.id} className="flex items-center justify-between rounded-md border border-white/10 bg-[#0b1120]/70 p-2">
              <div>
                <div className="text-[12px] text-slate-200">{snap.label || snap.id}</div>
                <div className="text-[10px] text-slate-400">{snap.createdAt || snap.timestamp || 'Unknown time'}</div>
              </div>
              <HudButton tone="red" onClick={() => void recoverSnapshot(snap.id)}>Rollback</HudButton>
            </div>
          ))}
        </div>
      </HudCard>
    </div>
  );
}
