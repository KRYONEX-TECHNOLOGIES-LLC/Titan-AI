'use client';

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { usePlanStore, type PlanTask, type TaskStatus, type MemoryEntry, type ManagerReport, type FinalChecklist, type ExecutionStatus } from '@/stores/plan-store';
import { useCodeDirectory } from '@/stores/code-directory';
import { useFileStore } from '@/stores/file-store';
import { DESIGN_TEMPLATES, type DesignTemplate } from '@/lib/plan/design-templates';
import type { FileNode } from '@/stores/file-store';
import { isElectron, electronAPI } from '@/lib/electron';

async function ensureProjectFolder(planName: string): Promise<boolean> {
  const { workspaceOpen, openFolder } = useFileStore.getState();
  if (workspaceOpen) return true;
  const safeName = planName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'titan-project';
  const timestamp = Date.now().toString(36);
  const folderName = `${safeName}-${timestamp}`;
  if (isElectron && electronAPI) {
    try {
      const basePath = `C:\\TitanProjects`;
      await electronAPI.fs.mkdir(basePath).catch(() => {});
      const fullPath = `${basePath}\\${folderName}`;
      await electronAPI.fs.mkdir(fullPath);
      openFolder(fullPath, folderName, []);
      return true;
    } catch (e) { console.error('[plan] Failed to create project folder:', e); }
  }
  try {
    const res = await fetch('/api/workspace/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: folderName }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.path) { openFolder(data.path, folderName, []); return true; }
    }
  } catch { /* fallback failed */ }
  return false;
}

function serializeFileTree(nodes: FileNode[], prefix = '', maxDepth = 4, depth = 0): string {
  if (depth >= maxDepth) return '';
  const lines: string[] = [];
  for (const node of nodes) {
    const indent = '  '.repeat(depth);
    if (node.type === 'folder') {
      lines.push(`${indent}${node.name}/`);
      if (node.children) {
        lines.push(serializeFileTree(node.children, prefix ? `${prefix}/${node.name}` : node.name, maxDepth, depth + 1));
      }
    } else {
      lines.push(`${indent}${node.name}`);
    }
  }
  return lines.filter(Boolean).join('\n');
}

const STATUS_ICONS: Record<TaskStatus, { icon: string; color: string }> = {
  pending: { icon: '○', color: '#808080' },
  in_progress: { icon: '◉', color: '#3b82f6' },
  completed: { icon: '✓', color: '#22c55e' },
  failed: { icon: '✗', color: '#ef4444' },
  blocked: { icon: '⊘', color: '#f59e0b' },
  skipped: { icon: '⊖', color: '#6b7280' },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#3b82f6',
  low: '#6b7280',
};

const CATEGORY_LABELS: Record<string, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  database: 'Database',
  auth: 'Auth',
  api: 'API',
  testing: 'Testing',
  deployment: 'Deploy',
  ux: 'UX',
  performance: 'Perf',
  security: 'Security',
  accessibility: 'A11y',
};

type PanelTab = 'tasks' | 'memory' | 'manager' | 'checklist' | 'templates';

