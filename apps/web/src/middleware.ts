/**
 * Titan AI - Route Protection Middleware (Edge Runtime)
 * Uses the Edge-compatible auth config - does NOT import Node.js modules.
 */
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico|.*\\.webp).*)'],
};
