import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TerminalSession {
  id: string;
  title: string;
  type: 'bash' | 'node' | 'python' | 'powershell' | 'zsh';
  pid?: number;
  cwd: string;
  active: boolean;
  exitCode?: number | null;
}

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string;
  shellType: 'bash' | 'node' | 'python' | 'powershell' | 'zsh';

  // Display
  fontSize: number;
  fontFamily: string;
  scrollback: number;
  cursorStyle: 'block' | 'underline' | 'bar';
  cursorBlink: boolean;

  // Actions
  addSession: (type?: TerminalSession['type'], cwd?: string) => string;
  removeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  updateSessionCwd: (id: string, cwd: string) => void;
  setSessionExitCode: (id: string, code: number | null) => void;
  setShellType: (type: TerminalSession['type']) => void;
  setFontSize: (size: number) => void;
  clearAllSessions: () => void;
}

function makeId() {
  return `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: '',
      shellType: 'bash',

      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
      scrollback: 10000,
      cursorStyle: 'block',
      cursorBlink: true,

      addSession: (type, cwd = '~') => {
        const id = makeId();
        const sessionType = type ?? get().shellType;
        const labelMap: Record<string, string> = {
          bash: 'bash', node: 'node', python: 'python', powershell: 'PowerShell', zsh: 'zsh',
        };
        const session: TerminalSession = {
          id,
          title: labelMap[sessionType] ?? 'shell',
          type: sessionType,
          cwd,
          active: true,
          exitCode: null,
        };
        set((s) => ({
          sessions: [...s.sessions, session],
          activeSessionId: id,
        }));
        return id;
      },

      removeSession: (id) =>
        set((s) => {
          const remaining = s.sessions.filter((t) => t.id !== id);
          const newActive =
            s.activeSessionId === id
              ? remaining.length > 0
                ? remaining[remaining.length - 1].id
                : ''
              : s.activeSessionId;
          return { sessions: remaining, activeSessionId: newActive };
        }),

      setActiveSession: (id) => set({ activeSessionId: id }),

      renameSession: (id, title) =>
        set((s) => ({
          sessions: s.sessions.map((t) => (t.id === id ? { ...t, title } : t)),
        })),

      updateSessionCwd: (id, cwd) =>
        set((s) => ({
          sessions: s.sessions.map((t) => (t.id === id ? { ...t, cwd } : t)),
        })),

      setSessionExitCode: (id, code) =>
        set((s) => ({
          sessions: s.sessions.map((t) =>
            t.id === id ? { ...t, exitCode: code, active: false } : t
          ),
        })),

      setShellType: (type) => set({ shellType: type }),
      setFontSize: (size) => set({ fontSize: size }),

      clearAllSessions: () => set({ sessions: [], activeSessionId: '' }),
    }),
    {
      name: 'titan-terminal',
      partialize: (s) => ({
        shellType: s.shellType,
        fontSize: s.fontSize,
        cursorStyle: s.cursorStyle,
        cursorBlink: s.cursorBlink,
        scrollback: s.scrollback,
      }),
    }
  )
);
