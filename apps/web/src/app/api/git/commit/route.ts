/**
 * POST /api/git/commit
 * Stage files and create a commit.
 * Body: { path, message, files?: string[] }
 * If files is omitted, stages all changes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { simpleGit } from 'simple-git';
import path from 'path';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();

  const body = await req.json() as {
    path: string;
    message: string;
    files?: string[];
    amend?: boolean;
    gitUser?: { name?: string; email?: string };
  };

  const { path: workspacePath, message, files, amend, gitUser } = body;

  if (!workspacePath || !message?.trim()) {
    return NextResponse.json({ error: 'path and message are required' }, { status: 400 });
  }

  try {
    const git = simpleGit(path.resolve(workspacePath));

    const username = user?.username ?? user?.name ?? gitUser?.name ?? 'Titan AI User';
    const email = user?.email ?? gitUser?.email ?? `${username}@titan.ai`;
    await git.addConfig('user.name', username, false, 'local');
    await git.addConfig('user.email', email, false, 'local');

    // Stage files
    if (files && files.length > 0) {
      await git.add(files);
    } else {
      await git.add('.');
    }

    // Commit
    const options: Record<string, null> = {};
    if (amend) options['--amend'] = null;

    const result = await git.commit(message, undefined, options);

    return NextResponse.json({
      hash: result.commit,
      summary: result.summary,
      message,
      author: username,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Commit failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
