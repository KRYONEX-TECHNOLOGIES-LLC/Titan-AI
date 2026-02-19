/**
 * POST /api/git/pull
 * Pull changes from remote using the GitHub OAuth token for auth.
 * Body: { path, remote?, branch? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildAuthenticatedCloneUrl } from '@/lib/github-client';
import simpleGit from 'simple-git';
import path from 'path';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const token = (session.user as { githubToken?: string }).githubToken;
  if (!token) {
    return NextResponse.json({ error: 'No GitHub token in session' }, { status: 401 });
  }

  const body = await req.json() as {
    path: string;
    remote?: string;
    branch?: string;
  };

  const { path: workspacePath, remote = 'origin' } = body;

  if (!workspacePath) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  try {
    const git = simpleGit(path.resolve(workspacePath));

    const status = await git.status();
    const branch = body.branch ?? status.current ?? 'main';

    // Temporarily inject auth token into remote URL
    let originalUrl: string | null = null;
    try {
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === remote);
      if (origin?.refs?.fetch) {
        originalUrl = origin.refs.fetch;
        const authUrl = buildAuthenticatedCloneUrl(originalUrl, token);
        await git.remote(['set-url', remote, authUrl]);
      }
    } catch { /* no remote */ }

    try {
      const result = await git.pull(remote, branch);
      return NextResponse.json({
        success: true,
        summary: result.summary,
        files: result.files,
        remote,
        branch,
      });
    } finally {
      if (originalUrl) {
        try { await git.remote(['set-url', remote, originalUrl]); } catch { /* ignore */ }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Pull failed';
    const isConflict = msg.includes('CONFLICT') || msg.includes('merge conflict');
    return NextResponse.json(
      { error: msg, code: isConflict ? 'merge_conflict' : 'pull_failed' },
      { status: isConflict ? 409 : 500 }
    );
  }
}
