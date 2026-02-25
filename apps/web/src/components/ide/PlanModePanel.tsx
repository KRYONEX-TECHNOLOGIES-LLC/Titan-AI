'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { usePlanStore, type PlanTask, type TaskStatus, type MemoryEntry, type ManagerReport, type FinalChecklist } from '@/stores/plan-store';

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

type PanelTab = 'tasks' | 'memory' | 'manager' | 'checklist';

export function PlanModePanel() {
  const [activeTab, setActiveTab] = useState<PanelTab>('tasks');
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [filterPhase, setFilterPhase] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | null>(null);

  const store = usePlanStore();
  const totalTasks = store.totalTasks();
  const completedTasks = store.completedTasks();
  const progress = store.progress();
  const unresolvedCount = store.unresolvedReports();

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

  return (
    <div className="flex flex-col h-full text-[12px]">
      {/* Progress Header */}
      <div className="px-3 py-2 border-b border-[#2d2d2d] shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="iridescent-text font-bold text-[13px]">
            {store.planName || 'Plan Mode'}
          </span>
          <span className="text-[#808080]">
            {completedTasks}/{totalTasks}
          </span>
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
        {(['tasks', 'memory', 'manager', 'checklist'] as PanelTab[]).map((tab) => (
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
            {tab}
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
          />
        )}
        {activeTab === 'memory' && <MemoryPanel />}
        {activeTab === 'manager' && <ManagerPanel />}
        {activeTab === 'checklist' && <ChecklistPanel />}
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
}: {
  tasks: PlanTask[];
  allTasks: Record<string, PlanTask>;
  expandedTasks: Set<string>;
  toggleExpand: (id: string) => void;
  onToggle: (id: string) => void;
  onUpdate: (id: string, updates: Partial<PlanTask>) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-[#555]">
        <div className="text-[20px] mb-2">📋</div>
        <div className="text-[12px]">No tasks yet</div>
        <div className="text-[11px] text-[#444] mt-1">
          Describe what you want to build and Titan will break it into tasks
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
          depth={0}
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
  depth,
}: {
  task: PlanTask;
  allTasks: Record<string, PlanTask>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleStatus: () => void;
  onUpdate: (id: string, updates: Partial<PlanTask>) => void;
  depth: number;
}) {
  const statusInfo = STATUS_ICONS[task.status];
  const hasSubtasks = task.subtaskIds.length > 0;
  const statusClass = `task-${task.status.replace('_', '-')}`;

  return (
    <div className={statusClass} style={{ paddingLeft: depth * 16 }}>
      <div className="flex items-start gap-1.5 px-1.5 py-1 rounded hover:bg-[#2a2a2a] group">
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
          {statusInfo.icon}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="task-title text-[#e0e0e0] text-[12px] leading-tight break-words">
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
                depth={depth + 1}
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
          <span className="text-[#808080]">{totalChecked}/{totalItems}</span>
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
                <span className={`text-[11px] leading-snug ${item.checked ? 'text-[#555] line-through' : 'text-[#cccccc]'}`}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}
