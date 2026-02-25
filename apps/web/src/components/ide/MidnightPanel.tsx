'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { usePlanStore } from '@/stores/plan-store';

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

type PlanTask = {
  text: string;
  status: 'pending' | 'in_progress' | 'complete' | 'failed';
};

type GeneratedPlan = {
  projectName: string;
  idea: string;
  techStack: Record<string, unknown>;
  tasks: string[];
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
  startError?: string | null;
  isStarting?: boolean;
  onBackToIDE?: () => void;
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
  startError,
  isStarting,
  onBackToIDE,
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

  // Project Setup state
  const [projectName, setProjectName] = useState('');
  const [instruction, setInstruction] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);
  const [planError, setPlanError] = useState('');
  const [planTasks, setPlanTasks] = useState<PlanTask[]>([]);
  const [showSetup, setShowSetup] = useState(true);

  // Chat input for new projects
  const [chatInput, setChatInput] = useState('');
  const [droppedImages, setDroppedImages] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChatDescribe = useCallback(async () => {
    if (!chatInput.trim()) return;
    setInstruction(chatInput.trim());
    setChatInput('');
    void generatePlanFromChat(chatInput.trim());
  }, [chatInput]);

  const generatePlanFromChat = useCallback(async (text: string) => {
    setIsGenerating(true);
    setPlanError('');
    try {
      const res = await fetch('/api/midnight/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: text, projectName: projectName || 'New Project' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPlanError(data.error || 'Failed to generate plan');
        return;
      }
      setGeneratedPlan(data);
      setPlanTasks(data.tasks.map((t: string) => ({ text: t, status: 'pending' as const })));
    } catch (err: unknown) {
      setPlanError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsGenerating(false);
    }
  }, [projectName]);

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) setDroppedImages(prev => [...prev, ...files]);
  }, []);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) setDroppedImages(prev => [...prev, ...files]);
  }, []);

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
    source.addEventListener('task_started', (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as { description?: string };
      const ps = usePlanStore.getState();
      const tasks = Object.values(ps.tasks).filter(t => t.status === 'pending');
      const match = tasks.find(t => payload.description && t.title.includes(payload.description));
      if (match) ps.updateTask(match.id, { status: 'in_progress' });
    });
    source.addEventListener('task_completed', (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as { description?: string };
      const ps = usePlanStore.getState();
      const tasks = Object.values(ps.tasks).filter(t => t.status === 'in_progress');
      const match = tasks.find(t => payload.description && t.title.includes(payload.description));
      if (match) {
        ps.updateTask(match.id, { status: 'completed', completedAt: Date.now() });
        ps.markTaskExecuted(match.id, true);
      }
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

  const generatePlan = useCallback(async () => {
    if (!instruction.trim()) return;
    void generatePlanFromChat(instruction.trim());
  }, [instruction, generatePlanFromChat]);

  const removeTask = useCallback((idx: number) => {
    setPlanTasks((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addTask = useCallback(() => {
    setPlanTasks((prev) => [...prev, { text: '', status: 'pending' }]);
  }, []);

  const updateTaskText = useCallback((idx: number, text: string) => {
    setPlanTasks((prev) => prev.map((t, i) => i === idx ? { ...t, text } : t));
  }, []);

  const startBuilding = useCallback(async () => {
    if (!generatedPlan || planTasks.length === 0) return;

    const planStore = usePlanStore.getState();
    planStore.setPlanName(generatedPlan.projectName);
    planStore.bulkAddTasks(
      planTasks
        .filter(t => t.text.trim())
        .map((t, i) => ({
          title: t.text,
          description: '',
          phase: 1,
          priority: 'medium' as const,
          tags: ['midnight'],
        })),
    );
    planStore.startExecution();

    const tasksText = planTasks
      .filter((t) => t.text.trim())
      .map((t) => `- [ ] ${t.text}`)
      .join('\n');

    const ideaMd = `# ${generatedPlan.projectName}\n\n${generatedPlan.idea}`;
    const techStackJson = JSON.stringify(generatedPlan.techStack, null, 2);
    const defOfDone = `# Definition of Done\n\n${tasksText}`;

    try {
      const toolRes = await fetch('/api/agent/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'run_command',
          args: {
            command: `mkdir "${generatedPlan.projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}"`,
          },
        }),
      });
      if (!toolRes.ok) throw new Error('Could not create project folder');

      const folderName = generatedPlan.projectName.replace(/[^a-zA-Z0-9_-]/g, '_');

      for (const [filename, content] of [
        ['idea.md', ideaMd],
        ['tech_stack.json', techStackJson],
        ['definition_of_done.md', defOfDone],
      ]) {
        await fetch('/api/agent/tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'write_file',
            args: { path: `${folderName}/${filename}`, content },
          }),
        });
      }

      await fetch('/api/midnight/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: folderName, name: generatedPlan.projectName }),
      });

      const queueRes = await fetch('/api/midnight/queue', { cache: 'no-store' });
      if (queueRes.ok) {
        const q = await queueRes.json();
        setQueue(Array.isArray(q.projects) ? q.projects : []);
      }

      setShowSetup(false);
      void startMidnight();
    } catch (err: unknown) {
      setPlanError(err instanceof Error ? err.message : 'Failed to start build');
    }
  }, [generatedPlan, planTasks, startMidnight]);

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3 bg-[#090f1b] text-slate-100">
      <HudHeader
        title="PROJECT MIDNIGHT"
        subtitle="Autonomous build command center with live actor/sentinel streams."
        right={
          <div className="flex items-center gap-3 text-[11px] text-slate-200">
            <PulsingDot tone={midnightActive ? 'green' : 'amber'} />{statusLabel}
            {onBackToIDE && (
              <button
                onClick={onBackToIDE}
                className="px-2 py-1 rounded bg-slate-700/50 hover:bg-slate-600/50 text-[10px] text-slate-300 transition-colors border border-slate-600/30"
              >
                Back to IDE
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2">
        <AnimatedCounter label="Uptime" value={uptimeText} />
        <AnimatedCounter label="Active Model" value={activeModel.split('/').pop() || activeModel} />
        <AnimatedCounter label="Tasks" value={`${tasksCompleted}/${tasksTotal}`} />
        <AnimatedCounter label="Queue" value={queue.length} />
      </div>

      {/* Quick Chat — describe what you want */}
      <HudCard title="Describe Your Project" tone="green">
        <div className="space-y-2">
          <div
            className="relative"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleImageDrop}
          >
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleChatDescribe(); } }}
              placeholder="Describe your project, paste pseudo-code, or drop an image..."
              rows={3}
              className="w-full rounded-md border border-white/15 bg-[#0b1120] px-3 py-2 text-[13px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400/60 resize-none"
            />
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
          </div>
          {droppedImages.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {droppedImages.map((f, i) => (
                <div key={i} className="relative">
                  <div className="w-12 h-12 rounded border border-white/10 bg-slate-800 flex items-center justify-center text-[9px] text-slate-400 overflow-hidden">
                    <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                  </div>
                  <button onClick={() => setDroppedImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center">✕</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <HudButton tone="green" onClick={() => void handleChatDescribe()} disabled={!chatInput.trim()}>
              Generate Plan
            </HudButton>
            <HudButton tone="neutral" onClick={() => fileInputRef.current?.click()}>
              Add Image
            </HudButton>
          </div>
        </div>
      </HudCard>

      {/* Project Setup — instruction input + plan generation */}
      <HudCard
        title="New Project"
        tone="cyan"
        actions={
          <HudButton tone="neutral" onClick={() => setShowSetup((p) => !p)}>
            {showSetup ? 'Hide' : 'Show'}
          </HudButton>
        }
      >
        {showSetup && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-slate-400 uppercase tracking-wider mb-1">Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="My Awesome App"
                className="w-full rounded-md border border-white/15 bg-[#0b1120] px-3 py-2 text-[13px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400/60"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 uppercase tracking-wider mb-1">What do you want to build?</label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Describe your project... e.g. 'Build a full-stack todo app with Next.js, authentication, and a PostgreSQL database'"
                rows={4}
                className="w-full rounded-md border border-white/15 bg-[#0b1120] px-3 py-2 text-[13px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400/60 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <HudButton
                tone="cyan"
                onClick={() => void generatePlan()}
                disabled={isGenerating || instruction.trim().length < 5}
              >
                {isGenerating ? 'Generating Plan...' : 'Generate Plan'}
              </HudButton>
              {generatedPlan && (
                <HudButton tone="green" onClick={() => void startBuilding()}>
                  Start Building
                </HudButton>
              )}
            </div>
            {planError && (
              <div className="text-[12px] text-red-400 bg-red-900/20 border border-red-500/30 rounded-md px-3 py-2">{planError}</div>
            )}
          </div>
        )}
      </HudCard>

      {/* Generated Plan — editable task checklist */}
      {generatedPlan && (
        <HudCard title="Generated Plan" tone="purple">
          <div className="space-y-3">
            <div className="text-[12px] text-slate-300 bg-violet-900/15 border border-violet-500/20 rounded-md p-3">
              <div className="text-[11px] text-violet-300 uppercase tracking-wider mb-1 font-semibold">{generatedPlan.projectName}</div>
              <p className="text-slate-300 leading-relaxed">{generatedPlan.idea.slice(0, 300)}{generatedPlan.idea.length > 300 ? '...' : ''}</p>
            </div>
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
              Tech Stack
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(generatedPlan.techStack).map(([key, val]) => (
                <span key={key} className="px-2 py-0.5 rounded-full bg-cyan-900/30 border border-cyan-500/20 text-[11px] text-cyan-200">
                  {key}: {typeof val === 'string' ? val : Array.isArray(val) ? (val as string[]).join(', ') : String(val)}
                </span>
              ))}
            </div>
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold flex items-center justify-between">
              <span>Tasks ({planTasks.length})</span>
              <HudButton tone="green" onClick={addTask}>+ Add Task</HudButton>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {planTasks.map((task, idx) => (
                <div key={idx} className="flex items-start gap-2 group">
                  <span className={`mt-1 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px] ${
                    task.status === 'complete' ? 'bg-emerald-500/30 border-emerald-400/60 text-emerald-300' :
                    task.status === 'in_progress' ? 'bg-cyan-500/30 border-cyan-400/60 text-cyan-300' :
                    task.status === 'failed' ? 'bg-red-500/30 border-red-400/60 text-red-300' :
                    'border-white/20'
                  }`}>
                    {task.status === 'complete' ? '✓' : task.status === 'in_progress' ? '▸' : task.status === 'failed' ? '✕' : (idx + 1)}
                  </span>
                  <input
                    type="text"
                    value={task.text}
                    onChange={(e) => updateTaskText(idx, e.target.value)}
                    className="flex-1 bg-transparent border-b border-white/10 text-[12px] text-slate-200 py-0.5 focus:outline-none focus:border-cyan-400/40 placeholder-slate-600"
                    placeholder="Task description..."
                  />
                  <button
                    onClick={() => removeTask(idx)}
                    className="opacity-0 group-hover:opacity-100 text-[10px] text-red-400 hover:text-red-300 px-1 transition-opacity"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </HudCard>
      )}

      {/* Active Plan — live task status from sidecar */}
      {midnightActive && (
        <HudCard title="Active Plan" tone="green">
          <div className="space-y-2">
            <div className="text-[11px] text-slate-300">
              Project: <span className="text-cyan-200 font-medium">{currentProject}</span>
            </div>
            <div className="text-[11px] text-slate-300">
              Current Task: <span className="text-violet-200 font-medium">{currentTask}</span>
            </div>
            <HudGauge
              label={`Progress (${tasksCompleted} / ${tasksTotal})`}
              value={queueProgress}
              tone="green"
            />
            {planTasks.length > 0 && (
              <div className="space-y-1 mt-2 max-h-48 overflow-y-auto">
                {planTasks.map((task, idx) => (
                  <div key={idx} className={`flex items-center gap-2 text-[12px] rounded px-2 py-1 ${
                    task.status === 'complete' ? 'bg-emerald-900/20 text-emerald-300' :
                    task.status === 'in_progress' ? 'bg-cyan-900/20 text-cyan-200' :
                    task.status === 'failed' ? 'bg-red-900/20 text-red-300 line-through' :
                    'text-slate-400'
                  }`}>
                    <span className="w-4 text-center flex-shrink-0">
                      {task.status === 'complete' ? '✓' : task.status === 'in_progress' ? '▸' : task.status === 'failed' ? '✕' : '○'}
                    </span>
                    {task.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </HudCard>
      )}

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
            <HudButton tone="green" onClick={() => void startMidnight()} disabled={isStarting}>
              {isStarting ? 'Starting...' : midnightActive ? 'Open Factory' : 'Start'}
            </HudButton>
            <HudButton tone="amber" onClick={() => void handlePauseResume()}>{isPaused ? 'Resume' : 'Pause'}</HudButton>
            <HudButton tone="red" onClick={() => void stopMidnight()}>Stop</HudButton>
          </div>
          {startError && (
            <div className="text-[12px] text-red-400 bg-red-900/20 border border-red-500/30 rounded-md px-3 py-2 mt-2">
              {startError}
            </div>
          )}
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
