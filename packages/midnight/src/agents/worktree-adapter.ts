/**
 * Project Midnight - Worktree Adapter
 * Bridges the WorktreeManager interface to @titan/shadow WorkspaceBrancher
 */

import type { WorktreeManager } from './agent-loop.js';

/**
 * WorkspaceBrancher interface from @titan/shadow
 */
export interface WorkspaceBranch {
  id: string;
  name: string;
  baseBranch: string;
  path: string;
  createdAt: number;
  lastActivity: number;
  status: 'active' | 'merging' | 'merged' | 'conflicted' | 'abandoned';
  agentId?: string;
}

export interface BranchConfig {
  basePath: string;
  branchPrefix: string;
  maxBranches: number;
  autoPrune: boolean;
  mergeStrategy: 'merge' | 'rebase' | 'squash';
}

export interface MergeResult {
  success: boolean;
  commitHash?: string;
  conflictedFiles?: string[];
  duration: number;
}

/**
 * Interface for the WorkspaceBrancher from @titan/shadow
 */
export interface IWorkspaceBrancher {
  createWorktree(name: string, agentId?: string, baseBranch?: string): Promise<WorkspaceBranch>;
  mergeBranch(branchId: string, targetBranch?: string): Promise<MergeResult>;
  deleteBranch(branchId: string, force?: boolean): Promise<void>;
  getBranch(branchId: string): WorkspaceBranch | undefined;
  getAllBranches(): WorkspaceBranch[];
}

/**
 * Worktree Adapter for Project Midnight
 * Implements WorktreeManager using @titan/shadow WorkspaceBrancher
 */
export class WorktreeAdapter implements WorktreeManager {
  private brancher: IWorkspaceBrancher | null = null;
  private basePath: string;
  private branches: Map<string, { branchId: string; path: string; initialHash: string }> = new Map();

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Initialize the WorkspaceBrancher (lazy initialization)
   */
  async initialize(): Promise<void> {
    if (this.brancher) return;

    try {
      // Dynamic import of @titan/shadow
      const shadow = await import('@titan/shadow/branching');
      
      const config: BranchConfig = {
        basePath: this.basePath,
        branchPrefix: 'midnight/',
        maxBranches: 10,
        autoPrune: true,
        mergeStrategy: 'merge',
      };

      this.brancher = new shadow.WorkspaceBrancher(config) as IWorkspaceBrancher;
    } catch (error) {
      console.warn('WorkspaceBrancher not available, using fallback mode:', error);
      // Fallback mode - work directly in the project directory
      this.brancher = null;
    }
  }

  /**
   * Create an isolated worktree for an agent session
   */
  async create(projectPath: string, branchName: string): Promise<string> {
    await this.initialize();

    if (!this.brancher) {
      // Fallback: use the project path directly
      return projectPath || this.basePath;
    }

    try {
      const branch = await this.brancher.createWorktree(branchName, 'midnight-actor');
      
      // Get initial git hash for potential revert
      const initialHash = await this.getCurrentHash(branch.path);
      
      this.branches.set(branch.path, {
        branchId: branch.id,
        path: branch.path,
        initialHash,
      });

      return branch.path;
    } catch (error) {
      console.warn('Failed to create worktree, using fallback:', error);
      return projectPath || this.basePath;
    }
  }

  /**
   * Get git diff for a worktree
   */
  async getGitDiff(worktreePath: string): Promise<string> {
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(worktreePath);

    try {
      // Get both staged and unstaged diff
      const staged = await git.diff(['--staged']);
      const unstaged = await git.diff();
      
      return `${staged}\n${unstaged}`.trim() || '(no changes)';
    } catch (error) {
      return `Error getting diff: ${error}`;
    }
  }

  /**
   * Revert worktree to a specific hash
   */
  async revert(worktreePath: string, toHash: string): Promise<void> {
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(worktreePath);

    try {
      // Hard reset to the specified hash
      await git.reset(['--hard', toHash]);
      // Clean untracked files
      await git.clean('fd');
    } catch (error) {
      console.error('Failed to revert worktree:', error);
      throw error;
    }
  }

  /**
   * Merge worktree branch into target branch
   */
  async merge(worktreePath: string, targetBranch: string): Promise<void> {
    const branchInfo = this.branches.get(worktreePath);

    if (branchInfo && this.brancher) {
      try {
        const result = await this.brancher.mergeBranch(branchInfo.branchId, targetBranch);
        
        if (!result.success) {
          throw new Error(`Merge failed: ${result.conflictedFiles?.join(', ')}`);
        }
      } catch (error) {
        console.error('Failed to merge via WorkspaceBrancher:', error);
        // Fall back to manual merge
        await this.manualMerge(worktreePath, targetBranch);
      }
    } else {
      // Manual merge for fallback mode
      await this.manualMerge(worktreePath, targetBranch);
    }
  }

  /**
   * Manual merge fallback
   */
  private async manualMerge(worktreePath: string, targetBranch: string): Promise<void> {
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(worktreePath);

    const status = await git.status();
    const currentBranch = status.current;

    if (!currentBranch) {
      throw new Error('Cannot determine current branch');
    }

    // Switch to target and merge
    await git.checkout(targetBranch);
    await git.merge([currentBranch]);
  }

  /**
   * Delete a worktree
   */
  async delete(worktreePath: string): Promise<void> {
    const branchInfo = this.branches.get(worktreePath);

    if (branchInfo && this.brancher) {
      try {
        await this.brancher.deleteBranch(branchInfo.branchId, true);
        this.branches.delete(worktreePath);
      } catch (error) {
        console.error('Failed to delete worktree:', error);
        // Try manual deletion
        await this.manualDeleteWorktree(worktreePath);
      }
    } else {
      // Manual worktree deletion
      await this.manualDeleteWorktree(worktreePath);
    }
  }

  /**
   * Manual worktree deletion fallback
   */
  private async manualDeleteWorktree(worktreePath: string): Promise<void> {
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(this.basePath);

    try {
      await git.raw(['worktree', 'remove', worktreePath, '--force']);
    } catch (error) {
      console.warn('Manual worktree deletion failed:', error);
    }

    this.branches.delete(worktreePath);
  }

  /**
   * Get current git hash
   */
  private async getCurrentHash(worktreePath: string): Promise<string> {
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(worktreePath);

    try {
      const log = await git.log({ maxCount: 1 });
      return log.latest?.hash || 'HEAD';
    } catch {
      return 'HEAD';
    }
  }

  /**
   * Get all active worktrees for this adapter
   */
  getActiveWorktrees(): string[] {
    return Array.from(this.branches.keys());
  }

  /**
   * Cleanup all worktrees
   */
  async cleanup(): Promise<void> {
    for (const worktreePath of this.branches.keys()) {
      try {
        await this.delete(worktreePath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Create a WorktreeManager implementation
 */
export function createWorktreeManager(basePath: string): WorktreeManager {
  return new WorktreeAdapter(basePath);
}
