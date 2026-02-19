/**
 * GET  /api/git/branches?path=...  — List all branches
 * POST /api/git/branches           — Create a new branch
 * DELETE /api/git/branches         — Delete a branch
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import simpleGit from 'simple-git';
import path from 'path';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const workspacePath = searchParams.get('path');
  if (!workspacePath) return NextResponse.json({ error: 'path is required' }, { status: 400 });

  try {
    const git = simpleGit(path.resolve(workspacePath));
    const branches = await git.branch(['-a', '-v']);

    const localBranches = Object.entries(branches.branches)
      .filter(([name]) => !name.startsWith('remotes/'))
      .map(([name, data]) => ({
        name,
        current: branches.current === name,
        sha: data.commit,
        label: data.label,
        remote: false,
      }));

    const remoteBranches = Object.entries(branches.branches)
      .filter(([name]) => name.startsWith('remotes/'))
      .map(([name, data]) => ({
        name: name.replace('remotes/', ''),
        current: false,
        sha: data.commit,
        label: data.label,
        remote: true,
      }));

    return NextResponse.json({
      current: branches.current,
      local: localBranches,
      remote: remoteBranches,
      all: [...localBranches, ...remoteBranches],
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json() as {
    path: string;
    name: string;
    from?: string;
    checkout?: boolean;
  };

  const { path: workspacePath, name: branchName, from, checkout = true } = body;
  if (!workspacePath || !branchName) {
    return NextResponse.json({ error: 'path and name are required' }, { status: 400 });
  }

  try {
    const git = simpleGit(path.resolve(workspacePath));

    if (checkout) {
      if (from) {
        await git.checkoutBranch(branchName, from);
      } else {
        await git.checkoutLocalBranch(branchName);
      }
    } else {
      await git.branch([branchName, ...(from ? [from] : [])]);
    }

    return NextResponse.json({ success: true, branch: branchName, checkedOut: checkout });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json() as {
    path: string;
    name: string;
    force?: boolean;
  };

  const { path: workspacePath, name: branchName, force = false } = body;
  if (!workspacePath || !branchName) {
    return NextResponse.json({ error: 'path and name are required' }, { status: 400 });
  }

  try {
    const git = simpleGit(path.resolve(workspacePath));
    await git.branch([force ? '-D' : '-d', branchName]);
    return NextResponse.json({ success: true, deleted: branchName });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

// PATCH — checkout existing branch
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json() as { path: string; name: string };
  const { path: workspacePath, name: branchName } = body;
  if (!workspacePath || !branchName) {
    return NextResponse.json({ error: 'path and name are required' }, { status: 400 });
  }

  try {
    const git = simpleGit(path.resolve(workspacePath));
    await git.checkout(branchName);
    return NextResponse.json({ success: true, branch: branchName });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Checkout failed' }, { status: 500 });
  }
}
