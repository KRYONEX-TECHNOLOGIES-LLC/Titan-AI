// Merge Strategy Executor
// packages/shadow/branching/src/merge-strategy.ts

import { SimpleGit } from 'simple-git';
import {
  MergeStrategy,
  MergeResult,
  ConflictedFile,
  BranchChange,
} from './types';

export class MergeStrategyExecutor {
  private strategy: MergeStrategy;

  constructor(strategy: MergeStrategy = 'auto') {
    this.strategy = strategy;
  }

  async merge(
    git: SimpleGit,
    sourceBranch: string,
    targetBranch: string
  ): Promise<MergeResult> {
    const changes = await this.getChanges(git, sourceBranch, targetBranch);

    try {
      switch (this.strategy) {
        case 'auto':
          return await this.autoMerge(git, sourceBranch, changes);
        case 'theirs':
          return await this.theirsMerge(git, sourceBranch, changes);
        case 'ours':
          return await this.oursMerge(git, sourceBranch, changes);
        case 'union':
          return await this.unionMerge(git, sourceBranch, changes);
        case 'manual':
          return await this.manualMerge(git, sourceBranch, changes);
        default:
          return await this.autoMerge(git, sourceBranch, changes);
      }
    } catch (error) {
      // Merge failed, gather conflict info
      const conflicts = await this.getConflicts(git);
      return {
        success: false,
        strategy: this.strategy,
        mergedFiles: [],
        conflictedFiles: conflicts,
        changes,
        duration: 0,
      };
    }
  }

  private async autoMerge(
    git: SimpleGit,
    sourceBranch: string,
    changes: BranchChange[]
  ): Promise<MergeResult> {
    await git.merge([sourceBranch, '--no-ff', '-m', `Merge ${sourceBranch}`]);

    return {
      success: true,
      strategy: 'auto',
      mergedFiles: changes.map(c => c.file),
      conflictedFiles: [],
      changes,
      duration: 0,
    };
  }

  private async theirsMerge(
    git: SimpleGit,
    sourceBranch: string,
    changes: BranchChange[]
  ): Promise<MergeResult> {
    await git.merge([sourceBranch, '-X', 'theirs', '--no-ff', '-m', `Merge ${sourceBranch} (theirs)`]);

    return {
      success: true,
      strategy: 'theirs',
      mergedFiles: changes.map(c => c.file),
      conflictedFiles: [],
      changes,
      duration: 0,
    };
  }

  private async oursMerge(
    git: SimpleGit,
    sourceBranch: string,
    changes: BranchChange[]
  ): Promise<MergeResult> {
    await git.merge([sourceBranch, '-X', 'ours', '--no-ff', '-m', `Merge ${sourceBranch} (ours)`]);

    return {
      success: true,
      strategy: 'ours',
      mergedFiles: changes.map(c => c.file),
      conflictedFiles: [],
      changes,
      duration: 0,
    };
  }

  private async unionMerge(
    git: SimpleGit,
    sourceBranch: string,
    changes: BranchChange[]
  ): Promise<MergeResult> {
    // Union merge keeps both versions for conflicting lines
    await git.raw(['merge', sourceBranch, '-X', 'union', '--no-ff', '-m', `Merge ${sourceBranch} (union)`]);

    return {
      success: true,
      strategy: 'union',
      mergedFiles: changes.map(c => c.file),
      conflictedFiles: [],
      changes,
      duration: 0,
    };
  }

  private async manualMerge(
    git: SimpleGit,
    sourceBranch: string,
    changes: BranchChange[]
  ): Promise<MergeResult> {
    // Start merge but don't commit
    try {
      await git.merge([sourceBranch, '--no-commit', '--no-ff']);
    } catch {
      // Expected if there are conflicts
    }

    const conflicts = await this.getConflicts(git);

    return {
      success: conflicts.length === 0,
      strategy: 'manual',
      mergedFiles: changes.filter(c => 
        !conflicts.some(conf => conf.path === c.file)
      ).map(c => c.file),
      conflictedFiles: conflicts,
      changes,
      duration: 0,
    };
  }

  private async getChanges(
    git: SimpleGit,
    sourceBranch: string,
    targetBranch: string
  ): Promise<BranchChange[]> {
    const diff = await git.diff([`${targetBranch}...${sourceBranch}`, '--numstat']);
    const changes: BranchChange[] = [];

    for (const line of diff.split('\n')) {
      const match = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
      if (match) {
        const [, add, del, file] = match;
        changes.push({
          file,
          type: 'modified',
          additions: add === '-' ? 0 : parseInt(add, 10),
          deletions: del === '-' ? 0 : parseInt(del, 10),
        });
      }
    }

    return changes;
  }

  private async getConflicts(git: SimpleGit): Promise<ConflictedFile[]> {
    const status = await git.status();
    const conflicts: ConflictedFile[] = [];

    for (const file of status.conflicted) {
      conflicts.push({
        path: file,
        conflictType: 'content',
        ourVersion: '',
        theirVersion: '',
      });
    }

    return conflicts;
  }

  setStrategy(strategy: MergeStrategy): void {
    this.strategy = strategy;
  }

  getStrategy(): MergeStrategy {
    return this.strategy;
  }
}
