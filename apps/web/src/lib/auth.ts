/**
 * Titan AI - NextAuth v5 Configuration (Server-side)
 * GitHub OAuth with JWT sessions + SQLite persistence
 * This file is for SERVER-SIDE use only (not Edge Runtime).
 */

import NextAuth, { type DefaultSession } from 'next-auth';
import { authConfig } from './auth.config';
import { upsertUser } from '@/lib/db/client';

// ── Type augmentation so TypeScript knows about our extra session fields ──
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      githubToken: string;
      avatarUrl: string;
    } & DefaultSession['user'];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Called when a user signs in.
     * Upserts the user in our database (server-side only).
     */
    async signIn({ user, account, profile }) {
      if (account?.provider !== 'github') return false;
      if (!profile || !account?.access_token) return false;

      try {
        const githubProfile = profile as unknown as {
          id: number;
          login: string;
          name?: string;
          email?: string;
          avatar_url?: string;
          html_url?: string;
        };

        upsertUser({
          githubId: githubProfile.id,
          username: githubProfile.login,
          name: githubProfile.name ?? null,
          email: githubProfile.email ?? user.email ?? null,
          avatarUrl: githubProfile.avatar_url ?? null,
          profileUrl: githubProfile.html_url ?? null,
        });

        return true;
      } catch (err) {
        console.error('[Auth] signIn callback error:', err);
        return false;
      }
    },
  },
});

/**
 * Server-side helper: get the current session's GitHub token.
 * Use this in API routes to make authenticated GitHub API calls.
 */
export async function getGithubToken(): Promise<string | null> {
  const session = await auth();
  return (session?.user?.githubToken as string) ?? null;
}

/**
 * Server-side helper: get full user from the current session.
 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user) return null;
  return session.user;
}
