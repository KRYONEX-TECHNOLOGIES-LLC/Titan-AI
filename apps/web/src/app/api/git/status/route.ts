/**
 * GET /api/git/status?path=/workspace/path
 * Returns full git status: branch, ahead/behind, staged/modified/untracked files
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import simpleGit from 'simple-git';
import path from 'path';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const workspacePath = searchParams.get('path');

  if (!workspacePath) {
    return NextResponse.json({ error: 'path query param is required' }, { status: 400 });
  }

  try {
    const git = simpleGit(path.resolve(workspacePath));
    const isRepo = await git.checkIsRepo();

    if (!isRepo) {
      return NextResponse.json({
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
      });
    }

    const status = await git.status();

    // Get remote tracking info
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to get git status';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
