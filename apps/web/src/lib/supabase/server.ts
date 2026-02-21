/**
 * Supabase server client for Titan AI.
 * Used in API routes, server components, and server actions.
 * Creates a client that can read/write auth cookies for session management.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // setAll can fail in Server Components (read-only).
        }
      },
    },
  });
}

/**
 * Admin Supabase client using the service role key.
 * Bypasses RLS -- use ONLY for server-side operations that need to write
 * protected fields (is_creator, role, etc.).
 */
export function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  const { createClient } = require('@supabase/supabase-js');
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
