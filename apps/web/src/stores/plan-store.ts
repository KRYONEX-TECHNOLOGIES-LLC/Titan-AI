'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Types ──

export type ChatMode = 'agent' | 'chat' | 'plan';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked' | 'skipped';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface PlanTask {
  id: string;
  parentId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  phase: number;
  order: number;
  tags: string[];
  assignedTo: string;
  blockedBy: string[];
  subtaskIds: string[];
  notes: string;
  errorLog: string[];
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  checklist: ChecklistItem[];
  deepLink: string | null;
}

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface MemoryEntry {
  id: string;
  type: 'reminder' | 'note' | 'deeplink' | 'warning' | 'insight' | 'error_pattern';
  title: string;
  content: string;
  linkedTaskIds: string[];
  pinned: boolean;
  createdAt: number;
  expiresAt: number | null;
}

export interface ManagerReport {
  id: string;
  timestamp: number;
  type: 'progress' | 'error' | 'snitch' | 'common_sense' | 'final_check';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  details: string;
  taskId: string | null;
  resolved: boolean;
}

export interface PlanPhase {
  id: number;
  name: string;
  description: string;
  taskIds: string[];
  progress: number;
}

export interface FinalChecklist {
  id: string;
  category: 'frontend' | 'backend' | 'database' | 'auth' | 'api' | 'testing' | 'deployment' | 'ux' | 'performance' | 'security' | 'accessibility';
  label: string;
  checked: boolean;
  autoCheck: boolean;
  notes: string;
}

// ── Common Sense Rules ──

const COMMON_SENSE_RULES: FinalChecklist[] = [
  { id: 'cs-fe-routes', category: 'frontend', label: 'All pages/routes are created and accessible', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-fe-buttons', category: 'frontend', label: 'All buttons and interactive elements have handlers', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-fe-forms', category: 'frontend', label: 'All forms have validation and submit handlers', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-fe-responsive', category: 'frontend', label: 'UI is responsive across screen sizes', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-fe-loading', category: 'frontend', label: 'Loading and error states are handled', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-fe-nav', category: 'frontend', label: 'Navigation works between all pages', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-be-api', category: 'backend', label: 'All API endpoints are implemented', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-be-error', category: 'backend', label: 'API error handling returns proper status codes', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-be-validation', category: 'backend', label: 'Input validation on all endpoints', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-db-schema', category: 'database', label: 'Database schema is created with migrations', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-db-seed', category: 'database', label: 'Seed data or sample data exists', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-auth-login', category: 'auth', label: 'Login/signup flow works end-to-end', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-auth-protect', category: 'auth', label: 'Protected routes require authentication', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-auth-roles', category: 'auth', label: 'Role-based access control if needed', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-api-cors', category: 'api', label: 'CORS configured correctly', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-api-rate', category: 'api', label: 'Rate limiting on public endpoints', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-test-unit', category: 'testing', label: 'Unit tests for critical functions', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-test-e2e', category: 'testing', label: 'E2E tests for user flows', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-deploy-env', category: 'deployment', label: 'Environment variables documented', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-deploy-build', category: 'deployment', label: 'Production build works without errors', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-ux-feedback', category: 'ux', label: 'User actions have visual feedback (toasts, modals)', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-ux-empty', category: 'ux', label: 'Empty states show helpful messages', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-perf-images', category: 'performance', label: 'Images are optimized and lazy-loaded', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-perf-bundle', category: 'performance', label: 'Bundle size is reasonable', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-sec-xss', category: 'security', label: 'User input is sanitized (XSS prevention)', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-sec-secrets', category: 'security', label: 'No secrets in client-side code', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-a11y-alt', category: 'accessibility', label: 'Images have alt text', checked: false, autoCheck: false, notes: '' },
  { id: 'cs-a11y-keyboard', category: 'accessibility', label: 'Keyboard navigation works', checked: false, autoCheck: false, notes: '' },
];

// ── Execution State ──

export type ExecutionStatus = 'idle' | 'scanning' | 'planning' | 'executing' | 'paused' | 'done' | 'error';

export interface PlanExecution {
  status: ExecutionStatus;
  currentTaskId: string | null;
  startedAt: number | null;
  pausedAt: number | null;
  error: string | null;
  scanProgress: number;
  completedTaskIds: string[];
  failedTaskIds: string[];
}

// ── Store Interface ──

interface PlanState {
  chatMode: ChatMode;
  setChatMode: (mode: ChatMode) => void;

  // Plan
  planName: string;
  setPlanName: (name: string) => void;
  tasks: Record<string, PlanTask>;
  phases: PlanPhase[];
  addTask: (task: Omit<PlanTask, 'id' | 'createdAt' | 'updatedAt' | 'completedAt' | 'subtaskIds' | 'errorLog'>) => string;
  updateTask: (id: string, updates: Partial<PlanTask>) => void;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
  addSubtask: (parentId: string, title: string) => string;
  reorderTask: (id: string, newOrder: number) => void;
  bulkAddTasks: (tasks: Array<{ title: string; description: string; phase: number; priority: TaskPriority; tags: string[]; checklist?: ChecklistItem[] }>) => void;
  clearPlan: () => void;

