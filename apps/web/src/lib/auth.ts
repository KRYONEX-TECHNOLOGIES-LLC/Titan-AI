/**
 * Titan AI - NextAuth v5 Configuration
 * GitHub OAuth with JWT sessions + SQLite persistence
 */

import NextAuth, { type DefaultSession } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { upsertUser, createSession, deleteSession, getSessionWithUser } from '@/lib/db/client';

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
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          // Request all needed scopes up front
          scope: 'read:user user:email repo workflow',
        },
      },
    }),
  ],

  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin',
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  callbacks: {
    /**
     * Called when a user signs in.
     * Upserts the user in our database.
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

    /**
     * Called when creating/updating JWT.
     * Stores GitHub access token inside the token.
     */
    async jwt({ token, account, profile }) {
      // On initial sign-in, account and profile are present
      if (account?.provider === 'github' && profile) {
        const githubProfile = profile as unknown as {
          id: number;
          login: string;
          avatar_url?: string;
        };

        token.githubToken = account.access_token;
        token.githubId = githubProfile.id;
        token.username = githubProfile.login;
        token.avatarUrl = githubProfile.avatar_url ?? null;
      }
      return token;
    },

    /**
     * Called whenever a session is checked.
     * Exposes user data and GitHub token to the client.
     */
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub ?? '';
        session.user.username = (token.username as string) ?? '';
        session.user.githubToken = (token.githubToken as string) ?? '';
        session.user.avatarUrl = (token.avatarUrl as string) ?? session.user.image ?? '';
      }
      return session;
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
