import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';
  const isDesktop = host.startsWith('localhost') || host.startsWith('127.0.0.1');

  if (isDesktop) {
    // Desktop: refresh Supabase session but allow all routes
    const response = await updateSession(req);
    return response;
  }

  const blockedApiPrefixes = [
    '/api/chat',
    '/api/agent',
    '/api/terminal',
    '/api/workspace',
    '/api/git',
    '/api/sessions',
    '/api/midnight',
    '/api/indexing',
    '/api/mcp',
    '/api/titan',
    '/api/lanes',
    '/api/creator-mode',
  ];

  if (blockedApiPrefixes.some((prefix) => req.nextUrl.pathname.startsWith(prefix))) {
    return new NextResponse('Desktop-only endpoint', { status: 403 });
  }

  if (req.nextUrl.pathname.startsWith('/editor')) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Web: refresh Supabase session for auth pages
  const response = await updateSession(req);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico|.*\\.webp).*)'],
};
