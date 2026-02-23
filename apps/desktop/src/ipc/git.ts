import { IpcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

const EMPTY_STATUS = {
  current: null,
  tracking: null,
  files: [],
  ahead: 0,
  behind: 0,
};

async function getGit(repoPath: string) {
  const { simpleGit } = await import('simple-git');
  
  const resolved = path.isAbsolute(repoPath) ? repoPath : path.resolve(repoPath);
  
  if (!fs.existsSync(resolved)) {
    return null;
  }
  
  return simpleGit(resolved);
}

export function registerGitHandlers(ipcMain: IpcMain): void {

  ipcMain.handle('git:status', async (_e, repoPath: string) => {
    try {
      if (!repoPath) return EMPTY_STATUS;
      
      const git = await getGit(repoPath);
      if (!git) return EMPTY_STATUS;
      
      const status = await git.status();

      return {
        current: status.current,
        tracking: status.tracking || null,
        files: status.files.map((f: { path: string; index: string; working_dir: string }) => ({
          path: f.path,
          index: f.index,
          working_dir: f.working_dir,
        })),
        ahead: status.ahead,
        behind: status.behind,
      };
    } catch (err) {
      console.warn('[git:status] Error:', (err as Error).message);
      return EMPTY_STATUS;
    }
  });

  ipcMain.handle('git:diff', async (_e, repoPath: string, opts?: { staged?: boolean }) => {
    try {
      const git = await getGit(repoPath);
      if (!git) return '';
      
      if (opts?.staged) {
        return await git.diff(['--cached']);
      }
      return await git.diff();
    } catch (err) {
      console.warn('[git:diff] Error:', (err as Error).message);
      return '';
    }
  });

  ipcMain.handle('git:commit', async (_e, repoPath: string, message: string, files?: string[]) => {
    const git = await getGit(repoPath);
    if (!git) throw new Error('Repository not found');
    
    if (files && files.length > 0) {
      await git.add(files);
    } else {
      await git.add('.');
    }
    const result = await git.commit(message);
    return { hash: result.commit };
  });

  ipcMain.handle('git:push', async (_e, repoPath: string, remote?: string, branch?: string) => {
    const git = await getGit(repoPath);
    if (!git) throw new Error('Repository not found');
    await git.push(remote || 'origin', branch);
  });

  ipcMain.handle('git:pull', async (_e, repoPath: string, remote?: string, branch?: string) => {
    const git = await getGit(repoPath);
    if (!git) throw new Error('Repository not found');
    await git.pull(remote || 'origin', branch);
  });

  ipcMain.handle('git:branches', async (_e, repoPath: string) => {
    try {
      const git = await getGit(repoPath);
      if (!git) return { current: '', all: [], branches: {} };
      
      const branches = await git.branch();
      return {
        current: branches.current,
        all: branches.all,
        branches: branches.branches,
      };
    } catch (err) {
      console.warn('[git:branches] Error:', (err as Error).message);
      return { current: '', all: [], branches: {} };
    }
  });

  ipcMain.handle('git:log', async (_e, repoPath: string, maxCount?: number) => {
    try {
      const git = await getGit(repoPath);
      if (!git) return [];
      
      const log = await git.log({ maxCount: maxCount ?? 20 });
      return log.all.map((entry: { hash: string; message: string; author_name: string; date: string }) => ({
        hash: entry.hash,
        message: entry.message,
        author: entry.author_name,
        date: entry.date,
      }));
    } catch (err) {
      console.warn('[git:log] Error:', (err as Error).message);
      return [];
    }
  });

  ipcMain.handle('git:checkout', async (_e, repoPath: string, branch: string) => {
    const git = await getGit(repoPath);
    if (!git) throw new Error('Repository not found');
    await git.checkout(branch);
  });

  // Checkpoint: create a lightweight tag as a named restore point before risky changes
  ipcMain.handle('git:checkpoint', async (_e, repoPath: string, label?: string) => {
    try {
      const git = await getGit(repoPath);
      if (!git) throw new Error('Repository not found');
      const ts = Date.now();
      const tagName = `checkpoint/${label ? label.replace(/[^a-z0-9-]/gi, '-') : 'auto'}-${ts}`;
      await git.tag([tagName]);
      return { success: true, tag: tagName };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // Restore: hard-reset to a checkpoint tag
  ipcMain.handle('git:restore-checkpoint', async (_e, repoPath: string, tag: string) => {
    try {
      const git = await getGit(repoPath);
      if (!git) throw new Error('Repository not found');
      await git.reset(['--hard', tag]);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // Stash: save uncommitted work
  ipcMain.handle('git:stash', async (_e, repoPath: string, message?: string) => {
    try {
      const git = await getGit(repoPath);
      if (!git) throw new Error('Repository not found');
      const args = message ? ['push', '-m', message] : ['push'];
      await git.stash(args);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // Stash pop: restore last stashed work
  ipcMain.handle('git:stash-pop', async (_e, repoPath: string) => {
    try {
      const git = await getGit(repoPath);
      if (!git) throw new Error('Repository not found');
      await git.stash(['pop']);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // List checkpoints
  ipcMain.handle('git:list-checkpoints', async (_e, repoPath: string) => {
    try {
      const git = await getGit(repoPath);
      if (!git) return [];
      const tags = await git.tags();
      return tags.all.filter((t: string) => t.startsWith('checkpoint/'));
    } catch (err) {
      console.warn('[git:list-checkpoints] Error:', (err as Error).message);
      return [];
    }
  });
}
