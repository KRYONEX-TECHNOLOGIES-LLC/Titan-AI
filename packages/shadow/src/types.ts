/**
 * Titan AI Shadow - Type Definitions
 */

// Isolation levels
export type IsolationLevel = 'none' | 'process' | 'container' | 'microvm';

// Shadow workspace configuration
export interface ShadowConfig {
  id: string;
  isolationLevel: IsolationLevel;
  workspacePath: string;
  shadowPath: string;
  syncPatterns: string[];
  excludePatterns: string[];
  timeout: number;
  memoryLimit?: string;
  cpuLimit?: number;
}

// Execution request
export interface ExecutionRequest {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  captureOutput?: boolean;
}

// Execution result
export interface ExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  killed?: boolean;
  errors: ExecutionError[];
}

// Execution error
export interface ExecutionError {
  type: 'build' | 'test' | 'lint' | 'runtime' | 'timeout' | 'oom';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

// Self-healing action
export interface HealingAction {
  type: 'fix' | 'retry' | 'rollback' | 'skip';
  description: string;
  changes?: FileChange[];
  command?: string;
}

// File change
export interface FileChange {
  path: string;
  action: 'create' | 'modify' | 'delete';
  content?: string;
  diff?: string;
}

// Workspace state
export interface WorkspaceState {
  id: string;
  status: 'idle' | 'syncing' | 'executing' | 'healing' | 'error';
  lastSync: number;
  lastExecution: number;
  pendingChanges: FileChange[];
  errors: ExecutionError[];
}

// Terminal session
export interface TerminalSession {
  id: string;
  workspaceId: string;
  pid: number;
  status: 'running' | 'exited';
  exitCode?: number;
}

// Sync result
export interface SyncResult {
  added: string[];
  modified: string[];
  deleted: string[];
  errors: string[];
  duration: number;
}

// Container info
export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: 'created' | 'running' | 'paused' | 'stopped';
  ports: Record<number, number>;
  volumes: Record<string, string>;
}

// Healing loop configuration
export interface HealingConfig {
  maxIterations: number;
  autoFix: boolean;
  patterns: HealingPattern[];
}

// Healing pattern
export interface HealingPattern {
  errorPattern: RegExp;
  errorType: ExecutionError['type'];
  action: HealingAction['type'];
  fix?: (error: ExecutionError) => HealingAction;
}
