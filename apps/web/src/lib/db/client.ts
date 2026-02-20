/**
 * Supabase database client for Titan AI.
 * Persistent PostgreSQL storage that survives Railway redeploys.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (supabase) return supabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      '[db] Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  return supabase;
}

// ── User management ──

interface UpsertUserParams {
  githubId: number;
  username: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  profileUrl?: string | null;
}

export async function upsertUser(params: UpsertUserParams) {
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from('users')
      .upsert(
        {
          github_id: params.githubId,
          username: params.username,
          name: params.name,
          email: params.email,
          avatar_url: params.avatarUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'github_id' }
      );

    if (error) throw error;
  } catch (e) {
    console.warn('[db] upsertUser failed (non-blocking):', (e as Error).message);
  }
}

// ── Workspace management ──

interface UpsertWorkspaceParams {
  id?: string;
  userId: string;
  name?: string;
  repoName?: string;
  repoUrl?: string;
  cloneUrl?: string;
  path?: string;
  localPath?: string;
  branch?: string;
  defaultBranch?: string;
  repoOwner?: string;
}

export async function upsertWorkspace(params: UpsertWorkspaceParams) {
  const id = params.id || `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const repoName = params.repoName || params.name || 'unknown';
  const cloneUrl = params.cloneUrl || params.repoUrl || '';
  const localPath = params.localPath || params.path || '';
  const branch = params.branch || params.defaultBranch || 'main';

  try {
    const sb = getSupabase();
    const { error } = await sb
      .from('workspaces')
      .upsert(
        {
          id,
          user_id: params.userId,
          repo_name: repoName,
          clone_url: cloneUrl,
          local_path: localPath,
          branch,
          repo_owner: params.repoOwner || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (error) throw error;
    return { id, ...params };
  } catch (e) {
    console.warn('[db] upsertWorkspace failed:', (e as Error).message);
    return { id, ...params };
  }
}

// ── Chat sessions ──

export interface DbChatSession {
  id: string;
  user_id?: string | null;
  name: string;
  model: string;
  messages: unknown[];
  changed_files: unknown[];
  context_window: string[];
  created_at: string;
  updated_at: string;
}

export async function getSession(id: string): Promise<DbChatSession | null> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('chat_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return data as DbChatSession;
  } catch {
    return null;
  }
}

export async function getAllSessions(): Promise<DbChatSession[]> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('chat_sessions')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error || !data) return [];
    return data as DbChatSession[];
  } catch {
    return [];
  }
}

export async function saveSession(session: {
  id: string;
  user_id?: string | null;
  name: string;
  model: string;
  messages: unknown[];
  changed_files: unknown[];
  context_window: string[];
  created_at?: string;
}) {
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from('chat_sessions')
      .upsert(
        {
          id: session.id,
          user_id: session.user_id || null,
          name: session.name,
          model: session.model,
          messages: session.messages,
          changed_files: session.changed_files,
          context_window: session.context_window,
          created_at: session.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (error) throw error;
  } catch (e) {
    console.warn('[db] saveSession failed:', (e as Error).message);
  }
}

export async function deleteSession(id: string) {
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from('chat_sessions')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (e) {
    console.warn('[db] deleteSession failed:', (e as Error).message);
  }
}