export function PlanModePanel() {
  const [activeTab, setActiveTab] = useState<PanelTab>('tasks');
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [filterPhase, setFilterPhase] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | null>(null);
  const [pseudoMode, setPseudoMode] = useState(false);
  const [pseudoInput, setPseudoInput] = useState('');
  const [pseudoLoading, setPseudoLoading] = useState(false);

  const store = usePlanStore();
  const totalTasks = store.totalTasks();
  const completedTasks = store.completedTasks();
  const progress = store.progress();
  const unresolvedCount = store.unresolvedReports();
  const exec = store.execution;

  const sortedTasks = useMemo(() => {
    let tasks = Object.values(store.tasks).filter((t) => t.parentId === null);
    if (filterPhase !== null) tasks = tasks.filter((t) => t.phase === filterPhase);
    if (filterStatus) tasks = tasks.filter((t) => t.status === filterStatus);
    return tasks.sort((a, b) => a.phase - b.phase || a.order - b.order);
  }, [store.tasks, filterPhase, filterStatus]);

  const phases = useMemo(() => {
    const phaseMap = new Map<number, { count: number; completed: number }>();
    Object.values(store.tasks)
      .filter((t) => t.parentId === null)
      .forEach((t) => {
        const p = phaseMap.get(t.phase) || { count: 0, completed: 0 };
        p.count++;
        if (t.status === 'completed') p.completed++;
        phaseMap.set(t.phase, p);
      });
    return Array.from(phaseMap.entries()).sort((a, b) => a[0] - b[0]);
  }, [store.tasks]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const executionRef = useRef(false);

  const handleStartPlan = useCallback(async () => {
    if (totalTasks === 0 || executionRef.current) return;

    const firstTask = Object.values(store.tasks).find(t => t.parentId === null);
    const projectHint = firstTask?.title || 'project';
    await ensureProjectFolder(projectHint);

    executionRef.current = true;
    store.startExecution();

    // Phase 1: Scan real file tree
    try {
      const fileTree = useFileStore.getState().fileTree;
      const treeStr = fileTree.length > 0 ? serializeFileTree(fileTree) : '(empty workspace)';
      const res = await fetch('/api/plan/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileTree: treeStr }),
      });
      if (res.ok) {
        const { directory } = await res.json();
        useCodeDirectory.getState().setDirectory(directory);
        store.setScanProgress(100);
      }
    } catch {
      // scan is best-effort
    }

    store.setExecutionStatus('executing');

    // Phase 2: Execute tasks via the real agent API (non-blocking via setTimeout chain)
    const pendingTasks = Object.values(store.tasks)
      .filter(t => t.parentId === null && t.status === 'pending')
      .sort((a, b) => a.phase - b.phase || a.order - b.order);

    const executeNext = async (index: number) => {
      if (index >= pendingTasks.length) {
        usePlanStore.getState().setExecutionStatus('done');
        usePlanStore.getState().setCurrentTask(null);
        executionRef.current = false;
        return;
      }

      const currentExec = usePlanStore.getState().execution;
      if (currentExec.status === 'idle') {
        executionRef.current = false;
        return;
      }
      if (currentExec.status === 'paused') {
        setTimeout(() => void executeNext(index), 500);
        return;
      }

      const task = pendingTasks[index];
      const ps = usePlanStore.getState();
      ps.setCurrentTask(task.id);
      ps.updateTask(task.id, { status: 'in_progress' });

      try {
        const chatRes = await fetch('/api/chat/continue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'user', content: `[Plan Mode Task ${index + 1}/${pendingTasks.length}] Execute this task for "${ps.planName || 'the project'}":\n\nTask: ${task.title}\nDescription: ${task.description}\nPriority: ${task.priority}\nTags: ${task.tags.join(', ')}\n\nImplement this task now. Read the relevant files, make the changes, and verify they work.` },
            ],
            model: 'google/gemini-2.0-flash-001',
            workspacePath: useFileStore.getState().workspacePath || undefined,
          }),
        });

        if (chatRes.ok) {
          usePlanStore.getState().updateTask(task.id, { status: 'completed', completedAt: Date.now() });
          usePlanStore.getState().markTaskExecuted(task.id, true);
        } else {
          usePlanStore.getState().updateTask(task.id, { status: 'failed' });
          usePlanStore.getState().markTaskExecuted(task.id, false);
          usePlanStore.getState().addReport({
            type: 'error', severity: 'warning',
            title: `Task failed: ${task.title}`,
            details: `HTTP ${chatRes.status}`,
            taskId: task.id, resolved: false,
          });
        }
      } catch {
        usePlanStore.getState().updateTask(task.id, { status: 'failed' });
        usePlanStore.getState().markTaskExecuted(task.id, false);
      }

      // Yield to UI thread, then continue with next task
      setTimeout(() => void executeNext(index + 1), 50);
    };

    void executeNext(0);
  }, [store, totalTasks]);

  const handlePausePlan = useCallback(() => {
    if (exec.status === 'paused') {
      store.resumeExecution();
    } else {
      store.pauseExecution();
    }
  }, [store, exec.status]);

  const handleStopPlan = useCallback(() => {
    store.stopExecution();
  }, [store]);

  const handlePseudoSubmit = useCallback(async () => {
    if (!pseudoInput.trim() || pseudoLoading) return;
    setPseudoLoading(true);
    try {
      const res = await fetch('/api/plan/pseudo-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: pseudoInput }),
      });
      if (!res.ok) throw new Error('Failed to parse pseudo-code');
      const result = await res.json();

      store.clearPlan();
      store.setPlanName(result.projectName);

      const allTasks: Array<{ title: string; description: string; phase: number; priority: 'critical' | 'high' | 'medium' | 'low'; tags: string[]; checklist?: Array<{id: string; label: string; checked: boolean}> }> = [];
      result.phases.forEach((phase: any, phaseIdx: number) => {
        phase.tasks.forEach((task: any) => {
          allTasks.push({
            title: task.title,
            description: task.description,
            phase: phaseIdx + 1,
            priority: task.priority,
            tags: task.tags || [],
            checklist: Array.isArray(task.subtasks)
              ? task.subtasks.map((s: string, i: number) => ({ id: `sub-${i}`, label: s, checked: false }))
              : [],
          });
        });
      });
      store.bulkAddTasks(allTasks);
      setPseudoMode(false);
      setPseudoInput('');
    } catch (err) {
      store.addReport({
        type: 'error',
        severity: 'critical',
        title: 'Pseudo-code parse failed',
        details: (err as Error).message,
        taskId: null,
        resolved: false,
      });
    } finally {
      setPseudoLoading(false);
    }
  }, [pseudoInput, pseudoLoading, store]);

  const isRunning = exec.status === 'scanning' || exec.status === 'executing';
  const isPaused = exec.status === 'paused';

  const execStatusLabel: Record<ExecutionStatus, { text: string; color: string }> = {
    idle: { text: 'Ready', color: '#808080' },
    scanning: { text: 'Scanning...', color: '#a78bfa' },
    planning: { text: 'Planning...', color: '#3b82f6' },
    executing: { text: 'Executing...', color: '#22c55e' },
    paused: { text: 'Paused', color: '#f59e0b' },
    done: { text: 'Complete', color: '#22c55e' },
    error: { text: 'Error', color: '#ef4444' },
  };
  const statusInfo = execStatusLabel[exec.status];

  return (
    <div className="flex flex-col h-full text-[12px]">
      {/* Progress Header */}
      <div className="px-3 py-2 border-b border-[#2d2d2d] shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="iridescent-text font-bold text-[13px]">
            {store.planName || 'Plan Mode'}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: statusInfo.color, background: `${statusInfo.color}15`, border: `1px solid ${statusInfo.color}30` }}>
              {statusInfo.text}
            </span>
            <span className="text-[#808080]">
              {completedTasks}/{totalTasks}
            </span>
          </div>
        </div>
        <div className="w-full h-2 bg-[#2d2d2d] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full iridescent-badge transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-[#808080]">
          <span>{progress}% complete</span>
          <span>·</span>
          <span>{store.activeTaskCount()} active</span>
          {unresolvedCount > 0 && (
            <>
              <span>·</span>
              <span className="text-[#f59e0b]">{unresolvedCount} issues</span>
            </>
          )}
        </div>
      </div>

      {/* Execution Controls */}
      <div className="px-3 py-2 border-b border-[#2d2d2d] shrink-0 flex items-center gap-2">
        {!isRunning && !isPaused ? (
          <button
            onClick={() => void handleStartPlan()}
            disabled={totalTasks === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all iridescent-badge text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Start Plan
          </button>
        ) : (
          <>
            <button
              onClick={handlePausePlan}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${isPaused ? 'bg-[#22c55e] text-white hover:bg-[#16a34a]' : 'bg-[#f59e0b] text-black hover:bg-[#d97706]'}`}
            >
              {isPaused ? (
                <><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Resume</>
              ) : (
                <><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="3" width="6" height="18"/><rect x="14" y="3" width="6" height="18"/></svg> Pause</>
              )}
            </button>
            <button
              onClick={handleStopPlan}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-[#ef4444] text-white hover:bg-[#dc2626] transition-all"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
              Stop
            </button>
          </>
        )}

        <button
          onClick={() => setPseudoMode(!pseudoMode)}
          className={`ml-auto flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-all ${pseudoMode ? 'bg-[#a78bfa] text-white' : 'bg-[#2d2d2d] text-[#808080] hover:text-[#ccc]'}`}
          title="Pseudo-code mode"
        >
          {'</>'}
        </button>

        <button
          onClick={() => store.clearPlan()}
          className="px-2 py-1 rounded text-[10px] bg-[#2d2d2d] text-[#808080] hover:text-[#ef4444] transition-colors"
          title="Clear plan"
        >
          Clear
        </button>
      </div>

      {/* Pseudo-code Input */}
      {pseudoMode && (
        <div className="px-3 py-2 border-b border-[#2d2d2d] shrink-0 bg-[#1a1a2e]">
          <div className="text-[11px] text-[#a78bfa] font-medium mb-1.5">Pseudo-Code / Idea Input</div>
          <textarea
            value={pseudoInput}
            onChange={(e) => setPseudoInput(e.target.value)}
            placeholder="Paste pseudo-code, describe your idea, or write a rough spec...&#10;&#10;Example: Build a task manager with auth, teams, real-time updates..."
            rows={6}
            className="w-full bg-[#0d1117] border border-[#a78bfa30] rounded-md px-3 py-2 text-[12px] text-[#e0e0e0] placeholder-[#555] resize-none focus:outline-none focus:border-[#a78bfa60]"
          />
          <div className="flex items-center gap-2 mt-1.5">
            <button
              onClick={() => void handlePseudoSubmit()}
              disabled={pseudoLoading || pseudoInput.trim().length < 10}
              className="px-3 py-1 rounded-md text-[11px] font-medium iridescent-badge text-white disabled:opacity-40 hover:brightness-110 transition-all"
            >
              {pseudoLoading ? 'Parsing...' : 'Parse & Generate Plan'}
            </button>
            <span className="text-[10px] text-[#555]">{pseudoInput.length} chars</span>
          </div>
        </div>
      )}

      {/* Phase Filters */}
      {phases.length > 1 && (
        <div className="px-3 py-1.5 border-b border-[#2d2d2d] shrink-0 flex gap-1 flex-wrap">
          <button
            onClick={() => setFilterPhase(null)}
            className={`px-2 py-0.5 rounded text-[10px] ${filterPhase === null ? 'bg-[#569cd6] text-white' : 'bg-[#2d2d2d] text-[#808080] hover:text-[#ccc]'}`}
          >
            All
          </button>
          {phases.map(([phase, data]) => (
            <button
              key={phase}
              onClick={() => setFilterPhase(filterPhase === phase ? null : phase)}
              className={`px-2 py-0.5 rounded text-[10px] ${filterPhase === phase ? 'bg-[#569cd6] text-white' : 'bg-[#2d2d2d] text-[#808080] hover:text-[#ccc]'}`}
            >
              P{phase} ({data.completed}/{data.count})
            </button>
          ))}
        </div>
      )}

      {/* Tab Bar */}
      <div className="px-3 py-1 border-b border-[#2d2d2d] shrink-0 flex gap-0.5">
        {(['tasks', 'memory', 'manager', 'checklist', 'templates'] as PanelTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-2.5 py-1 rounded text-[11px] capitalize transition-colors ${
              activeTab === tab
                ? 'bg-[#37373d] text-[#e0e0e0]'
                : 'text-[#808080] hover:text-[#ccc] hover:bg-[#2a2a2a]'
            }`}
          >
            {tab === 'manager' && unresolvedCount > 0 && (
              <span className="inline-block w-1.5 h-1.5 bg-[#f59e0b] rounded-full mr-1" />
            )}
            {tab === 'templates' ? 'Design' : tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 titan-chat-scroll">
        {activeTab === 'tasks' && (
          <TasksPanel
            tasks={sortedTasks}
            allTasks={store.tasks}
            expandedTasks={expandedTasks}
            toggleExpand={toggleExpand}
            onToggle={store.toggleTask}
            onUpdate={store.updateTask}
            onAddSubtask={store.addSubtask}
            currentTaskId={exec.currentTaskId}
          />
        )}
        {activeTab === 'memory' && <MemoryPanel />}
        {activeTab === 'manager' && <ManagerPanel />}
        {activeTab === 'checklist' && <ChecklistPanel />}
        {activeTab === 'templates' && <DesignTemplatePanel />}
      </div>
    </div>
  );
}

// ── Tasks Panel ──

function TasksPanel({
  tasks,
  allTasks,
  expandedTasks,
  toggleExpand,
  onToggle,
  onUpdate,
  onAddSubtask,
  currentTaskId,
}: {
  tasks: PlanTask[];
  allTasks: Record<string, PlanTask>;
  expandedTasks: Set<string>;
  toggleExpand: (id: string) => void;
  onToggle: (id: string) => void;
  onUpdate: (id: string, updates: Partial<PlanTask>) => void;
  onAddSubtask: (parentId: string, title: string) => string;
  currentTaskId: string | null;
}) {
  if (tasks.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-[#555]">
        <div className="text-[20px] mb-2">📋</div>
        <div className="text-[12px]">No tasks yet</div>
        <div className="text-[11px] text-[#444] mt-1">
          Describe what you want to build in the chat, or use pseudo-code mode
        </div>
      </div>
    );
  }

  return (
    <div className="px-2 py-1">
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          allTasks={allTasks}
          isExpanded={expandedTasks.has(task.id)}
          onToggleExpand={() => toggleExpand(task.id)}
          onToggleStatus={() => onToggle(task.id)}
          onUpdate={onUpdate}
          onAddSubtask={onAddSubtask}
          depth={0}
          isCurrent={task.id === currentTaskId}
        />
      ))}
    </div>
  );
}

