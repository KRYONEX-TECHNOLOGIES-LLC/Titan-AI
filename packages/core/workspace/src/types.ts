/**
 * Workspace types
 */

export interface WorkspaceConfig {
  rootPath: string;
  name: string;
  excludePatterns: string[];
  watchEnabled: boolean;
  gitEnabled: boolean;
}

export interface WorkspaceState {
  isOpen: boolean;
  rootPath: string;
  name: string;
  files: Map<string, FileState>;
  gitStatus?: GitStatus;
  lastSyncedAt?: Date;
}

export interface FileState {
  path: string;
  relativePath: string;
  content?: string;
  hash?: string;
  mtime: number;
  size: number;
  isDirectory: boolean;
  isSymlink: boolean;
}

export interface FileChange {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  relativePath: string;
  timestamp: Date;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
  conflicted: string[];
  isClean: boolean;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: Date;
  files: string[];
}

export interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
  isPrunable: boolean;
}

export interface SessionData {
  id: string;
  workspacePath: string;
  openFiles: string[];
  activeFile?: string;
  cursorPositions: Map<string, { line: number; column: number }>;
  scrollPositions: Map<string, number>;
  customState: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
