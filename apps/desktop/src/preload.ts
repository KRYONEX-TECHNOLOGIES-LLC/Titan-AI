import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  isElectron: true as const,

  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,
    getPlatform: () => ipcRenderer.invoke('app:getPlatform') as Promise<string>,
  },

  tools: {
    readFile: (filePath: string, opts?: { lineOffset?: number; lineLimit?: number }) =>
      ipcRenderer.invoke('tools:readFile', filePath, opts) as Promise<{ content: string; lineCount: number }>,
    editFile: (filePath: string, oldStr: string, newStr: string) =>
      ipcRenderer.invoke('tools:editFile', filePath, oldStr, newStr) as Promise<{
        success: boolean;
        newContent: string;
        pathResolved?: string;
        beforeHash?: string;
        afterHash?: string;
        changed?: boolean;
        bytesWritten?: number;
      }>,
    createFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('tools:createFile', filePath, content) as Promise<{ success: boolean }>,
    deleteFile: (filePath: string) =>
      ipcRenderer.invoke('tools:deleteFile', filePath) as Promise<{ success: boolean }>,
    listDir: (dirPath: string) =>
      ipcRenderer.invoke('tools:listDir', dirPath) as Promise<{ entries: Array<{ name: string; type: string; size: number }> }>,
    grep: (pattern: string, dirPath: string, opts?: { include?: string; maxResults?: number }) =>
      ipcRenderer.invoke('tools:grep', pattern, dirPath, opts) as Promise<{ matches: Array<{ file: string; line: number; content: string }> }>,
    glob: (pattern: string, dirPath: string, opts?: { ignore?: string[] }) =>
      ipcRenderer.invoke('tools:glob', pattern, dirPath, opts) as Promise<{ files: string[] }>,
    runCommand: (command: string, cwd?: string) =>
      ipcRenderer.invoke('tools:runCommand', command, cwd) as Promise<{ stdout: string; stderr: string; exitCode: number }>,
    readLints: (filePath: string) =>
      ipcRenderer.invoke('tools:readLints', filePath) as Promise<{ diagnostics: Array<{ file: string; line: number; column: number; severity: string; message: string; source: string }> }>,
    semanticSearch: (query: string, dirPath: string) =>
      ipcRenderer.invoke('tools:semanticSearch', query, dirPath) as Promise<{ results: Array<{ file: string; line: number; content: string; score: number }> }>,
    onCommandOutput: (cb: (data: { command: string; stdout: string; stderr: string; exitCode: number }) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, data: { command: string; stdout: string; stderr: string; exitCode: number }) => cb(data);
      ipcRenderer.on('tools:commandOutput', listener);
      return () => { ipcRenderer.removeListener('tools:commandOutput', listener); };
    },
  },

  terminal: {
    create: (id: string, shell?: string, cwd?: string) =>
      ipcRenderer.invoke('terminal:create', id, shell, cwd) as Promise<{ success: boolean }>,
    write: (id: string, data: string) =>
      ipcRenderer.invoke('terminal:write', id, data) as Promise<void>,
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', id, cols, rows) as Promise<void>,
    kill: (id: string) =>
      ipcRenderer.invoke('terminal:kill', id) as Promise<void>,
    onData: (id: string, cb: (data: string) => void) => {
      const channel = `terminal:data:${id}`;
      const listener = (_event: Electron.IpcRendererEvent, data: string) => cb(data);
      ipcRenderer.on(channel, listener);
      return () => { ipcRenderer.removeListener(channel, listener); };
    },
    onExit: (id: string, cb: (exitCode: number) => void) => {
      const channel = `terminal:exit:${id}`;
      const listener = (_event: Electron.IpcRendererEvent, exitCode: number) => cb(exitCode);
      ipcRenderer.on(channel, listener);
      return () => { ipcRenderer.removeListener(channel, listener); };
    },
  },

  fs: {
    readDir: (dirPath: string, opts?: { recursive?: boolean }) =>
      ipcRenderer.invoke('fs:readDir', dirPath, opts) as Promise<Array<{
        name: string; path: string; type: 'file' | 'directory';
        size?: number; children?: unknown[];
      }>>,
    readFile: (filePath: string) =>
      ipcRenderer.invoke('fs:readFile', filePath) as Promise<string>,
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('fs:writeFile', filePath, content) as Promise<void>,
    deleteFile: (filePath: string) =>
      ipcRenderer.invoke('fs:deleteFile', filePath) as Promise<void>,
    stat: (filePath: string) =>
      ipcRenderer.invoke('fs:stat', filePath) as Promise<{ size: number; isFile: boolean; isDirectory: boolean; mtime: string }>,
    watchFolder: (dirPath: string, cb: (event: string, filePath: string) => void) => {
      const channel = 'fs:watchEvent';
      const listener = (_e: Electron.IpcRendererEvent, ev: string, fp: string) => cb(ev, fp);
      ipcRenderer.invoke('fs:watchFolder', dirPath);
      ipcRenderer.on(channel, listener);
      return () => {
        ipcRenderer.invoke('fs:unwatchFolder', dirPath);
        ipcRenderer.removeListener(channel, listener);
      };
    },
    exists: (filePath: string) =>
      ipcRenderer.invoke('fs:exists', filePath) as Promise<boolean>,
    mkdir: (dirPath: string) =>
      ipcRenderer.invoke('fs:mkdir', dirPath) as Promise<void>,
  },

  git: {
    status: (repoPath: string) =>
      ipcRenderer.invoke('git:status', repoPath) as Promise<{
        current: string | null; tracking: string | null;
        files: Array<{ path: string; index: string; working_dir: string }>;
        ahead: number; behind: number;
      }>,
    diff: (repoPath: string, opts?: { staged?: boolean }) =>
      ipcRenderer.invoke('git:diff', repoPath, opts) as Promise<string>,
    commit: (repoPath: string, message: string, files?: string[]) =>
      ipcRenderer.invoke('git:commit', repoPath, message, files) as Promise<{ hash: string }>,
    push: (repoPath: string, remote?: string, branch?: string) =>
      ipcRenderer.invoke('git:push', repoPath, remote, branch) as Promise<void>,
    pull: (repoPath: string, remote?: string, branch?: string) =>
      ipcRenderer.invoke('git:pull', repoPath, remote, branch) as Promise<void>,
    branches: (repoPath: string) =>
      ipcRenderer.invoke('git:branches', repoPath) as Promise<{
        current: string; all: string[]; branches: Record<string, unknown>;
      }>,
    log: (repoPath: string, maxCount?: number) =>
      ipcRenderer.invoke('git:log', repoPath, maxCount) as Promise<Array<{
        hash: string; message: string; author: string; date: string;
      }>>,
    checkout: (repoPath: string, branch: string) =>
      ipcRenderer.invoke('git:checkout', repoPath, branch) as Promise<void>,
    checkpoint: (repoPath: string, label?: string) =>
      ipcRenderer.invoke('git:checkpoint', repoPath, label) as Promise<{ success: boolean; tag?: string; error?: string }>,
    restoreCheckpoint: (repoPath: string, tag: string) =>
      ipcRenderer.invoke('git:restore-checkpoint', repoPath, tag) as Promise<{ success: boolean; error?: string }>,
    stash: (repoPath: string, message?: string) =>
      ipcRenderer.invoke('git:stash', repoPath, message) as Promise<{ success: boolean; error?: string }>,
    stashPop: (repoPath: string) =>
      ipcRenderer.invoke('git:stash-pop', repoPath) as Promise<{ success: boolean; error?: string }>,
    listCheckpoints: (repoPath: string) =>
      ipcRenderer.invoke('git:list-checkpoints', repoPath) as Promise<string[]>,
  },

  linter: {
    getDiagnostics: (filePath: string) =>
      ipcRenderer.invoke('linter:getDiagnostics', filePath) as Promise<Array<{
        file: string; line: number; column: number;
        severity: string; message: string; source: string;
      }>>,
    onDiagnosticsChange: (cb: (diagnostics: unknown[]) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, diag: unknown[]) => cb(diag);
      ipcRenderer.on('linter:diagnosticsChanged', listener);
      return () => { ipcRenderer.removeListener('linter:diagnosticsChanged', listener); };
    },
  },

  search: {
    glob: (pattern: string, cwd: string, opts?: { ignore?: string[] }) =>
      ipcRenderer.invoke('search:glob', pattern, cwd, opts) as Promise<string[]>,
    semantic: (query: string, cwd: string) =>
      ipcRenderer.invoke('search:semantic', query, cwd) as Promise<Array<{
        file: string; line: number; content: string; score: number;
      }>>,
  },

  web: {
    fetch: (url: string) =>
      ipcRenderer.invoke('web:fetch', url) as Promise<{ content: string; title: string }>,
    search: (query: string) =>
      ipcRenderer.invoke('web:search', query) as Promise<Array<{
        title: string; url: string; snippet: string;
      }>>,
  },

  auth: {
    signInWithGithub: () =>
      ipcRenderer.invoke('auth:signInWithGithub') as Promise<{ token: string; user: unknown }>,
    getSession: () =>
      ipcRenderer.invoke('auth:getSession') as Promise<{ token: string; user: unknown } | null>,
    signOut: () =>
      ipcRenderer.invoke('auth:signOut') as Promise<void>,
  },

  dialog: {
    openFolder: () =>
      ipcRenderer.invoke('dialog:openFolder') as Promise<string | null>,
    openFile: (filters?: Array<{ name: string; extensions: string[] }>) =>
      ipcRenderer.invoke('dialog:openFile', filters) as Promise<string | null>,
    saveFile: (defaultPath?: string, filters?: Array<{ name: string; extensions: string[] }>) =>
      ipcRenderer.invoke('dialog:saveFile', defaultPath, filters) as Promise<string | null>,
  },

  shell: {
    openExternal: (url: string) =>
      ipcRenderer.invoke('shell:openExternal', url) as Promise<void>,
    showItemInFolder: (path: string) =>
      ipcRenderer.invoke('shell:showItemInFolder', path) as Promise<void>,
  },

  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
  },

  recentFolders: {
    get: () => ipcRenderer.invoke('recent-folders:get') as Promise<string[]>,
    add: (folderPath: string) => ipcRenderer.invoke('recent-folders:add', folderPath) as Promise<string[]>,
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
