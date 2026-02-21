/**
 * Supabase browser client for Titan AI.
 * Used in client components for auth operations (signIn, signOut, onAuthStateChange).
 */

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
