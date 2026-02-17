// Shadow Branching Types
// packages/shadow/branching/src/types.ts

export interface BranchConfig {
  basePath: string;
  branchPrefix: string;
  maxBranches: number;
  autoPrune: boolean;
  mergeStrategy: MergeStrategy;
}

export type MergeStrategy = 'auto' | 'manual' | 'theirs' | 'ours' | 'union';

export interface WorkspaceBranch {
  id: string;
  name: string;
  baseBranch: string;
  path: string;
  createdAt: number;
  lastActivity: number;
  status: BranchStatus;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export type BranchStatus = 'active' | 'merging' | 'merged' | 'conflicted' | 'abandoned';

export interface BranchChange {
  file: string;
  type: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string;
  additions: number;
  deletions: number;
}

export interface MergeResult {
  success: boolean;
  strategy: MergeStrategy;
  mergedFiles: string[];
  conflictedFiles: ConflictedFile[];
  changes: BranchChange[];
  duration: number;
}

export interface ConflictedFile {
  path: string;
  conflictType: ConflictType;
  ourVersion: string;
  theirVersion: string;
  baseVersion?: string;
  markers?: ConflictMarker[];
}

export type ConflictType = 'content' | 'add-add' | 'modify-delete' | 'rename-rename';

export interface ConflictMarker {
  startLine: number;
  endLine: number;
  section: 'ours' | 'theirs' | 'base';
}

export interface ConflictResolution {
  file: string;
  strategy: 'ours' | 'theirs' | 'merge' | 'manual';
  resolvedContent?: string;
}
