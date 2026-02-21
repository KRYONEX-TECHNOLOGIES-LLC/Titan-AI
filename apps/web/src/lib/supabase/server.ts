/**
 * Supabase server client for Titan AI.
 * Used in API routes, server components, and server actions.
 * Creates a client that can read/write auth cookies for session management.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
            // This is expected when called from a Server Component context.
          }
        },
      },
    }
  );
}

/**
 * Admin Supabase client using the service role key.
 * Bypasses RLS -- use ONLY for server-side operations that need to write
 * protected fields (is_creator, role, etc.).
 */
export function createAdminSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
