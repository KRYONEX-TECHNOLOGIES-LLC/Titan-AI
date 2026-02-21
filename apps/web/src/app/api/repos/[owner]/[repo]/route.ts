/**
 * GET /api/repos/[owner]/[repo] — Get repo details and branches
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getGithubToken } from '@/lib/auth';
import { getRepo, listBranches } from '@/lib/github-client';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const token = await getGithubToken();
  if (!token) {
    return NextResponse.json({ error: 'No GitHub token' }, { status: 401 });
  }

  const { owner, repo } = await params;

  try {
    const [repoData, branches] = await Promise.all([
      getRepo(token, owner, repo),
      listBranches(token, owner, repo),
    ]);

    return NextResponse.json({ repo: repoData, branches });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch repository';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
