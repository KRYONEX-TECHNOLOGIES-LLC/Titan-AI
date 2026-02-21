/**
 * GET /api/me - Returns the current user's profile including creator status.
 * Used by the session provider to hydrate client-side user state.
 */

import { NextResponse } from 'next/server';
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const adminSb = createAdminSupabase();
    const { data: dbUser } = await adminSb
      .from('users')
      .select('id, username, name, email, avatar_url, provider, provider_user_id, role, is_creator, creator_mode_on, email_verified')
      .eq('provider_user_id', user.id)
      .single();

    if (dbUser) {
      return NextResponse.json(dbUser);
    }

    // Fallback: return basic info from Supabase auth user
    return NextResponse.json({
      id: user.id,
      email: user.email,
      username: user.user_metadata?.user_name || user.email?.split('@')[0] || 'user',
      name: user.user_metadata?.full_name || null,
      avatar_url: user.user_metadata?.avatar_url || null,
      provider: user.app_metadata?.provider || 'unknown',
      is_creator: false,
      role: 'user',
      creator_mode_on: false,
    });
  } catch (err) {
    console.error('[api/me] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
