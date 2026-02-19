import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DebugSessionStatus =
  | 'idle'
  | 'initializing'
  | 'running'
  | 'stopped'
  | 'paused'
  | 'terminated';

export interface StackFrame {
  id: number;
  name: string;
  source: string;
  line: number;
  column: number;
}

export interface Variable {
  name: string;
  value: string;
  type: string;
  variablesReference: number;
  expandable: boolean;
}

export interface WatchExpression {
  id: string;
  expression: string;
  value?: string;
  type?: string;
  error?: string;
}

export interface LaunchConfig {
  id: string;
  name: string;
  type: 'node' | 'python' | 'go' | 'rust' | 'chrome' | 'custom';
  request: 'launch' | 'attach';
  program?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  port?: number;
  url?: string;
}

export interface DebugOutput {
  id: string;
  type: 'output' | 'error' | 'warning' | 'info' | 'telemetry';
  category: 'stdout' | 'stderr' | 'console' | 'important';
  output: string;
  timestamp: number;
  source?: string;
  line?: number;
}

export interface DebugState {
  // Session
  status: DebugSessionStatus;
  activeConfigId: string;
  launchConfigs: LaunchConfig[];

  // Execution state
  callStack: StackFrame[];
  activeFrameId: number;

  // Variables (by scope)
  variables: Record<number, Variable[]>;

  // Watch
  watchExpressions: WatchExpression[];

  // Output
  debugOutput: DebugOutput[];

  // Actions
  setStatus: (status: DebugSessionStatus) => void;
  setActiveConfig: (id: string) => void;
  addLaunchConfig: (config: Omit<LaunchConfig, 'id'>) => void;
  updateLaunchConfig: (id: string, updates: Partial<LaunchConfig>) => void;
  removeLaunchConfig: (id: string) => void;

  setCallStack: (frames: StackFrame[]) => void;
  setActiveFrame: (id: number) => void;
  setVariables: (scopeRef: number, vars: Variable[]) => void;

  addWatchExpression: (expr: string) => void;
  removeWatchExpression: (id: string) => void;
  updateWatchExpression: (id: string, updates: Partial<WatchExpression>) => void;

  appendDebugOutput: (entry: Omit<DebugOutput, 'id' | 'timestamp'>) => void;
  clearDebugOutput: () => void;

  startSession: () => void;
  stopSession: () => void;
  pauseSession: () => void;
  continueSession: () => void;
  stepOver: () => void;
  stepInto: () => void;
  stepOut: () => void;
  restart: () => void;
}

export const useDebugStore = create<DebugState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      activeConfigId: '',
      launchConfigs: [
        {
          id: 'default-node',
          name: 'Launch Node.js',
          type: 'node',
          request: 'launch',
          program: '${workspaceFolder}/index.js',
          args: [],
          env: {},
          cwd: '${workspaceFolder}',
        },
        {
          id: 'default-python',
          name: 'Launch Python',
          type: 'python',
          request: 'launch',
          program: '${workspaceFolder}/main.py',
          args: [],
          cwd: '${workspaceFolder}',
        },
      ],

      callStack: [],
      activeFrameId: -1,
      variables: {},
      watchExpressions: [],
      debugOutput: [],

      setStatus: (status) => set({ status }),
      setActiveConfig: (id) => set({ activeConfigId: id }),

      addLaunchConfig: (config) =>
        set((s) => ({
          launchConfigs: [
            ...s.launchConfigs,
            { ...config, id: `config-${Date.now()}` },
          ],
        })),

      updateLaunchConfig: (id, updates) =>
        set((s) => ({
          launchConfigs: s.launchConfigs.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      removeLaunchConfig: (id) =>
        set((s) => ({
          launchConfigs: s.launchConfigs.filter((c) => c.id !== id),
        })),

      setCallStack: (frames) => set({ callStack: frames }),
      setActiveFrame: (id) => set({ activeFrameId: id }),
      setVariables: (scopeRef, vars) =>
        set((s) => ({ variables: { ...s.variables, [scopeRef]: vars } })),

      addWatchExpression: (expr) =>
        set((s) => ({
          watchExpressions: [
            ...s.watchExpressions,
            { id: `watch-${Date.now()}`, expression: expr },
          ],
        })),

      removeWatchExpression: (id) =>
        set((s) => ({
          watchExpressions: s.watchExpressions.filter((w) => w.id !== id),
        })),

      updateWatchExpression: (id, updates) =>
        set((s) => ({
          watchExpressions: s.watchExpressions.map((w) =>
            w.id === id ? { ...w, ...updates } : w
          ),
        })),

      appendDebugOutput: (entry) =>
        set((s) => ({
          debugOutput: [
            ...s.debugOutput,
            { ...entry, id: `out-${Date.now()}`, timestamp: Date.now() },
          ].slice(-2000),
        })),

      clearDebugOutput: () => set({ debugOutput: [] }),

      startSession: () => {
        const { activeConfigId, launchConfigs } = get();
        const config = launchConfigs.find((c) => c.id === activeConfigId);
        if (!config) return;
        set({ status: 'initializing', callStack: [], variables: {}, debugOutput: [] });
        fetch('/api/debug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start', config }),
        }).then(async (res) => {
          if (res.ok) set({ status: 'running' });
          else set({ status: 'terminated' });
        }).catch(() => set({ status: 'terminated' }));
      },

      stopSession: () => {
        fetch('/api/debug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stop' }),
        });
        set({ status: 'terminated', callStack: [], variables: {} });
      },

      pauseSession: () => {
        fetch('/api/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pause' }) });
        set({ status: 'paused' });
      },

      continueSession: () => {
        fetch('/api/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'continue' }) });
        set({ status: 'running', callStack: [] });
      },

      stepOver: () => fetch('/api/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stepOver' }) }),
      stepInto: () => fetch('/api/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stepInto' }) }),
      stepOut: () => fetch('/api/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stepOut' }) }),

      restart: () => {
        get().stopSession();
        setTimeout(() => get().startSession(), 300);
      },
    }),
    {
      name: 'titan-debug',
      partialize: (s) => ({
        launchConfigs: s.launchConfigs,
        watchExpressions: s.watchExpressions,
        activeConfigId: s.activeConfigId,
      }),
    }
  )
);
