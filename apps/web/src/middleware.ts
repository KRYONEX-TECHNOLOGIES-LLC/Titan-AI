/**
 * Titan AI - Route Protection Middleware (Edge Runtime)
 * 
 * Desktop (Electron): No auth gate -- users go straight to the IDE.
 *   GitHub sign-in is optional, available from the Accounts panel.
 * Web (Railway): Auth required -- redirect to sign-in page.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';
  const isDesktop = host.startsWith('localhost') || host.startsWith('127.0.0.1');

  if (isDesktop) {
    return NextResponse.next();
  }

  // Web deployment: use NextAuth session check
  const session = await auth();
  const isAuthRoute = req.nextUrl.pathname.startsWith('/auth') || req.nextUrl.pathname.startsWith('/api/auth');

  if (!session && !isAuthRoute && !req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.redirect(new URL('/auth/signin', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico|.*\\.webp).*)'],
};
