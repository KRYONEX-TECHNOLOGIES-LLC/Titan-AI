/**
 * Server-side API route auth helper.
 * Wraps NextAuth session check for API routes that execute dangerous operations.
 */

import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function requireAuth(): Promise<{ authorized: true; userId: string } | NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return { authorized: true, userId: session.user.id };
  } catch {
    return NextResponse.json({ error: 'Auth check failed' }, { status: 401 });
  }
}
