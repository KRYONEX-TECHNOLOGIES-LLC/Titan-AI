/**
 * NextAuth v5 Route Handler
 * Handles all /api/auth/* routes automatically:
 *   GET  /api/auth/session
 *   GET  /api/auth/signin
 *   GET  /api/auth/signout
 *   GET  /api/auth/callback/github
 *   GET  /api/auth/csrf
 *   GET  /api/auth/providers
 */
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
