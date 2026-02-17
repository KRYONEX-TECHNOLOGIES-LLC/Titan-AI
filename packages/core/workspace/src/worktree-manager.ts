/**
 * Git worktree manager for multi-agent parallel execution
 */

import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { Worktree } from './types';

export interface WorktreeCreateOptions {
  branch?: string;
  newBranch?: string;
  commit?: string;
  detach?: boolean;
}

export class WorktreeManager extends EventEmitter {
  private git: SimpleGit;
  private rootPath: string;
  private worktrees: Map<string, Worktree> = new Map();

  constructor(rootPath: string) {
    super();
    this.rootPath = path.resolve(rootPath);
    this.git = simpleGit(this.rootPath);
  }

  async initialize(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<Worktree[]> {
    const result = await this.git.raw(['worktree', 'list', '--porcelain']);
    this.worktrees.clear();

    const entries = result.split('\n\n').filter(Boolean);
    
    for (const entry of entries) {
      const lines = entry.split('\n');
      const worktreePath = lines.find(l => l.startsWith('worktree '))?.replace('worktree ', '');
      const commit = lines.find(l => l.startsWith('HEAD '))?.replace('HEAD ', '');
      const branch = lines.find(l => l.startsWith('branch '))?.replace('branch refs/heads/', '');
      const isPrunable = lines.some(l => l === 'prunable');

      if (worktreePath && commit) {
        const worktree: Worktree = {
          path: worktreePath,
          branch: branch ?? 'detached',
          commit,
          isMain: worktreePath === this.rootPath,
          isPrunable,
        };
        this.worktrees.set(worktreePath, worktree);
      }
    }

    this.emit('refreshed', { count: this.worktrees.size });
    return Array.from(this.worktrees.values());
  }

  async create(worktreePath: string, options: WorktreeCreateOptions = {}): Promise<Worktree> {
    const absolutePath = path.resolve(worktreePath);
    
    // Ensure parent directory exists
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });

    const args = ['worktree', 'add'];

    if (options.detach) {
      args.push('--detach');
    }

    if (options.newBranch) {
      args.push('-b', options.newBranch);
    }

    args.push(absolutePath);

    if (options.branch) {
      args.push(options.branch);
    } else if (options.commit) {
      args.push(options.commit);
    }

    await this.git.raw(args);
    await this.refresh();

    const worktree = this.worktrees.get(absolutePath);
    if (!worktree) {
      throw new Error(`Failed to create worktree at ${absolutePath}`);
    }

    this.emit('created', worktree);
    return worktree;
  }

  async remove(worktreePath: string, force: boolean = false): Promise<void> {
    const absolutePath = path.resolve(worktreePath);
    
    const args = ['worktree', 'remove'];
    if (force) {
      args.push('--force');
    }
    args.push(absolutePath);

    await this.git.raw(args);
    this.worktrees.delete(absolutePath);

    this.emit('removed', { path: absolutePath });
  }

  async prune(): Promise<number> {
    const prunableCount = Array.from(this.worktrees.values()).filter(w => w.isPrunable).length;
    await this.git.raw(['worktree', 'prune']);
    await this.refresh();
    
    this.emit('pruned', { count: prunableCount });
    return prunableCount;
  }

  async lock(worktreePath: string, reason?: string): Promise<void> {
    const absolutePath = path.resolve(worktreePath);
    const args = ['worktree', 'lock'];
    
    if (reason) {
      args.push('--reason', reason);
    }
    args.push(absolutePath);

    await this.git.raw(args);
    this.emit('locked', { path: absolutePath, reason });
  }

  async unlock(worktreePath: string): Promise<void> {
    const absolutePath = path.resolve(worktreePath);
    await this.git.raw(['worktree', 'unlock', absolutePath]);
    this.emit('unlocked', { path: absolutePath });
  }

  async move(worktreePath: string, newPath: string): Promise<void> {
    const absoluteOldPath = path.resolve(worktreePath);
    const absoluteNewPath = path.resolve(newPath);

    await this.git.raw(['worktree', 'move', absoluteOldPath, absoluteNewPath]);
    await this.refresh();

    this.emit('moved', { oldPath: absoluteOldPath, newPath: absoluteNewPath });
  }

  getWorktree(worktreePath: string): Worktree | undefined {
    return this.worktrees.get(path.resolve(worktreePath));
  }

  getAllWorktrees(): Worktree[] {
    return Array.from(this.worktrees.values());
  }

  getMainWorktree(): Worktree | undefined {
    return Array.from(this.worktrees.values()).find(w => w.isMain);
  }

  getNonMainWorktrees(): Worktree[] {
    return Array.from(this.worktrees.values()).filter(w => !w.isMain);
  }

  /**
   * Create a temporary worktree for agent execution
   */
  async createAgentWorktree(agentId: string, baseBranch?: string): Promise<Worktree> {
    const timestamp = Date.now();
    const worktreeName = `agent-${agentId}-${timestamp}`;
    const worktreePath = path.join(this.rootPath, '.titan', 'worktrees', worktreeName);
    const branchName = `titan-agent/${agentId}/${timestamp}`;

    return this.create(worktreePath, {
      newBranch: branchName,
      branch: baseBranch,
    });
  }

  /**
   * Clean up agent worktrees
   */
  async cleanupAgentWorktrees(agentId?: string): Promise<number> {
    const worktrees = this.getNonMainWorktrees();
    let cleanedCount = 0;

    for (const worktree of worktrees) {
      const isAgentWorktree = worktree.path.includes('.titan/worktrees/agent-');
      const matchesAgent = agentId ? worktree.path.includes(`agent-${agentId}`) : true;

      if (isAgentWorktree && matchesAgent) {
        try {
          await this.remove(worktree.path, true);
          cleanedCount++;
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    this.emit('agent:cleanup', { count: cleanedCount, agentId });
    return cleanedCount;
  }

  /**
   * Execute a function in a specific worktree context
   */
  async executeInWorktree<T>(
    worktreePath: string,
    fn: (git: SimpleGit, worktree: Worktree) => Promise<T>
  ): Promise<T> {
    const absolutePath = path.resolve(worktreePath);
    const worktree = this.worktrees.get(absolutePath);
    
    if (!worktree) {
      throw new Error(`Worktree not found: ${absolutePath}`);
    }

    const worktreeGit = simpleGit(absolutePath);
    return fn(worktreeGit, worktree);
  }
}

/**
 * Creates a worktree manager instance
 */
export async function createWorktreeManager(rootPath: string): Promise<WorktreeManager> {
  const manager = new WorktreeManager(rootPath);
  await manager.initialize();
  return manager;
}
