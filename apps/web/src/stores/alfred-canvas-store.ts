'use client';

import { create } from 'zustand';

export type CanvasMode = 'screen' | 'code' | 'terminal' | 'files' | 'vibe' | 'dashboard' | 'simulation' | 'video' | 'execution' | 'idle';

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

export interface AgentInfo {
  id: string;
  name: string;
  task: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  progress: number;
  cost: number;
  startedAt: number;
  completedAt?: number;
  output?: string;
}

export interface PendingAction {
  id: string;
  description: string;
  actionLabel?: string;
  cancelLabel?: string;
}

export type Artifact = {
  id: string;
  type: 'code' | 'html' | 'url' | 'video' | 'image' | 'simulation' | 'execution';
  title: string;
  code?: string;
  language?: string;
  url?: string;
  timestamp: number;
};
interface AlfredCanvasState {
  activeMode: CanvasMode;
  pinned: boolean;
  content: CanvasContent | null;
  contentHistory: CanvasContent[];
  sessions: AlfredSession[];
  activeSessionId: string;
  workflows: WorkflowStat[];
  agents: AgentInfo[];
  stats: { totalTasks: number; completedTasks: number; successRate: number; totalCost: number; activeAgents: number };
  pendingAction: PendingAction | null;
  artifacts: Artifact[];

  setMode: (mode: CanvasMode) => void;
  setPinned: (pinned: boolean) => void;
  pushContent: (content: CanvasContent) => void;
  clearContent: () => void;

  setPendingAction: (action: PendingAction | null) => void;
  addArtifact: (artifact: Artifact) => void;
  removeArtifact: (id: string) => void;
  clearArtifacts: () => void;

  addSession: (session: AlfredSession) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  updateSession: (id: string, updates: Partial<AlfredSession>) => void;

  addWorkflow: (wf: WorkflowStat) => void;
  updateWorkflow: (id: string, updates: Partial<WorkflowStat>) => void;
  removeWorkflow: (id: string) => void;

  addAgent: (agent: Omit<AgentInfo, 'id'>) => void;
  updateAgent: (id: string, patch: Partial<AgentInfo>) => void;
  removeAgent: (id: string) => void;

  updateStats: (updates: Partial<AlfredCanvasState['stats']>) => void;
  incrementTask: (completed?: boolean) => void;
}

let agentCounter = 0;

export const useAlfredCanvas = create<AlfredCanvasState>((set) => ({
  activeMode: 'idle',
  pinned: false,
  content: null,
  contentHistory: [],
  sessions: [{ id: 'main', name: 'Alfred', createdAt: Date.now(), status: 'active', taskCount: 0, completedCount: 0 }],
  activeSessionId: 'main',
  workflows: [],
  agents: [],
  stats: { totalTasks: 0, completedTasks: 0, successRate: 100, totalCost: 0, activeAgents: 1 },
  pendingAction: null,
  artifacts: [],

  setMode: (mode) => set({ activeMode: mode }),
  setPinned: (pinned) => set({ pinned }),

  pushContent: (content) => set((s) => ({
    content,
    contentHistory: [...s.contentHistory.slice(-50), content],
    activeMode: s.pinned ? s.activeMode : content.type,
  })),

  clearContent: () => set({ content: null, activeMode: 'idle' }),

  setPendingAction: (action) => set({ pendingAction: action }),

  addArtifact: (artifact) => set((s) => ({
    artifacts: [...s.artifacts.slice(-20), artifact],
  })),
  removeArtifact: (id) => set((s) => ({
    artifacts: s.artifacts.filter((a) => a.id !== id),
  })),
  clearArtifacts: () => set({ artifacts: [] }),

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

  addAgent: (agent) => set((s) => {
    const id = `agent-${Date.now().toString(36)}-${(++agentCounter).toString(36)}`;
    const newAgent: AgentInfo = { ...agent, id };
    const activeAgents = s.agents.filter((a) => a.status === 'running').length + (agent.status === 'running' ? 1 : 0);
    return {
      agents: [...s.agents, newAgent],
      stats: { ...s.stats, activeAgents },
    };
  }),

  updateAgent: (id, patch) => set((s) => {
    const agents = s.agents.map((a) => a.id === id ? { ...a, ...patch } : a);
    const activeAgents = agents.filter((a) => a.status === 'running').length;
    const totalCost = agents.reduce((sum, a) => sum + a.cost, 0);
    return { agents, stats: { ...s.stats, activeAgents, totalCost } };
  }),

  removeAgent: (id) => set((s) => {
    const agents = s.agents.filter((a) => a.id !== id);
    const activeAgents = agents.filter((a) => a.status === 'running').length;
    const totalCost = agents.reduce((sum, a) => sum + a.cost, 0);
    return { agents, stats: { ...s.stats, activeAgents, totalCost } };
  }),

  updateStats: (updates) => set((s) => ({ stats: { ...s.stats, ...updates } })),
  incrementTask: (completed) => set((s) => {
    const totalTasks = s.stats.totalTasks + 1;
    const completedTasks = s.stats.completedTasks + (completed ? 1 : 0);
    const successRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;
    return { stats: { ...s.stats, totalTasks, completedTasks, successRate } };
  }),
}));
