// Workspace Brancher
// packages/shadow/branching/src/workspace-brancher.ts

import { EventEmitter } from 'events';
import simpleGit, { SimpleGit } from 'simple-git';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  BranchConfig,
  WorkspaceBranch,
  BranchStatus,
  BranchChange,
  MergeResult,
} from './types';
import { MergeStrategyExecutor } from './merge-strategy';

export class WorkspaceBrancher extends EventEmitter {
  private config: BranchConfig;
  private git: SimpleGit;
  private branches: Map<string, WorkspaceBranch> = new Map();
  private mergeExecutor: MergeStrategyExecutor;

  constructor(config: BranchConfig) {
    super();
    this.config = config;
    this.git = simpleGit(config.basePath);
    this.mergeExecutor = new MergeStrategyExecutor(config.mergeStrategy);
  }

  async createBranch(
    name: string,
    agentId?: string,
    baseBranch?: string
  ): Promise<WorkspaceBranch> {
    // Check branch limit
    const activeBranches = Array.from(this.branches.values())
      .filter(b => b.status === 'active');
    
    if (activeBranches.length >= this.config.maxBranches) {
      if (this.config.autoPrune) {
        await this.pruneOldBranches();
      } else {
        throw new Error(`Max branches (${this.config.maxBranches}) reached`);
      }
    }

    const branchId = this.generateId();
    const branchName = `${this.config.branchPrefix}${name}-${branchId}`;
    const base = baseBranch || await this.getCurrentBranch();

    // Create git branch
    await this.git.checkoutBranch(branchName, base);

    const branch: WorkspaceBranch = {
      id: branchId,
      name: branchName,
      baseBranch: base,
      path: this.config.basePath,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      status: 'active',
      agentId,
    };

    this.branches.set(branchId, branch);
    this.emit('branch:created', { branch });

    return branch;
  }

  async createWorktree(
    name: string,
    agentId?: string,
    baseBranch?: string
  ): Promise<WorkspaceBranch> {
    const branchId = this.generateId();
    const branchName = `${this.config.branchPrefix}${name}-${branchId}`;
    const worktreePath = path.join(
      path.dirname(this.config.basePath),
      '.titan-worktrees',
      branchId
    );

    const base = baseBranch || await this.getCurrentBranch();

    // Create worktree with new branch
    await fs.mkdir(path.dirname(worktreePath), { recursive: true });
    await this.git.raw(['worktree', 'add', '-b', branchName, worktreePath, base]);

    const branch: WorkspaceBranch = {
      id: branchId,
      name: branchName,
      baseBranch: base,
      path: worktreePath,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      status: 'active',
      agentId,
    };

    this.branches.set(branchId, branch);
    this.emit('branch:created', { branch, isWorktree: true });

    return branch;
  }

  async switchBranch(branchId: string): Promise<void> {
    const branch = this.branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch not found: ${branchId}`);
    }

    await this.git.checkout(branch.name);
    branch.lastActivity = Date.now();
    this.emit('branch:switched', { branchId });
  }

  async getBranchChanges(branchId: string): Promise<BranchChange[]> {
    const branch = this.branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch not found: ${branchId}`);
    }

    const git = simpleGit(branch.path);
    const diff = await git.diff([`${branch.baseBranch}...${branch.name}`, '--stat']);
    
    const changes: BranchChange[] = [];
    const lines = diff.split('\n').filter(l => l.trim());

    for (const line of lines) {
      const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s*([+-]*)/);
      if (match) {
        const [, file, , changeSigns] = match;
        const additions = (changeSigns.match(/\+/g) || []).length;
        const deletions = (changeSigns.match(/-/g) || []).length;

        changes.push({
          file: file.trim(),
          type: 'modified',
          additions,
          deletions,
        });
      }
    }

    return changes;
  }

  async mergeBranch(
    branchId: string,
    targetBranch?: string
  ): Promise<MergeResult> {
    const branch = this.branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch not found: ${branchId}`);
    }

    const target = targetBranch || branch.baseBranch;
    branch.status = 'merging';
    this.emit('branch:merging', { branchId, target });

    const startTime = Date.now();

    try {
      // Switch to target branch
      await this.git.checkout(target);

      // Attempt merge
      const result = await this.mergeExecutor.merge(
        this.git,
        branch.name,
        target
      );

      if (result.success) {
        branch.status = 'merged';
        this.emit('branch:merged', { branchId, result });
      } else {
        branch.status = 'conflicted';
        this.emit('branch:conflicted', { branchId, conflicts: result.conflictedFiles });
      }

      return {
        ...result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      branch.status = 'conflicted';
      this.emit('branch:error', { branchId, error });
      throw error;
    }
  }

  async deleteBranch(branchId: string, force: boolean = false): Promise<void> {
    const branch = this.branches.get(branchId);
    if (!branch) return;

    // If it's a worktree, remove it first
    if (branch.path !== this.config.basePath) {
      try {
        await this.git.raw(['worktree', 'remove', branch.path, '--force']);
      } catch {
        // Worktree might already be removed
      }
    }

    // Delete the branch
    const deleteFlag = force ? '-D' : '-d';
    await this.git.branch([deleteFlag, branch.name]);

    this.branches.delete(branchId);
    this.emit('branch:deleted', { branchId });
  }

  private async pruneOldBranches(): Promise<void> {
    const branches = Array.from(this.branches.values())
      .filter(b => b.status === 'merged' || b.status === 'abandoned')
      .sort((a, b) => a.lastActivity - b.lastActivity);

    const toDelete = branches.slice(0, Math.ceil(branches.length / 2));

    for (const branch of toDelete) {
      await this.deleteBranch(branch.id, true);
    }
  }

  private async getCurrentBranch(): Promise<string> {
    const status = await this.git.status();
    return status.current || 'main';
  }

  getBranch(branchId: string): WorkspaceBranch | undefined {
    return this.branches.get(branchId);
  }

  getAllBranches(): WorkspaceBranch[] {
    return Array.from(this.branches.values());
  }

  getBranchesByAgent(agentId: string): WorkspaceBranch[] {
    return Array.from(this.branches.values())
      .filter(b => b.agentId === agentId);
  }

  getBranchesByStatus(status: BranchStatus): WorkspaceBranch[] {
    return Array.from(this.branches.values())
      .filter(b => b.status === status);
  }

  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }
}
