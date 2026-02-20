import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type * as Monaco from 'monaco-editor';

export interface FileTab {
  name: string;
  path: string;
  icon: string;
  color: string;
  modified: boolean;
  language: string;
  viewState?: Monaco.editor.ICodeEditorViewState | null;
}

export interface EditorGroup {
  id: string;
  tabs: FileTab[];
  activeTab: string;
}

export interface Breakpoint {
  id: string;
  file: string;
  line: number;
  enabled: boolean;
  condition?: string;
  logMessage?: string;
  hitCount?: number;
}

export interface EditorState {
  // Tabs
  tabs: FileTab[];
  activeTab: string;

  // File contents (in-memory)
  fileContents: Record<string, string>;

  // Cursor
  cursorPosition: { line: number; column: number };

  // Editor instances (not persisted)
  editorRef: Monaco.editor.IStandaloneCodeEditor | null;
  monacoRef: typeof Monaco | null;

  // Font / display settings (persisted)
  fontSize: number;
  tabSize: number;
  fontFamily: string;

  // Breakpoints
  breakpoints: Breakpoint[];

  // Recent files
  recentFiles: string[];

  // Actions
  setEditorRef: (editor: Monaco.editor.IStandaloneCodeEditor | null) => void;
  setMonacoRef: (monaco: typeof Monaco | null) => void;

  openTab: (tab: FileTab) => void;
  closeTab: (name: string) => void;
  setActiveTab: (name: string) => void;
  updateFileContent: (name: string, content: string) => void;
  markTabModified: (name: string, modified: boolean) => void;
  saveTab: (name: string) => void;
  saveAllTabs: () => void;
  closeAllTabs: () => void;

  setCursorPosition: (pos: { line: number; column: number }) => void;
  setFontSize: (size: number) => void;
  setTabSize: (size: number) => void;

  addBreakpoint: (bp: Omit<Breakpoint, 'id'>) => void;
  removeBreakpoint: (id: string) => void;
  toggleBreakpoint: (file: string, line: number) => void;
  enableAllBreakpoints: () => void;
  disableAllBreakpoints: () => void;
  removeAllBreakpoints: () => void;

  addRecentFile: (path: string) => void;
  loadFileContents: (contents: Record<string, string>) => void;
}

function getFileInfo(name: string): { icon: string; color: string; language: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, { icon: string; color: string; language: string }> = {
    ts: { icon: 'TS', color: '#3178c6', language: 'typescript' },
    tsx: { icon: 'TSX', color: '#3178c6', language: 'typescript' },
    js: { icon: 'JS', color: '#f7df1e', language: 'javascript' },
    jsx: { icon: 'JSX', color: '#f7df1e', language: 'javascript' },
    py: { icon: 'PY', color: '#3572a5', language: 'python' },
    rs: { icon: 'RS', color: '#dea584', language: 'rust' },
    go: { icon: 'GO', color: '#00add8', language: 'go' },
    json: { icon: '{}', color: '#fbc02d', language: 'json' },
    md: { icon: 'MD', color: '#ffffff', language: 'markdown' },
    css: { icon: 'CSS', color: '#264de4', language: 'css' },
    html: { icon: 'HTML', color: '#e34f26', language: 'html' },
    env: { icon: 'ENV', color: '#3fb950', language: 'plaintext' },
    toml: { icon: 'TOML', color: '#9c4221', language: 'plaintext' },
    yaml: { icon: 'YAML', color: '#cb171e', language: 'yaml' },
    yml: { icon: 'YAML', color: '#cb171e', language: 'yaml' },
    sh: { icon: 'SH', color: '#89e051', language: 'shell' },
    sql: { icon: 'SQL', color: '#e38c00', language: 'sql' },
  };
  return map[ext] ?? { icon: ext.toUpperCase().slice(0, 3) || 'TXT', color: '#808080', language: 'plaintext' };
}

