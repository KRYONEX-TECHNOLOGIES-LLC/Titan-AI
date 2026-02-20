import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';
  const isDesktop = host.startsWith('localhost') || host.startsWith('127.0.0.1');

  if (isDesktop) {
    return NextResponse.next();
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
  ];

  if (blockedApiPrefixes.some((prefix) => req.nextUrl.pathname.startsWith(prefix))) {
    return new NextResponse('Desktop-only endpoint', { status: 403 });
  }

  // Web deployment is landing/download only.
  // Block web access to the product runtime routes.
  if (req.nextUrl.pathname.startsWith('/editor')) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico|.*\\.webp).*)'],
};