  // Execution
  execution: PlanExecution;
  startExecution: () => void;
  pauseExecution: () => void;
  resumeExecution: () => void;
  stopExecution: () => void;
  setExecutionStatus: (status: ExecutionStatus) => void;
  setCurrentTask: (taskId: string | null) => void;
  markTaskExecuted: (taskId: string, success: boolean) => void;
  setScanProgress: (pct: number) => void;

  // Memory Bank
  memories: MemoryEntry[];
  addMemory: (entry: Omit<MemoryEntry, 'id' | 'createdAt'>) => string;
  updateMemory: (id: string, updates: Partial<MemoryEntry>) => void;
  removeMemory: (id: string) => void;
  togglePinMemory: (id: string) => void;

  // Manager
  reports: ManagerReport[];
  addReport: (report: Omit<ManagerReport, 'id' | 'timestamp'>) => void;
  resolveReport: (id: string) => void;
  clearResolvedReports: () => void;

  // Final Checklist
  finalChecklist: FinalChecklist[];
  toggleChecklistItem: (id: string) => void;
  updateChecklistNotes: (id: string, notes: string) => void;
  replaceChecklist: (items: FinalChecklist[]) => void;
  resetChecklist: () => void;

  // Plan Executing Flag (used to suppress file watcher during execution)
  planExecuting: boolean;
  setPlanExecuting: (v: boolean) => void;

  // Computed
  totalTasks: () => number;
  completedTasks: () => number;
  progress: () => number;
  activeTaskCount: () => number;
  unresolvedReports: () => number;
  pinnedMemories: () => MemoryEntry[];
}

