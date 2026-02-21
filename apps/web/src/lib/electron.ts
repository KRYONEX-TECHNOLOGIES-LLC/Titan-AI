export interface ElectronAPI {
  isElectron: true;
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<string>;
  };
  tools: {
    readFile: (filePath: string, opts?: { lineOffset?: number; lineLimit?: number }) => Promise<{ content: string; lineCount: number }>;
    editFile: (filePath: string, oldStr: string, newStr: string) => Promise<{ success: boolean; newContent: string }>;
    createFile: (filePath: string, content: string) => Promise<{ success: boolean }>;
    deleteFile: (filePath: string) => Promise<{ success: boolean }>;
    listDir: (dirPath: string) => Promise<{ entries: Array<{ name: string; type: string; size: number }> }>;
    grep: (pattern: string, dirPath: string, opts?: { include?: string; maxResults?: number }) => Promise<{ matches: Array<{ file: string; line: number; content: string }> }>;
    glob: (pattern: string, dirPath: string, opts?: { ignore?: string[] }) => Promise<{ files: string[] }>;
    runCommand: (command: string, cwd?: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
    readLints: (filePath: string) => Promise<{ diagnostics: Array<{ file: string; line: number; column: number; severity: string; message: string; source: string }> }>;
    semanticSearch: (query: string, dirPath: string) => Promise<{ results: Array<{ file: string; line: number; content: string; score: number }> }>;
  };
  terminal: {
    create: (id: string, shell?: string, cwd?: string) => Promise<{ success: boolean }>;
    write: (id: string, data: string) => Promise<void>;
    resize: (id: string, cols: number, rows: number) => Promise<void>;
    kill: (id: string) => Promise<void>;
    onData: (id: string, cb: (data: string) => void) => () => void;
    onExit: (id: string, cb: (exitCode: number) => void) => () => void;
  };
  fs: {
    readDir: (dirPath: string, opts?: { recursive?: boolean }) => Promise<Array<{ name: string; path: string; type: 'file' | 'directory'; size?: number; children?: unknown[] }>>;
    readFile: (filePath: string) => Promise<string>;
    writeFile: (filePath: string, content: string) => Promise<void>;
    deleteFile: (filePath: string) => Promise<void>;
    stat: (filePath: string) => Promise<{ size: number; isFile: boolean; isDirectory: boolean; mtime: string }>;
    watchFolder: (dirPath: string, cb: (event: string, filePath: string) => void) => () => void;
    exists: (filePath: string) => Promise<boolean>;
    mkdir: (dirPath: string) => Promise<void>;
  };
  git: {
    status: (repoPath: string) => Promise<{ current: string | null; tracking: string | null; files: Array<{ path: string; index: string; working_dir: string }>; ahead: number; behind: number }>;
    diff: (repoPath: string, opts?: { staged?: boolean }) => Promise<string>;
    commit: (repoPath: string, message: string, files?: string[]) => Promise<{ hash: string }>;
    push: (repoPath: string, remote?: string, branch?: string) => Promise<void>;
    pull: (repoPath: string, remote?: string, branch?: string) => Promise<void>;
    branches: (repoPath: string) => Promise<{ current: string; all: string[]; branches: Record<string, unknown> }>;
    log: (repoPath: string, maxCount?: number) => Promise<Array<{ hash: string; message: string; author: string; date: string }>>;
    checkout: (repoPath: string, branch: string) => Promise<void>;
  };
  linter: {
    getDiagnostics: (filePath: string) => Promise<Array<{ file: string; line: number; column: number; severity: string; message: string; source: string }>>;
    onDiagnosticsChange: (cb: (diagnostics: unknown[]) => void) => () => void;
  };
  search: {
    glob: (pattern: string, cwd: string, opts?: { ignore?: string[] }) => Promise<string[]>;
    semantic: (query: string, cwd: string) => Promise<Array<{ file: string; line: number; content: string; score: number }>>;
  };
  web: {
    fetch: (url: string) => Promise<{ content: string; title: string }>;
    search: (query: string) => Promise<Array<{ title: string; url: string; snippet: string }>>;
  };
  auth: {
    signInWithGithub: () => Promise<{ token: string; user: unknown }>;
    startDeviceFlow: () => Promise<{
      deviceCode: string; userCode: string; verificationUri: string;
      expiresIn: number; interval: number;
    }>;
    pollDeviceFlow: (deviceCode: string) => Promise<
      | { status: 'pending' }
      | { status: 'slow_down' }
      | { status: 'expired' }
      | { status: 'error'; error: string }
      | { status: 'success'; session: { token: string; user: unknown } }
    >;
    getSession: () => Promise<{ token: string; user: unknown } | null>;
    signOut: () => Promise<void>;
  };
  dialog: {
    openFolder: () => Promise<string | null>;
    openFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>;
    saveFile: (defaultPath?: string, filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>;
  };
  store: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
  };
  recentFolders: {
    get: () => Promise<string[]>;
    add: (folderPath: string) => Promise<string[]>;
  };
}

export const isElectron: boolean =
  typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).electronAPI;

export const electronAPI: ElectronAPI | null =
  isElectron ? (window as unknown as Record<string, unknown>).electronAPI as ElectronAPI : null;

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
