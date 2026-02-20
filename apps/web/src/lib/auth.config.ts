/**
 * Titan AI - NextAuth v5 Edge-Compatible Configuration
 * This file contains ONLY Edge-compatible config for use in middleware.
 * Do NOT import Node.js modules (fs, path, etc.) or heavy libraries here.
 */

import GitHub from 'next-auth/providers/github';
import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      authorization: {
        params: {
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
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublicPath = [
        '/auth/signin',
        '/auth/error',
        '/api/auth',
        '/_next',
        '/favicon',
        '/manifest',
        '/apple-touch',
        '/not-found',
      ].some(p => nextUrl.pathname.startsWith(p));

      if (isPublicPath) return true;
      return isLoggedIn;
    },

    jwt({ token, account, profile }) {
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

    session({ session, token }) {
      if (token) {
        session.user.id = token.sub ?? '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const user = session.user as any;
        user.username = token.username ?? '';
        user.githubToken = token.githubToken ?? '';
        user.avatarUrl = token.avatarUrl ?? session.user.image ?? '';
      }
      return session;
    },
  },
};
