/**
 * GET /api/git/status?path=/workspace/path
 * Returns full git status: branch, ahead/behind, staged/modified/untracked files.
 * Gracefully returns empty status for non-existent paths or non-git directories.
 */
import { NextRequest, NextResponse } from 'next/server';

const EMPTY_STATUS = {
  isRepo: false,
  branch: null,
  ahead: 0,
  behind: 0,
  staged: [],
  modified: [],
  untracked: [],
  conflicted: [],
  deleted: [],
  renamed: [],
  isClean: true,
  remoteUrl: null,
};

async function getGitStatus(dirPath: string) {
  const fs = await import('fs');
  const path = await import('path');
  const resolvedPath = path.resolve(dirPath);

  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
    return EMPTY_STATUS;
  }

  const { simpleGit } = await import('simple-git');
  const git = simpleGit(resolvedPath);

  if (!(await git.checkIsRepo())) {
    return EMPTY_STATUS;
  }

  const status = await git.status();

  let remoteUrl: string | null = null;
  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    remoteUrl = origin?.refs?.fetch ?? null;
  } catch { /* no remote configured */ }

  return {
    isRepo: true,
    branch: status.current ?? 'HEAD',
    ahead: status.ahead,
    behind: status.behind,
    staged: status.staged,
    modified: status.modified,
    untracked: status.not_added,
    conflicted: status.conflicted,
    deleted: status.deleted,
    renamed: status.renamed.map(r => ({ from: r.from, to: r.to })),
    isClean: status.isClean(),
    remoteUrl,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspacePath = searchParams.get('path');
    const dirPath = workspacePath || process.cwd();
    const result = await getGitStatus(dirPath);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[git/status] Error:', err);
    return NextResponse.json(EMPTY_STATUS);
  }
}
