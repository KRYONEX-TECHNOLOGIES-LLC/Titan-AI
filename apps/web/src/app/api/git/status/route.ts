/**
 * GET /api/git/status?path=/workspace/path
 * Returns full git status: branch, ahead/behind, staged/modified/untracked files.
 * Gracefully returns empty status for non-existent paths or non-git directories.
 */
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const workspacePath = searchParams.get('path');

  if (!workspacePath) {
    // No path provided -- try process.cwd() as default
    try {
      const simpleGit = (await import('simple-git')).default;
      const git = simpleGit(process.cwd());
      const isRepo = await git.checkIsRepo();
      if (!isRepo) return NextResponse.json(EMPTY_STATUS);

      const status = await git.status();
      let remoteUrl: string | null = null;
      try {
        const remotes = await git.getRemotes(true);
        const origin = remotes.find(r => r.name === 'origin');
        remoteUrl = origin?.refs?.fetch ?? null;
      } catch { /* no remote */ }

      return NextResponse.json({
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
      });
    } catch {
      return NextResponse.json(EMPTY_STATUS);
    }
  }

  // Validate path exists on the filesystem before trying git operations
  try {
    const fs = await import('fs');
    const resolvedPath = path.resolve(workspacePath);

    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json(EMPTY_STATUS);
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return NextResponse.json(EMPTY_STATUS);
    }

    const simpleGit = (await import('simple-git')).default;
    const git = simpleGit(resolvedPath);
    const isRepo = await git.checkIsRepo();

    if (!isRepo) {
      return NextResponse.json(EMPTY_STATUS);
    }

    const status = await git.status();

    let remoteUrl: string | null = null;
    try {
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');
      remoteUrl = origin?.refs?.fetch ?? null;
    } catch { /* no remote */ }

    return NextResponse.json({
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
    });
  } catch {
    return NextResponse.json(EMPTY_STATUS);
  }
}
