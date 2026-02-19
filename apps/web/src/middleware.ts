/**
 * Titan AI - Route Protection Middleware
 * Protects the IDE and API routes, allows public access to auth pages.
 * Uses NextAuth v5's built-in auth middleware.
 */
import { auth } from '@/lib/auth';
import type { Session } from 'next-auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that are always public (no auth required)
const PUBLIC_PATHS = [
  '/auth/signin',
  '/auth/error',
  '/api/auth',
  '/_next',
  '/favicon',
  '/manifest',
  '/apple-touch',
  '/not-found',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p));
}

export default auth((req: NextRequest & { auth: Session | null }) => {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  if (!req.auth) {
    const signInUrl = new URL('/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', req.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico|.*\\.webp).*)'],
};
