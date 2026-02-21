'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export interface TitanSession {
  user: {
    id: string;
    email: string | null;
    username: string;
    name: string | null;
    avatarUrl: string | null;
    isCreator: boolean;
    role: string;
    creatorModeOn: boolean;
    provider: string;
  } | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const SessionContext = createContext<TitanSession>({
  user: null,
  status: 'loading',
  signOut: async () => {},
  refreshUser: async () => {},
});

export function useSession(): TitanSession {
  return useContext(SessionContext);
}

async function fetchUserProfile(supabaseUser: User): Promise<TitanSession['user']> {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      return {
        id: data.id || supabaseUser.id,
        email: data.email || supabaseUser.email || null,
        username: data.username || supabaseUser.user_metadata?.user_name || supabaseUser.email?.split('@')[0] || 'user',
        name: data.name || supabaseUser.user_metadata?.full_name || null,
        avatarUrl: data.avatar_url || supabaseUser.user_metadata?.avatar_url || null,
        isCreator: data.is_creator || false,
        role: data.role || 'user',
        creatorModeOn: data.creator_mode_on || false,
        provider: data.provider || supabaseUser.app_metadata?.provider || 'unknown',
      };
    }
  } catch {
    // Fallback to Supabase user metadata
  }

  return {
    id: supabaseUser.id,
    email: supabaseUser.email || null,
    username: supabaseUser.user_metadata?.user_name || supabaseUser.email?.split('@')[0] || 'user',
    name: supabaseUser.user_metadata?.full_name || null,
    avatarUrl: supabaseUser.user_metadata?.avatar_url || null,
    isCreator: false,
    role: 'user',
    creatorModeOn: false,
    provider: supabaseUser.app_metadata?.provider || 'unknown',
  };
}

export default function TitanSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<TitanSession['user']>(null);
  const [status, setStatus] = useState<TitanSession['status']>('loading');
  const supabase = createClient();

  const loadUser = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setUser(null);
      setStatus('unauthenticated');
      return;
    }
    const profile = await fetchUserProfile(session.user);
    setUser(profile);
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      loadUser(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      loadUser(session);
    });

    return () => subscription.unsubscribe();
  }, [supabase, loadUser]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setStatus('unauthenticated');
    window.location.href = '/auth/signin';
  }, [supabase]);

  const refreshUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    await loadUser(session);
  }, [supabase, loadUser]);

  return (
    <SessionContext.Provider value={{ user, status, signOut: handleSignOut, refreshUser }}>
      {children}
    </SessionContext.Provider>
  );
}
