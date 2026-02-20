/**
 * POST /api/repos/clone — Clone a GitHub repository to the server workspace
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildAuthenticatedCloneUrl } from '@/lib/github-client';
import { upsertWorkspace } from '@/lib/db/client';
import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

const WORKSPACES_DIR = process.env.WORKSPACES_DIR ?? path.resolve(process.cwd(), '.titan', 'workspaces');

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const token = (session.user as { githubToken?: string }).githubToken;
  const userId = session.user.id;

  if (!token) {
    return NextResponse.json({ error: 'No GitHub token in session' }, { status: 401 });
  }

  const body = await req.json() as {
    cloneUrl: string;
    repoName: string;
    repoOwner: string;
    defaultBranch?: string;
    branch?: string;
  };

  const { cloneUrl, repoName, repoOwner, defaultBranch = 'main', branch } = body;

  if (!cloneUrl || !repoName) {
    return NextResponse.json({ error: 'cloneUrl and repoName are required' }, { status: 400 });
  }

  // Build workspace path
  fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
  const workspaceId = randomUUID();
  const destPath = path.join(WORKSPACES_DIR, `${repoOwner}-${repoName}-${workspaceId.slice(0, 8)}`);

  // Embed token for authentication
  const authenticatedUrl = buildAuthenticatedCloneUrl(cloneUrl, token);

  try {
    const git = simpleGit();
    const cloneOptions: string[] = ['--depth', '1'];
    if (branch) {
      cloneOptions.push('--branch', branch);
    }

    await git.clone(authenticatedUrl, destPath, cloneOptions);

    // Strip auth from remote so it's not stored in .git/config
    const repoGit = simpleGit(destPath);
    await repoGit.remote(['set-url', 'origin', cloneUrl]);

    // Persist workspace to DB
    const workspace = await upsertWorkspace({
      userId: userId ?? '',
      name: repoName,
      path: destPath,
      repoUrl: cloneUrl,
      repoOwner,
      repoName,
      defaultBranch,
    });

    return NextResponse.json({
      workspaceId: workspace.id,
      path: destPath,
      name: repoName,
      repoUrl: cloneUrl,
    });
  } catch (err) {
    // Clean up partial clone
    try { fs.rmSync(destPath, { recursive: true, force: true }); } catch { /* ignore */ }

    const msg = err instanceof Error ? err.message : 'Clone failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