function TaskItem({
  task,
  allTasks,
  isExpanded,
  onToggleExpand,
  onToggleStatus,
  onUpdate,
  onAddSubtask,
  depth,
  isCurrent,
}: {
  task: PlanTask;
  allTasks: Record<string, PlanTask>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleStatus: () => void;
  onUpdate: (id: string, updates: Partial<PlanTask>) => void;
  onAddSubtask: (parentId: string, title: string) => string;
  depth: number;
  isCurrent: boolean;
}) {
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const statusInfo = STATUS_ICONS[task.status];
  const hasSubtasks = task.subtaskIds.length > 0;
  const statusClass = `task-${task.status.replace('_', '-')}`;

  const handleAddSubtask = () => {
    if (newSubtaskTitle.trim()) {
      onAddSubtask(task.id, newSubtaskTitle.trim());
      setNewSubtaskTitle('');
      setAddingSubtask(false);
    }
  };

  return (
    <div className={statusClass} style={{ paddingLeft: depth * 16 }}>
      <div className={`flex items-start gap-1.5 px-1.5 py-1 rounded group transition-colors ${isCurrent ? 'bg-[#1a2a1a] ring-1 ring-[#22c55e40]' : 'hover:bg-[#2a2a2a]'}`}>
        {hasSubtasks && (
          <button onClick={onToggleExpand} className="mt-0.5 text-[10px] text-[#808080] w-3 shrink-0">
            {isExpanded ? '▾' : '▸'}
          </button>
        )}
        {!hasSubtasks && <span className="w-3 shrink-0" />}
        <button
          onClick={onToggleStatus}
          className="mt-0.5 shrink-0 text-[13px] leading-none transition-colors"
          style={{ color: statusInfo.color }}
          title={task.status}
        >
          {isCurrent && task.status === 'in_progress' ? (
            <span className="animate-pulse">{statusInfo.icon}</span>
          ) : (
            statusInfo.icon
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`task-title text-[12px] leading-tight break-words ${task.status === 'completed' ? 'text-[#555] line-through' : 'text-[#e0e0e0]'}`}>
              {task.title}
            </span>
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: PRIORITY_COLORS[task.priority] || '#6b7280' }}
              title={task.priority}
            />
          </div>
          {task.description && isExpanded && (
            <div className="text-[11px] text-[#808080] mt-0.5 leading-snug">
              {task.description}
            </div>
          )}
          {task.tags.length > 0 && (
            <div className="flex gap-1 mt-0.5 flex-wrap">
              {task.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="px-1.5 py-0 rounded text-[9px] bg-[#2d2d2d] text-[#808080]">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {task.checklist.length > 0 && !isExpanded && (
            <div className="mt-1 ml-1 space-y-0.5">
              {task.checklist.slice(0, 3).map((item) => (
                <div key={item.id} className="flex items-start gap-1.5 text-[10px] leading-snug">
                  <span className="shrink-0 mt-[2px]" style={{ color: item.checked ? '#22c55e' : '#555' }}>●</span>
                  <span className={item.checked ? 'text-[#555] line-through' : 'text-[#808080]'}>{item.label}</span>
                </div>
              ))}
              {task.checklist.length > 3 && (
                <div className="text-[9px] text-[#555] ml-4">+{task.checklist.length - 3} more</div>
              )}
            </div>
          )}
          {task.checklist.length > 0 && isExpanded && (
            <div className="mt-1 space-y-0.5">
              {task.checklist.map((item) => (
                <label key={item.id} className="flex items-center gap-1.5 text-[11px] text-[#808080] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => {
                      const newChecklist = task.checklist.map((c) =>
                        c.id === item.id ? { ...c, checked: !c.checked } : c,
                      );
                      onUpdate(task.id, { checklist: newChecklist });
                    }}
                    className="w-3 h-3 accent-[#22c55e]"
                  />
                  <span className={item.checked ? 'line-through opacity-50' : ''}>{item.label}</span>
                </label>
              ))}
            </div>
          )}
          {isExpanded && (
            <div className="mt-1">
              {!addingSubtask ? (
                <button
                  onClick={() => setAddingSubtask(true)}
                  className="text-[10px] text-[#555] hover:text-[#a78bfa] transition-colors"
                >
                  + Add subtask
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask()}
                    placeholder="Subtask title..."
                    className="flex-1 bg-[#1e1e1e] border border-[#333] rounded px-1.5 py-0.5 text-[11px] text-[#e0e0e0] focus:outline-none focus:border-[#a78bfa60]"
                    autoFocus
                  />
                  <button onClick={handleAddSubtask} className="text-[10px] text-[#22c55e]">✓</button>
                  <button onClick={() => setAddingSubtask(false)} className="text-[10px] text-[#808080]">✕</button>
                </div>
              )}
            </div>
          )}
        </div>
        <span className="text-[9px] text-[#555] shrink-0 opacity-0 group-hover:opacity-100">
          P{task.phase}
        </span>
      </div>
      {isExpanded && hasSubtasks && (
        <div>
          {task.subtaskIds.map((subId) => {
            const sub = allTasks[subId];
            if (!sub) return null;
            return (
              <TaskItem
                key={subId}
                task={sub}
                allTasks={allTasks}
                isExpanded={false}
                onToggleExpand={() => {}}
                onToggleStatus={() => usePlanStore.getState().toggleTask(subId)}
                onUpdate={onUpdate}
                onAddSubtask={onAddSubtask}
                depth={depth + 1}
                isCurrent={false}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Memory Panel ──

function MemoryPanel() {
  const memories = usePlanStore((s) => s.memories);
  const togglePin = usePlanStore((s) => s.togglePinMemory);
  const removeMemory = usePlanStore((s) => s.removeMemory);

  const TYPE_ICONS: Record<string, string> = {
    reminder: '⏰',
    note: '📝',
    deeplink: '🔗',
    warning: '⚠️',
    insight: '💡',
    error_pattern: '🐛',
  };

  if (memories.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-[#555]">
        <div className="text-[20px] mb-2">🧠</div>
        <div className="text-[12px]">Memory Bank Empty</div>
        <div className="text-[11px] text-[#444] mt-1">
          Plan mode stores reminders, patterns, and deep links here
        </div>
      </div>
    );
  }

  const pinned = memories.filter((m) => m.pinned);
  const unpinned = memories.filter((m) => !m.pinned);

  return (
    <div className="px-2 py-1">
      {pinned.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] text-[#808080] uppercase tracking-wider px-1.5 mb-1">Pinned</div>
          {pinned.map((m) => (
            <MemoryItem key={m.id} memory={m} icon={TYPE_ICONS[m.type] || '📝'} onTogglePin={togglePin} onRemove={removeMemory} />
          ))}
        </div>
      )}
      {unpinned.map((m) => (
        <MemoryItem key={m.id} memory={m} icon={TYPE_ICONS[m.type] || '📝'} onTogglePin={togglePin} onRemove={removeMemory} />
      ))}
    </div>
  );
}

function MemoryItem({ memory, icon, onTogglePin, onRemove }: { memory: MemoryEntry; icon: string; onTogglePin: (id: string) => void; onRemove: (id: string) => void }) {
  return (
    <div className="px-1.5 py-1.5 rounded hover:bg-[#2a2a2a] group mb-0.5">
      <div className="flex items-start gap-1.5">
        <span className="text-[12px] shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-[#e0e0e0] font-medium">{memory.title}</div>
          <div className="text-[11px] text-[#808080] mt-0.5 leading-snug break-words">{memory.content}</div>
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
          <button onClick={() => onTogglePin(memory.id)} className="text-[10px] text-[#808080] hover:text-[#e0e0e0]" title={memory.pinned ? 'Unpin' : 'Pin'}>
            {memory.pinned ? '📌' : '📍'}
          </button>
          <button onClick={() => onRemove(memory.id)} className="text-[10px] text-[#808080] hover:text-[#f85149]">✕</button>
        </div>
      </div>
    </div>
  );
}

// ── Manager Panel ──

function ManagerPanel() {
  const reports = usePlanStore((s) => s.reports);
  const resolveReport = usePlanStore((s) => s.resolveReport);
  const clearResolved = usePlanStore((s) => s.clearResolvedReports);

  const unresolved = reports.filter((r) => !r.resolved);
  const resolved = reports.filter((r) => r.resolved);

  const SEVERITY_COLORS: Record<string, string> = {
    info: '#3b82f6',
    warning: '#f59e0b',
    critical: '#ef4444',
  };

  const TYPE_ICONS: Record<string, string> = {
    progress: '📊',
    error: '❌',
    snitch: '🔍',
    common_sense: '🧠',
    final_check: '✅',
  };

  if (reports.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-[#555]">
        <div className="text-[20px] mb-2">👔</div>
        <div className="text-[12px]">No Manager Reports</div>
        <div className="text-[11px] text-[#444] mt-1">
          The manager checks tasks, catches errors, and reports issues
        </div>
      </div>
    );
  }

  return (
    <div className="px-2 py-1">
      {unresolved.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] text-[#f59e0b] uppercase tracking-wider px-1.5 mb-1">
            Unresolved ({unresolved.length})
          </div>
          {unresolved.map((r) => (
            <div key={r.id} className="px-1.5 py-1.5 rounded hover:bg-[#2a2a2a] group mb-0.5">
              <div className="flex items-start gap-1.5">
                <span className="text-[12px] shrink-0">{TYPE_ICONS[r.type] || '📋'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: SEVERITY_COLORS[r.severity] }} />
                    <span className="text-[12px] text-[#e0e0e0]">{r.title}</span>
                  </div>
                  <div className="text-[11px] text-[#808080] mt-0.5 break-words">{r.details}</div>
                </div>
                <button onClick={() => resolveReport(r.id)} className="text-[10px] text-[#808080] hover:text-[#22c55e] opacity-0 group-hover:opacity-100 shrink-0" title="Resolve">
                  ✓
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {resolved.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-1.5 mb-1">
            <span className="text-[10px] text-[#555] uppercase tracking-wider">Resolved ({resolved.length})</span>
            <button onClick={clearResolved} className="text-[10px] text-[#555] hover:text-[#808080]">Clear</button>
          </div>
          {resolved.slice(0, 20).map((r) => (
            <div key={r.id} className="px-1.5 py-1 text-[11px] text-[#555] opacity-60">
              {TYPE_ICONS[r.type]} {r.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Final Checklist Panel ──

function ChecklistPanel() {
  const checklist = usePlanStore((s) => s.finalChecklist);
  const toggleItem = usePlanStore((s) => s.toggleChecklistItem);
  const replaceChecklist = usePlanStore((s) => s.replaceChecklist);
  const directory = useCodeDirectory((s) => s.directory);
  const [generating, setGenerating] = useState(false);

  const handleGenerateChecklist = useCallback(async () => {
    if (!directory || directory.scannedAt === 0) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/plan/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory }),
      });
      if (res.ok) {
        const { items } = await res.json();
        const newChecklist: FinalChecklist[] = items.map((item: any) => ({
          id: item.id,
          category: item.category || 'general',
          label: item.label,
          checked: false,
          autoCheck: false,
          notes: item.filePaths?.join(', ') || '',
        }));
        replaceChecklist(newChecklist);
      }
    } catch {
      // fallback to static
    } finally {
      setGenerating(false);
    }
  }, [directory, replaceChecklist]);

  const groups = useMemo(() => {
    const map = new Map<string, FinalChecklist[]>();
    for (const item of checklist) {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries());
  }, [checklist]);

  const totalChecked = checklist.filter((c) => c.checked).length;
  const totalItems = checklist.length;

  return (
    <div className="px-2 py-1">
      <div className="px-1.5 mb-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#808080]">Final Verification</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleGenerateChecklist()}
              disabled={generating}
              className="text-[10px] text-[#a78bfa] hover:text-[#c4b5fd] transition-colors disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Auto-Generate'}
            </button>
            <span className="text-[#808080]">{totalChecked}/{totalItems}</span>
          </div>
        </div>
        <div className="w-full h-1.5 bg-[#2d2d2d] rounded-full overflow-hidden mt-1">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${totalItems > 0 ? (totalChecked / totalItems) * 100 : 0}%`,
              background: totalChecked === totalItems ? '#22c55e' : '#3b82f6',
            }}
          />
        </div>
      </div>
      {groups.map(([category, items]) => {
        const catChecked = items.filter((i) => i.checked).length;
        return (
          <div key={category} className="mb-2">
            <div className="flex items-center justify-between px-1.5 mb-0.5">
              <span className="text-[10px] text-[#808080] uppercase tracking-wider font-medium">
                {CATEGORY_LABELS[category] || category}
              </span>
              <span className="text-[9px] text-[#555]">{catChecked}/{items.length}</span>
            </div>
            {items.map((item) => (
              <label key={item.id} className="flex items-start gap-2 px-1.5 py-1 rounded hover:bg-[#2a2a2a] cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleItem(item.id)}
                  className="w-3 h-3 mt-0.5 accent-[#22c55e] shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <span className={`text-[11px] leading-snug ${item.checked ? 'text-[#555] line-through' : 'text-[#cccccc]'}`}>
                    {item.label}
                  </span>
                  {item.notes && (
                    <div className="text-[9px] text-[#555] mt-0.5">{item.notes}</div>
                  )}
                </div>
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Design Template Panel ──

function DesignTemplatePanel() {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customColors, setCustomColors] = useState<Record<string, string>>({});

  const tiers: Array<{ tier: 'basic' | 'modern' | 'elite'; label: string }> = [
    { tier: 'basic', label: 'Basic' },
    { tier: 'modern', label: 'Modern' },
    { tier: 'elite', label: 'Elite (Iron Man)' },
  ];

  const handleSelectTemplate = (template: DesignTemplate) => {
    setSelectedTemplate(template.id);
    setCustomColors(template.colors);

    const store = usePlanStore.getState();
    store.addMemory({
      type: 'note',
      title: `Design Template: ${template.name}`,
      content: `Selected "${template.name}" (${template.tier}). Style: ${template.style}. Primary: ${template.colors.primary}, Accent: ${template.colors.accent}`,
      linkedTaskIds: [],
      pinned: true,
      expiresAt: null,
    });
  };

  return (
    <div className="px-3 py-2">
      <div className="text-[11px] text-[#808080] mb-2">Choose a design template for your project. AI will follow this style.</div>

      {tiers.map(({ tier, label }) => (
        <div key={tier} className="mb-3">
          <div className="text-[10px] text-[#808080] uppercase tracking-wider font-medium mb-1.5">{label}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {DESIGN_TEMPLATES.filter(t => t.tier === tier).map(template => (
              <button
                key={template.id}
                onClick={() => handleSelectTemplate(template)}
                className={`text-left p-2 rounded-md border transition-all ${
                  selectedTemplate === template.id
                    ? 'border-[#a78bfa] bg-[#a78bfa10]'
                    : 'border-[#2d2d2d] hover:border-[#555] bg-[#1e1e1e]'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ background: template.colors.primary }}
                  />
                  <span className="text-[11px] text-[#e0e0e0] font-medium truncate">{template.name}</span>
                </div>
                <div className="text-[9px] text-[#808080] leading-snug line-clamp-2">{template.description}</div>
                <div className="flex gap-0.5 mt-1">
                  {[template.colors.primary, template.colors.secondary, template.colors.accent, template.colors.background].map((color, i) => (
                    <span key={i} className="w-2.5 h-2.5 rounded-full border border-[#333]" style={{ background: color }} />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      {selectedTemplate && (
        <div className="mt-3 p-2 rounded-md border border-[#a78bfa30] bg-[#1a1a2e]">
          <div className="text-[10px] text-[#a78bfa] uppercase tracking-wider font-medium mb-1.5">Color Customization</div>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(customColors).map(([key, value]) => (
              <label key={key} className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={value}
                  onChange={(e) => setCustomColors(prev => ({ ...prev, [key]: e.target.value }))}
                  className="w-5 h-5 rounded cursor-pointer border-0"
                />
                <span className="text-[10px] text-[#808080] capitalize">{key}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
