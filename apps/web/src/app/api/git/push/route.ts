/**
 * POST /api/git/push
 * Push commits to remote using the GitHub OAuth token for authentication.
 * Body: { path, remote?, branch?, force? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getGithubToken } from '@/lib/auth';
import { buildAuthenticatedCloneUrl } from '@/lib/github-client';
import { simpleGit } from 'simple-git';
import path from 'path';

export async function POST(req: NextRequest) {
  const headerToken = req.headers.get('X-GitHub-Token');
  const token = headerToken || await getGithubToken();
  if (!token) {
    return NextResponse.json({ error: 'No GitHub token. Connect GitHub first.' }, { status: 401 });
  }

  const body = await req.json() as {
    path: string;
    remote?: string;
    branch?: string;
    force?: boolean;
    setUpstream?: boolean;
  };

  const { path: workspacePath, remote = 'origin', force, setUpstream } = body;

  if (!workspacePath) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  try {
    const git = simpleGit(path.resolve(workspacePath));

    // Get current branch
    const status = await git.status();
    const branch = body.branch ?? status.current ?? 'main';

    // Get current remote URL and temporarily inject token
    let originalUrl: string | null = null;
    try {
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === remote);
      if (origin?.refs?.fetch) {
        originalUrl = origin.refs.fetch;
        const authUrl = buildAuthenticatedCloneUrl(originalUrl, token);
        await git.remote(['set-url', remote, authUrl]);
      }
    } catch { /* no remote configured */ }

    try {
      const pushOptions: string[] = [];
      if (force) pushOptions.push('--force');
      if (setUpstream) pushOptions.push('-u');

      await git.push(remote, branch, pushOptions);

      return NextResponse.json({ success: true, remote, branch });
    } finally {
      // Always restore the original URL (strip the token)
      if (originalUrl) {
        try {
          await git.remote(['set-url', remote, originalUrl]);
        } catch { /* ignore cleanup error */ }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Push failed';
    const isAuthError = msg.includes('Authentication failed') || msg.includes('403') || msg.includes('401');
    return NextResponse.json(
      { error: msg, code: isAuthError ? 'auth_failed' : 'push_failed' },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
