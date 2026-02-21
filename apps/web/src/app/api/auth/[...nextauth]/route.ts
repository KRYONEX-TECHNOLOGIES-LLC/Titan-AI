/**
 * Legacy NextAuth route -- redirects to Supabase Auth.
 * Kept for backwards compatibility with any stale bookmarks or links.
 */

import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.redirect(new URL('/auth/signin', url.origin));
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  return NextResponse.redirect(new URL('/auth/signin', url.origin));
}
