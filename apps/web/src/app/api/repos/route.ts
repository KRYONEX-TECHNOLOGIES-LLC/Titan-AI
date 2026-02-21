/**
 * GET /api/repos — List the authenticated user's GitHub repositories
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getGithubToken } from '@/lib/auth';
import { listUserRepos } from '@/lib/github-client';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const token = await getGithubToken();
  if (!token) {
    return NextResponse.json({ error: 'No GitHub token in session' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = (searchParams.get('type') as 'all' | 'owner' | 'member') ?? 'all';
  const sort = (searchParams.get('sort') as 'created' | 'updated' | 'pushed' | 'full_name') ?? 'updated';
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const search = searchParams.get('q')?.toLowerCase() ?? '';

  try {
    let repos = await listUserRepos(token, { type, sort, per_page: 100, page });

    // Client-side search filter
    if (search) {
      repos = repos.filter(r =>
        r.name.toLowerCase().includes(search) ||
        (r.description ?? '').toLowerCase().includes(search)
      );
    }

    return NextResponse.json({ repos });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch repositories';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