const INITIAL_FILE_CONTENTS: Record<string, string> = {
  'orchestrator.ts': `import { TitanAI } from '@titan/core';

export class AgentOrchestrator {
  private agents: Map<string, Agent> = new Map();
  private coordinator: CoordinatorAgent;

  constructor(private config: OrchestratorConfig) {
    this.coordinator = new CoordinatorAgent(config);
  }

  async dispatch(task: Task): Promise<TaskResult> {
    const plan = await this.coordinator.plan(task);
    const agents = this.selectAgents(plan);

    const results = await Promise.all(
      agents.map(agent => agent.execute(plan.subtasks.get(agent.id)!))
    );

    return this.coordinator.merge(results);
  }

  private selectAgents(plan: ExecutionPlan): Agent[] {
    return plan.requiredCapabilities.map(cap =>
      this.findBestAgent(cap)
    );
  }

  private findBestAgent(capability: string): Agent {
    const candidates = [...this.agents.values()]
      .filter(a => a.capabilities.includes(capability))
      .sort((a, b) => b.score - a.score);
    return candidates[0];
  }
}
`,
};

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      tabs: [
        { name: 'orchestrator.ts', path: '/orchestrator.ts', icon: 'TS', color: '#3178c6', modified: false, language: 'typescript' },
      ],
      activeTab: 'orchestrator.ts',
      fileContents: INITIAL_FILE_CONTENTS,
      cursorPosition: { line: 1, column: 1 },
      editorRef: null,
      monacoRef: null,
      fontSize: 13,
      tabSize: 2,
      fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
      breakpoints: [],
      recentFiles: [],

      setEditorRef: (editor) => set({ editorRef: editor }),
      setMonacoRef: (monaco) => set({ monacoRef: monaco }),

      openTab: (tab) =>
        set((s) => {
          const exists = s.tabs.find((t) => t.name === tab.name);
          if (exists) return { activeTab: tab.name };
          const info = getFileInfo(tab.name);
          const fullTab: FileTab = {
            ...tab,
            icon: tab.icon || info.icon,
            color: tab.color || info.color,
            language: tab.language || info.language,
          };
          return { tabs: [...s.tabs, fullTab], activeTab: tab.name };
        }),

      closeTab: (name) =>
        set((s) => {
          const newTabs = s.tabs.filter((t) => t.name !== name);
          const newActive =
            s.activeTab === name
              ? newTabs.length > 0
                ? newTabs[newTabs.length - 1].name
                : ''
              : s.activeTab;
          return { tabs: newTabs, activeTab: newActive };
        }),

      setActiveTab: (name) => set({ activeTab: name }),

      updateFileContent: (name, content) =>
        set((s) => ({
          fileContents: { ...s.fileContents, [name]: content },
          tabs: s.tabs.map((t) => (t.name === name ? { ...t, modified: true } : t)),
        })),

      markTabModified: (name, modified) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.name === name ? { ...t, modified } : t)),
        })),

      saveTab: (name) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.name === name ? { ...t, modified: false } : t)),
        })),

      saveAllTabs: () =>
        set((s) => ({
          tabs: s.tabs.map((t) => ({ ...t, modified: false })),
        })),

      closeAllTabs: () => set({ tabs: [], activeTab: '' }),

      setCursorPosition: (pos) => set({ cursorPosition: pos }),
      setFontSize: (size) => set({ fontSize: size }),
      setTabSize: (size) => set({ tabSize: size }),

      addBreakpoint: (bp) =>
        set((s) => ({
          breakpoints: [
            ...s.breakpoints,
            { ...bp, id: `bp-${Date.now()}-${Math.random().toString(36).slice(2)}` },
          ],
        })),

      removeBreakpoint: (id) =>
        set((s) => ({ breakpoints: s.breakpoints.filter((b) => b.id !== id) })),

      toggleBreakpoint: (file, line) =>
        set((s) => {
          const existing = s.breakpoints.find((b) => b.file === file && b.line === line);
          if (existing) {
            return { breakpoints: s.breakpoints.filter((b) => b.id !== existing.id) };
          }
          return {
            breakpoints: [
              ...s.breakpoints,
              { id: `bp-${Date.now()}`, file, line, enabled: true },
            ],
          };
        }),

      enableAllBreakpoints: () =>
        set((s) => ({ breakpoints: s.breakpoints.map((b) => ({ ...b, enabled: true })) })),

      disableAllBreakpoints: () =>
        set((s) => ({ breakpoints: s.breakpoints.map((b) => ({ ...b, enabled: false })) })),

      removeAllBreakpoints: () => set({ breakpoints: [] }),

      addRecentFile: (path) =>
        set((s) => ({
          recentFiles: [path, ...s.recentFiles.filter((f) => f !== path)].slice(0, 20),
        })),

      loadFileContents: (contents) =>
        set((s) => ({
          fileContents: { ...s.fileContents, ...contents },
        })),
    }),
    {
      name: 'titan-editor',
      partialize: (s) => ({
        tabs: s.tabs,
        activeTab: s.activeTab,
        fileContents: s.fileContents,
        fontSize: s.fontSize,
        tabSize: s.tabSize,
        fontFamily: s.fontFamily,
        breakpoints: s.breakpoints,
        recentFiles: s.recentFiles,
      }),
    }
  )
);
