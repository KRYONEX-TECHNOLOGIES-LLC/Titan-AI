'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { isElectron, electronAPI } from '@/lib/electron';

export interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email: string;
  avatar_url: string;
}

export interface GitHubAuth {
  user: GitHubUser | null;
  token: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const GitHubAuthContext = createContext<GitHubAuth>({
  user: null,
  token: null,
  isConnected: false,
  isLoading: true,
  error: null,
  signIn: async () => {},
  signOut: async () => {},
  clearError: () => {},
});

export function useGitHubAuth(): GitHubAuth {
  return useContext(GitHubAuthContext);
}

export default function GitHubAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    if (!isElectron || !electronAPI) {
      setIsLoading(false);
      return;
    }
    electronAPI.auth.getSession().then((session) => {
      if (session) {
        setToken(session.token);
        setUser(session.user as GitHubUser);
      }
      setIsLoading(false);
    }).catch((err) => {
      console.error('[GitHubAuth] Session restore failed:', err);
      setIsLoading(false);
    });
  }, []);

  const signIn = useCallback(async () => {
    if (!isElectron || !electronAPI) {
      setError('GitHub connection requires the Titan AI desktop app.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const result = await electronAPI.auth.signInWithGithub();
      setToken(result.token);
      setUser(result.user as GitHubUser);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'GitHub sign-in failed';
      console.error('[GitHubAuth] Sign-in failed:', msg);
      if (msg.includes('closed')) {
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!isElectron || !electronAPI) return;
    try {
      await electronAPI.auth.signOut();
      setUser(null);
      setToken(null);
    } catch (err) {
      console.error('[GitHubAuth] Sign out failed:', err);
    }
  }, []);

  return (
    <GitHubAuthContext.Provider value={{
      user,
      token,
      isConnected: !!token && !!user,
      isLoading,
      error,
      signIn,
      signOut,
      clearError,
    }}>
      {children}
    </GitHubAuthContext.Provider>
  );
}
