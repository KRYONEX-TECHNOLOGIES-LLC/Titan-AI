/**
 * Server-side API route auth helper.
 * Validates Supabase session for API routes that execute operations.
 */

import { getCurrentUser, type TitanUser } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function requireAuth(): Promise<{ authorized: true; userId: string; user: TitanUser } | NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return { authorized: true, userId: user.id, user };
  } catch {
    return NextResponse.json({ error: 'Auth check failed' }, { status: 401 });
  }
}
