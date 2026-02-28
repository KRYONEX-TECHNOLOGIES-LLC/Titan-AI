'use client';

import { create } from 'zustand';

export type CanvasMode = 'screen' | 'code' | 'terminal' | 'files' | 'vibe' | 'dashboard' | 'idle';

export interface CanvasContent {
  type: CanvasMode;
  title?: string;
  data: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

export interface AlfredSession {
  id: string;
  name: string;
  createdAt: number;
  status: 'active' | 'idle' | 'complete';
  taskCount: number;
  completedCount: number;
}

export interface WorkflowStat {
  id: string;
  name: string;
  status: 'running' | 'complete' | 'failed' | 'queued';
  startedAt: number;
  progress: number;
  platform?: string;
}

interface AlfredCanvasState {
  activeMode: CanvasMode;
  pinned: boolean;
  content: CanvasContent | null;
  contentHistory: CanvasContent[];
  sessions: AlfredSession[];
  activeSessionId: string;
  workflows: WorkflowStat[];
  stats: { totalTasks: number; completedTasks: number; successRate: number; totalCost: number; activeAgents: number };

  setMode: (mode: CanvasMode) => void;
  setPinned: (pinned: boolean) => void;
  pushContent: (content: CanvasContent) => void;
  clearContent: () => void;

  addSession: (session: AlfredSession) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  updateSession: (id: string, updates: Partial<AlfredSession>) => void;

  addWorkflow: (wf: WorkflowStat) => void;
  updateWorkflow: (id: string, updates: Partial<WorkflowStat>) => void;
  removeWorkflow: (id: string) => void;

  updateStats: (updates: Partial<AlfredCanvasState['stats']>) => void;
  incrementTask: (completed?: boolean) => void;
}

export const useAlfredCanvas = create<AlfredCanvasState>((set) => ({
  activeMode: 'idle',
  pinned: false,
  content: null,
  contentHistory: [],
  sessions: [{ id: 'main', name: 'Alfred', createdAt: Date.now(), status: 'active', taskCount: 0, completedCount: 0 }],
  activeSessionId: 'main',
  workflows: [],
  stats: { totalTasks: 0, completedTasks: 0, successRate: 100, totalCost: 0, activeAgents: 1 },

  setMode: (mode) => set({ activeMode: mode }),
  setPinned: (pinned) => set({ pinned }),

  pushContent: (content) => set((s) => ({
    content,
    contentHistory: [...s.contentHistory.slice(-50), content],
    activeMode: s.pinned ? s.activeMode : content.type,
  })),

  clearContent: () => set({ content: null, activeMode: 'idle' }),

  addSession: (session) => set((s) => ({ sessions: [...s.sessions, session] })),
  removeSession: (id) => set((s) => ({
    sessions: s.sessions.filter((ss) => ss.id !== id),
    activeSessionId: s.activeSessionId === id ? 'main' : s.activeSessionId,
  })),
  setActiveSession: (id) => set({ activeSessionId: id }),
  updateSession: (id, updates) => set((s) => ({
    sessions: s.sessions.map((ss) => ss.id === id ? { ...ss, ...updates } : ss),
  })),

  addWorkflow: (wf) => set((s) => ({ workflows: [...s.workflows, wf] })),
  updateWorkflow: (id, updates) => set((s) => ({
    workflows: s.workflows.map((w) => w.id === id ? { ...w, ...updates } : w),
  })),
  removeWorkflow: (id) => set((s) => ({ workflows: s.workflows.filter((w) => w.id !== id) })),

  updateStats: (updates) => set((s) => ({ stats: { ...s.stats, ...updates } })),
  incrementTask: (completed) => set((s) => {
    const totalTasks = s.stats.totalTasks + 1;
    const completedTasks = s.stats.completedTasks + (completed ? 1 : 0);
    const successRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;
    return { stats: { ...s.stats, totalTasks, completedTasks, successRate } };
  }),
}));
