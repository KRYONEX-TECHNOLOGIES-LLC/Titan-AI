import { IpcMain } from 'electron';
import * as path from 'path';

async function getGit(repoPath: string) {
  const { simpleGit } = await import('simple-git');
  return simpleGit(path.resolve(repoPath));
}

export function registerGitHandlers(ipcMain: IpcMain): void {

  ipcMain.handle('git:status', async (_e, repoPath: string) => {
    const git = await getGit(repoPath);
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
  });

  ipcMain.handle('git:diff', async (_e, repoPath: string, opts?: { staged?: boolean }) => {
    const git = await getGit(repoPath);
    if (opts?.staged) {
      return await git.diff(['--cached']);
    }
    return await git.diff();
  });

  ipcMain.handle('git:commit', async (_e, repoPath: string, message: string, files?: string[]) => {
    const git = await getGit(repoPath);
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
    await git.push(remote || 'origin', branch);
  });

  ipcMain.handle('git:pull', async (_e, repoPath: string, remote?: string, branch?: string) => {
    const git = await getGit(repoPath);
    await git.pull(remote || 'origin', branch);
  });

  ipcMain.handle('git:branches', async (_e, repoPath: string) => {
    const git = await getGit(repoPath);
    const branches = await git.branch();
    return {
      current: branches.current,
      all: branches.all,
      branches: branches.branches,
    };
  });

  ipcMain.handle('git:log', async (_e, repoPath: string, maxCount?: number) => {
    const git = await getGit(repoPath);
    const log = await git.log({ maxCount: maxCount ?? 20 });
    return log.all.map((entry: { hash: string; message: string; author_name: string; date: string }) => ({
      hash: entry.hash,
      message: entry.message,
      author: entry.author_name,
      date: entry.date,
    }));
  });

  ipcMain.handle('git:checkout', async (_e, repoPath: string, branch: string) => {
    const git = await getGit(repoPath);
    await git.checkout(branch);
  });
}
