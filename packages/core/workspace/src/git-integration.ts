/**
 * Git integration using simple-git
 */

import simpleGit, { SimpleGit, StatusResult, LogResult, DiffResult } from 'simple-git';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { GitStatus, GitCommit } from './types';

export class GitIntegration extends EventEmitter {
  private git: SimpleGit | null = null;
  private rootPath: string = '';
  private isInitialized: boolean = false;

  async initialize(rootPath: string): Promise<boolean> {
    this.rootPath = path.resolve(rootPath);
    this.git = simpleGit(this.rootPath);

    try {
      const isRepo = await this.git.checkIsRepo();
      this.isInitialized = isRepo;
      
      if (isRepo) {
        this.emit('initialized', { rootPath: this.rootPath });
      }
      
      return isRepo;
    } catch {
      this.isInitialized = false;
      return false;
    }
  }

  async getStatus(): Promise<GitStatus> {
    this.ensureInitialized();

    const status: StatusResult = await this.git!.status();

    return {
      branch: status.current ?? 'HEAD',
      ahead: status.ahead,
      behind: status.behind,
      staged: status.staged,
      modified: status.modified,
      untracked: status.not_added,
      conflicted: status.conflicted,
      isClean: status.isClean(),
    };
  }

  async getLog(maxCount: number = 50): Promise<GitCommit[]> {
    this.ensureInitialized();

    const log: LogResult = await this.git!.log({
      maxCount,
      '--stat': null,
    });

    return log.all.map(entry => ({
      hash: entry.hash,
      shortHash: entry.hash.substring(0, 7),
      message: entry.message,
      author: entry.author_name,
      authorEmail: entry.author_email,
      date: new Date(entry.date),
      files: [], // Would need additional parsing from --stat
    }));
  }

  async getCurrentBranch(): Promise<string> {
    this.ensureInitialized();
    const status = await this.git!.status();
    return status.current ?? 'HEAD';
  }

  async getBranches(): Promise<{ current: string; all: string[]; local: string[]; remote: string[] }> {
    this.ensureInitialized();
    const branches = await this.git!.branch();
    
    return {
      current: branches.current,
      all: branches.all,
      local: Object.keys(branches.branches).filter(b => !b.startsWith('remotes/')),
      remote: Object.keys(branches.branches).filter(b => b.startsWith('remotes/')),
    };
  }

  async checkout(branchOrCommit: string): Promise<void> {
    this.ensureInitialized();
    await this.git!.checkout(branchOrCommit);
    this.emit('checkout', { ref: branchOrCommit });
  }

  async createBranch(branchName: string, startPoint?: string): Promise<void> {
    this.ensureInitialized();
    
    if (startPoint) {
      await this.git!.checkoutBranch(branchName, startPoint);
    } else {
      await this.git!.checkoutLocalBranch(branchName);
    }
    
    this.emit('branch:created', { branchName });
  }

  async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
    this.ensureInitialized();
    
    if (force) {
      await this.git!.branch(['-D', branchName]);
    } else {
      await this.git!.branch(['-d', branchName]);
    }
    
