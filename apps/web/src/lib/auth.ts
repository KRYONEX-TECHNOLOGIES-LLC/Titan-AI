/**
 * Titan AI - Auth helpers (Supabase Auth)
 * Server-side session and user helpers.
 */

import { createServerSupabase, createAdminSupabase } from '@/lib/supabase/server';

export interface TitanUser {
  id: string;
  email: string | null;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  isCreator: boolean;
  role: string;
  creatorModeOn: boolean;
  provider: string;
}

/**
 * Get the current authenticated user from Supabase session.
 * Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<TitanUser | null> {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

    const adminSb = createAdminSupabase();
    const { data: dbUser } = await adminSb
      .from('users')
      .select('*')
      .eq('provider_user_id', user.id)
      .single();

    if (dbUser) {
      return {
        id: String(dbUser.id),
        email: dbUser.email,
        username: dbUser.username || user.email?.split('@')[0] || 'user',
        name: dbUser.name,
        avatarUrl: dbUser.avatar_url,
        isCreator: dbUser.is_creator || false,
        role: dbUser.role || 'user',
        creatorModeOn: dbUser.creator_mode_on || false,
        provider: dbUser.provider || 'unknown',
      };
    }

    // Fallback: return basic info from Supabase auth if DB row not found
    return {
      id: user.id,
      email: user.email || null,
      username: user.user_metadata?.user_name || user.email?.split('@')[0] || 'user',
      name: user.user_metadata?.full_name || null,
      avatarUrl: user.user_metadata?.avatar_url || null,
      isCreator: false,
      role: 'user',
      creatorModeOn: false,
      provider: user.app_metadata?.provider || 'unknown',
    };
  } catch (err) {
    console.error('[auth] getCurrentUser failed:', err);
    return null;
  }
}

/**
 * Get the GitHub access token for the current user (if they signed in with GitHub).
 * Used for GitHub API calls (repos, commits, etc.).
 */
export async function getGithubToken(): Promise<string | null> {
  try {
    const supabase = await createServerSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.provider_token || null;
  } catch {
    return null;
  }
}