let _taskCounter = 0;
function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(++_taskCounter).toString(36)}`;
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set, get) => ({
      chatMode: 'agent',
      setChatMode: (mode) => set({ chatMode: mode }),

      planName: '',
      setPlanName: (name) => set({ planName: name }),
      tasks: {},
      phases: [],

      addTask: (taskData) => {
        const id = genId('task');
        const now = Date.now();
        const task: PlanTask = {
          ...taskData,
          id,
          subtaskIds: [],
          errorLog: [],
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        };
        set((state) => ({
          tasks: { ...state.tasks, [id]: task },
        }));
        return id;
      },

      updateTask: (id, updates) => {
        set((state) => {
          const existing = state.tasks[id];
          if (!existing) return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: { ...existing, ...updates, updatedAt: Date.now() },
            },
          };
        });
      },

      toggleTask: (id) => {
        set((state) => {
          const task = state.tasks[id];
          if (!task) return state;
          const newStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed';
          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...task,
                status: newStatus,
                updatedAt: Date.now(),
                completedAt: newStatus === 'completed' ? Date.now() : null,
              },
            },
          };
        });
      },

      removeTask: (id) => {
        set((state) => {
          const { [id]: _, ...rest } = state.tasks;
          return { tasks: rest };
        });
      },

      addSubtask: (parentId, title) => {
        const id = genId('sub');
        const now = Date.now();
        const parent = get().tasks[parentId];
        if (!parent) return id;

        const subtask: PlanTask = {
          id,
          parentId,
          title,
          description: '',
          status: 'pending',
          priority: parent.priority,
          phase: parent.phase,
          order: parent.subtaskIds.length,
          tags: parent.tags,
          assignedTo: 'titan',
          blockedBy: [],
          subtaskIds: [],
          notes: '',
          errorLog: [],
          checklist: [],
          deepLink: null,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        };

        set((state) => ({
          tasks: {
            ...state.tasks,
            [id]: subtask,
            [parentId]: {
              ...parent,
              subtaskIds: [...parent.subtaskIds, id],
              updatedAt: now,
            },
          },
        }));
        return id;
      },

      reorderTask: (id, newOrder) => {
        set((state) => {
          const task = state.tasks[id];
          if (!task) return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: { ...task, order: newOrder, updatedAt: Date.now() },
            },
          };
        });
      },

      bulkAddTasks: (taskDataList) => {
        const now = Date.now();
        const newTasks: Record<string, PlanTask> = {};
        for (let i = 0; i < taskDataList.length; i++) {
          const td = taskDataList[i];
          const id = genId('task');
          newTasks[id] = {
            id,
            parentId: null,
            title: td.title,
            description: td.description,
            status: 'pending',
            priority: td.priority,
            phase: td.phase,
            order: i,
            tags: td.tags,
            assignedTo: 'titan',
            blockedBy: [],
            subtaskIds: [],
            notes: '',
            errorLog: [],
            checklist: td.checklist ?? [],
            deepLink: null,
            createdAt: now,
            updatedAt: now,
            completedAt: null,
          };
        }
        set((state) => ({
          tasks: { ...state.tasks, ...newTasks },
        }));
      },

      clearPlan: () => set({
        tasks: {}, phases: [], planName: '', memories: [], reports: [],
        finalChecklist: [...COMMON_SENSE_RULES],
        execution: { status: 'idle', currentTaskId: null, startedAt: null, pausedAt: null, error: null, scanProgress: 0, completedTaskIds: [], failedTaskIds: [] },
      }),

      // Execution
      execution: { status: 'idle', currentTaskId: null, startedAt: null, pausedAt: null, error: null, scanProgress: 0, completedTaskIds: [], failedTaskIds: [] },

      startExecution: () => set(state => ({
        execution: { ...state.execution, status: 'scanning', startedAt: Date.now(), pausedAt: null, error: null, scanProgress: 0, completedTaskIds: [], failedTaskIds: [] },
      })),

      pauseExecution: () => set(state => ({
        execution: { ...state.execution, status: 'paused', pausedAt: Date.now() },
      })),

      resumeExecution: () => set(state => ({
        execution: { ...state.execution, status: 'executing', pausedAt: null },
      })),

      stopExecution: () => set(state => ({
        execution: { ...state.execution, status: 'idle', currentTaskId: null },
      })),

      setExecutionStatus: (status) => set(state => ({
        execution: { ...state.execution, status },
      })),

      setCurrentTask: (taskId) => set(state => ({
        execution: { ...state.execution, currentTaskId: taskId },
      })),

      markTaskExecuted: (taskId, success) => set(state => ({
        execution: {
          ...state.execution,
          completedTaskIds: success ? [...state.execution.completedTaskIds, taskId] : state.execution.completedTaskIds,
          failedTaskIds: success ? state.execution.failedTaskIds : [...state.execution.failedTaskIds, taskId],
        },
      })),

      setScanProgress: (pct) => set(state => ({
        execution: { ...state.execution, scanProgress: pct },
      })),

      // Memory
      memories: [],
      addMemory: (entry) => {
        const id = genId('mem');
        set((state) => ({
          memories: [...state.memories, { ...entry, id, createdAt: Date.now() }],
        }));
        return id;
      },
      updateMemory: (id, updates) => {
        set((state) => ({
          memories: state.memories.map((m) => (m.id === id ? { ...m, ...updates } : m)),
        }));
      },
      removeMemory: (id) => {
        set((state) => ({
          memories: state.memories.filter((m) => m.id !== id),
        }));
      },
      togglePinMemory: (id) => {
        set((state) => ({
          memories: state.memories.map((m) =>
            m.id === id ? { ...m, pinned: !m.pinned } : m,
          ),
        }));
      },

      // Manager
      reports: [],
      addReport: (report) => {
        const id = genId('rpt');
        set((state) => ({
          reports: [{ ...report, id, timestamp: Date.now() }, ...state.reports].slice(0, 500),
        }));
      },
      resolveReport: (id) => {
        set((state) => ({
          reports: state.reports.map((r) => (r.id === id ? { ...r, resolved: true } : r)),
        }));
      },
      clearResolvedReports: () => {
        set((state) => ({
          reports: state.reports.filter((r) => !r.resolved),
        }));
      },

      // Final Checklist
      finalChecklist: [...COMMON_SENSE_RULES],
      toggleChecklistItem: (id) => {
        set((state) => ({
          finalChecklist: state.finalChecklist.map((item) =>
            item.id === id ? { ...item, checked: !item.checked } : item,
          ),
        }));
      },
      updateChecklistNotes: (id, notes) => {
        set((state) => ({
          finalChecklist: state.finalChecklist.map((item) =>
            item.id === id ? { ...item, notes } : item,
          ),
        }));
      },
      replaceChecklist: (items) => set({ finalChecklist: items }),
      resetChecklist: () => set({ finalChecklist: [...COMMON_SENSE_RULES] }),

      // Plan Executing Flag
      planExecuting: false,
      setPlanExecuting: (v) => set({ planExecuting: v }),

      // Computed
      totalTasks: () => {
        const tasks = get().tasks;
        return Object.values(tasks).filter((t) => t.parentId === null).length;
      },
      completedTasks: () => {
        const tasks = get().tasks;
        return Object.values(tasks).filter((t) => t.parentId === null && t.status === 'completed').length;
      },
      progress: () => {
        const total = get().totalTasks();
        if (total === 0) return 0;
        return Math.round((get().completedTasks() / total) * 100);
      },
      activeTaskCount: () => {
        return Object.values(get().tasks).filter((t) => t.status === 'in_progress').length;
      },
      unresolvedReports: () => {
        return get().reports.filter((r) => !r.resolved).length;
      },
      pinnedMemories: () => {
        return get().memories.filter((m) => m.pinned);
      },
    }),
    {
      name: 'titan-plan',
      partialize: (state) => ({
        chatMode: state.chatMode,
        planName: state.planName,
        tasks: state.tasks,
        phases: state.phases,
        memories: state.memories,
        reports: state.reports.slice(0, 200),
        finalChecklist: state.finalChecklist,
        execution: state.execution,
      }),
    },
  ),
);