    this.emit('branch:deleted', { branchName });
  }

  async stage(files: string | string[]): Promise<void> {
    this.ensureInitialized();
    await this.git!.add(files);
    this.emit('staged', { files });
  }

  async unstage(files: string | string[]): Promise<void> {
    this.ensureInitialized();
    const fileArray = Array.isArray(files) ? files : [files];
    await this.git!.reset(['HEAD', ...fileArray]);
    this.emit('unstaged', { files });
  }

  async commit(message: string, options?: { amend?: boolean }): Promise<string> {
    this.ensureInitialized();
    
    const commitOptions: string[] = [];
    if (options?.amend) {
      commitOptions.push('--amend');
    }
    
    const result = await this.git!.commit(message, undefined, commitOptions.length > 0 ? Object.fromEntries(commitOptions.map(o => [o, null])) : undefined);
    
    this.emit('commit', { hash: result.commit, message });
    return result.commit;
  }

  async push(remote: string = 'origin', branch?: string, options?: { force?: boolean; setUpstream?: boolean }): Promise<void> {
    this.ensureInitialized();
    
    const pushOptions: string[] = [];
    if (options?.force) {
      pushOptions.push('--force');
    }
    if (options?.setUpstream) {
      pushOptions.push('-u');
    }
    
    const currentBranch = branch ?? await this.getCurrentBranch();
    await this.git!.push(remote, currentBranch, pushOptions);
    
    this.emit('pushed', { remote, branch: currentBranch });
  }

  async pull(remote: string = 'origin', branch?: string): Promise<void> {
    this.ensureInitialized();
    const currentBranch = branch ?? await this.getCurrentBranch();
    await this.git!.pull(remote, currentBranch);
    this.emit('pulled', { remote, branch: currentBranch });
  }

  async fetch(remote: string = 'origin', prune: boolean = true): Promise<void> {
    this.ensureInitialized();
    
    if (prune) {
      await this.git!.fetch(remote, undefined, ['--prune']);
    } else {
      await this.git!.fetch(remote);
    }
    
    this.emit('fetched', { remote });
  }

  async diff(options?: { staged?: boolean; file?: string }): Promise<string> {
    this.ensureInitialized();
    
    const args: string[] = [];
    if (options?.staged) {
      args.push('--cached');
    }
    if (options?.file) {
      args.push('--', options.file);
    }
    
    return this.git!.diff(args);
  }

  async diffSummary(options?: { staged?: boolean }): Promise<DiffResult> {
    this.ensureInitialized();
    
    if (options?.staged) {
      return this.git!.diffSummary(['--cached']);
    }
    return this.git!.diffSummary();
  }

  async stash(message?: string): Promise<void> {
    this.ensureInitialized();
    
    if (message) {
      await this.git!.stash(['push', '-m', message]);
    } else {
      await this.git!.stash();
    }
    
    this.emit('stashed', { message });
  }

  async stashPop(): Promise<void> {
    this.ensureInitialized();
    await this.git!.stash(['pop']);
    this.emit('stash:popped');
  }

  async stashList(): Promise<{ index: number; message: string }[]> {
    this.ensureInitialized();
    const result = await this.git!.stashList();
    
    return result.all.map((entry, index) => ({
      index,
      message: entry.message,
    }));
  }

  async reset(mode: 'soft' | 'mixed' | 'hard', ref: string = 'HEAD'): Promise<void> {
    this.ensureInitialized();
    await this.git!.reset([`--${mode}`, ref]);
    this.emit('reset', { mode, ref });
  }

  async revert(commitHash: string): Promise<void> {
    this.ensureInitialized();
    await this.git!.revert(commitHash);
    this.emit('reverted', { commitHash });
  }

  async merge(branch: string): Promise<void> {
    this.ensureInitialized();
    await this.git!.merge([branch]);
    this.emit('merged', { branch });
  }

  async rebase(branch: string): Promise<void> {
    this.ensureInitialized();
    await this.git!.rebase([branch]);
    this.emit('rebased', { branch });
  }

  async getRemotes(): Promise<{ name: string; url: string }[]> {
    this.ensureInitialized();
    const remotes = await this.git!.getRemotes(true);
    
    return remotes.map(r => ({
      name: r.name,
      url: r.refs.fetch || r.refs.push || '',
    }));
  }

  async addRemote(name: string, url: string): Promise<void> {
    this.ensureInitialized();
    await this.git!.addRemote(name, url);
    this.emit('remote:added', { name, url });
  }

  async removeRemote(name: string): Promise<void> {
    this.ensureInitialized();
    await this.git!.removeRemote(name);
    this.emit('remote:removed', { name });
  }

  async getFileHistory(filePath: string, maxCount: number = 50): Promise<GitCommit[]> {
    this.ensureInitialized();
    
    const log = await this.git!.log({
      file: filePath,
      maxCount,
    });
    
    return log.all.map(entry => ({
      hash: entry.hash,
      shortHash: entry.hash.substring(0, 7),
      message: entry.message,
      author: entry.author_name,
      authorEmail: entry.author_email,
      date: new Date(entry.date),
      files: [filePath],
    }));
  }

  async blame(filePath: string): Promise<{ line: number; commit: string; author: string; date: Date; content: string }[]> {
    this.ensureInitialized();
    
    // simple-git doesn't have built-in blame, using raw command
    const result = await this.git!.raw(['blame', '--line-porcelain', filePath]);
    
    // Parse blame output (simplified)
    const lines: { line: number; commit: string; author: string; date: Date; content: string }[] = [];
    const chunks = result.split(/^([a-f0-9]{40})/gm);
    
    let lineNumber = 0;
    for (let i = 1; i < chunks.length; i += 2) {
      const commit = chunks[i];
      const data = chunks[i + 1] || '';
      
      const authorMatch = data.match(/^author (.+)$/m);
      const timeMatch = data.match(/^author-time (\d+)$/m);
      const contentMatch = data.match(/^\t(.*)$/m);
      
      lineNumber++;
      lines.push({
        line: lineNumber,
        commit,
        author: authorMatch?.[1] ?? 'Unknown',
        date: timeMatch ? new Date(parseInt(timeMatch[1]) * 1000) : new Date(),
        content: contentMatch?.[1] ?? '',
      });
    }
    
    return lines;
  }

  isGitRepository(): boolean {
    return this.isInitialized;
  }

  getRootPath(): string {
    return this.rootPath;
  }

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.git) {
      throw new Error('Git integration not initialized or not a git repository');
    }
  }
}

/**
 * Creates a git integration instance
 */
export async function createGitIntegration(rootPath: string): Promise<GitIntegration> {
  const git = new GitIntegration();
  await git.initialize(rootPath);
  return git;
}
