/**
 * Titan AI Shadow - Workspace Manager
 * Manages shadow workspace lifecycle
 */

import { mkdir, rm, cp, readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import type {
  ShadowConfig,
  WorkspaceState,
  SyncResult,
  FileChange,
} from './types.js';
import { FileSync } from './file-sync.js';
import { TerminalExecutor } from './terminal-executor.js';

export class WorkspaceManager {
  private config: ShadowConfig;
  private state: WorkspaceState;
  private fileSync: FileSync;
  private executor: TerminalExecutor;

  constructor(config: ShadowConfig) {
    this.config = {
      timeout: 60000,
      ...config,
    };

    this.state = {
      id: config.id,
      status: 'idle',
      lastSync: 0,
      lastExecution: 0,
      pendingChanges: [],
      errors: [],
    };

    this.fileSync = new FileSync({
      sourcePath: config.workspacePath,
      targetPath: config.shadowPath,
      includePatterns: config.syncPatterns,
      excludePatterns: config.excludePatterns,
    });

    this.executor = new TerminalExecutor({
      cwd: config.shadowPath,
      timeout: config.timeout,
    });
  }

  /**
   * Initialize the shadow workspace
   */
  async initialize(): Promise<void> {
    this.state.status = 'syncing';

    try {
      // Create shadow directory
      await mkdir(this.config.shadowPath, { recursive: true });

      // Initial sync
      await this.sync();

      this.state.status = 'idle';
    } catch (error) {
      this.state.status = 'error';
      throw error;
    }
  }

  /**
   * Sync files from main workspace to shadow
   */
  async sync(): Promise<SyncResult> {
    this.state.status = 'syncing';
    const startTime = Date.now();

    try {
      const result = await this.fileSync.sync();
      this.state.lastSync = Date.now();
      this.state.status = 'idle';

      return {
        ...result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      this.state.status = 'error';
      throw error;
    }
  }

  /**
   * Apply changes from shadow back to main workspace
   */
  async applyChanges(changes: FileChange[]): Promise<void> {
    for (const change of changes) {
      const sourcePath = join(this.config.shadowPath, change.path);
      const targetPath = join(this.config.workspacePath, change.path);

      switch (change.action) {
        case 'create':
        case 'modify':
          await cp(sourcePath, targetPath, { recursive: true });
          break;
        case 'delete':
          await rm(targetPath, { recursive: true, force: true });
          break;
      }
    }
  }

  /**
   * Execute a command in the shadow workspace
   */
  async execute(command: string, args?: string[]) {
    this.state.status = 'executing';
    this.state.lastExecution = Date.now();

    try {
      const result = await this.executor.execute({ command, args });
      this.state.status = 'idle';
      return result;
    } catch (error) {
      this.state.status = 'error';
      throw error;
    }
  }

  /**
   * Get current workspace state
   */
  getState(): WorkspaceState {
    return { ...this.state };
  }

  /**
   * Get list of changed files in shadow
   */
  async getChangedFiles(): Promise<FileChange[]> {
    return this.fileSync.detectChanges();
  }

  /**
   * Reset shadow workspace to match main
   */
  async reset(): Promise<void> {
    await rm(this.config.shadowPath, { recursive: true, force: true });
    await this.initialize();
  }

  /**
   * Cleanup and destroy shadow workspace
   */
  async destroy(): Promise<void> {
    await rm(this.config.shadowPath, { recursive: true, force: true });
    this.state.status = 'idle';
  }

  /**
   * Get workspace path
   */
  getPath(): string {
    return this.config.shadowPath;
  }

  /**
   * Get main workspace path
   */
  getMainPath(): string {
    return this.config.workspacePath;
  }
}

/**
 * Create a shadow workspace
 */
export function createShadowWorkspace(config: Omit<ShadowConfig, 'id'>): WorkspaceManager {
  return new WorkspaceManager({
    ...config,
    id: `shadow-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  });
}
