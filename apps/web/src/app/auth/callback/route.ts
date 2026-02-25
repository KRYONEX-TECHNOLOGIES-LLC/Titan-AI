/**
 * Supabase OAuth callback handler.
 * Handles the code exchange after Google/Apple/GitHub OAuth redirect.
 * Runs the creator identity check on every successful auth.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isCreatorIdentity } from '@/lib/creator';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/editor';

  if (!code) {
    console.error('[auth/callback] Missing code parameter');
    return NextResponse.redirect(`${origin}/auth/signin?error=OAuthCallback`);
  }

  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('[auth/callback] Supabase not configured');
    return NextResponse.redirect(`${origin}/auth/signin?error=AuthNotConfigured`);
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error('[auth/callback] Code exchange failed:', error?.message);
    return NextResponse.redirect(`${origin}/auth/signin?error=OAuthCallback`);
  }

  const user = data.user;
  const provider = user.app_metadata?.provider || 'unknown';
  const email = user.email || null;
  const emailVerified = !!user.email_confirmed_at;
  const name = user.user_metadata?.full_name || user.user_metadata?.name || null;
  const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
  const username = user.user_metadata?.user_name || user.user_metadata?.preferred_username || email?.split('@')[0] || 'user';

  console.log(`[auth/callback] Successful login: provider=${provider}, email=${email}, verified=${emailVerified}`);

  // Upsert user into our custom users table using the admin (service_role) client
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      console.warn('[auth/callback] Service role key not configured, skipping user upsert');
      throw new Error('Service role key not configured');
    }
    const { createClient } = await import('@supabase/supabase-js');
    const adminSupabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Look up existing user by provider + supabase user id
    const { data: existingUser } = await adminSupabase
      .from('users')
      .select('*')
      .eq('provider', provider)
      .eq('provider_user_id', user.id)
      .single();

    const isCreator = isCreatorIdentity({ email, provider, emailVerified });
    console.log('[auth/callback] Creator identity check:', {
      email,
      provider,
      emailVerified,
      isCreator,
      providerUserId: user.id,
    });

    if (existingUser) {
      // Update existing user
      const updates: Record<string, unknown> = {
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        email_verified: emailVerified,
      };

      // Only update name/avatar if not manually edited
      if (!existingUser.profile_edited) {
        if (name) updates.name = name;
        if (avatarUrl) updates.avatar_url = avatarUrl;
      }
      if (email) updates.email = email;

      if (isCreator) {
        updates.is_creator = true;
        updates.role = 'creator';
        updates.creator_mode_on = true;
      }

      const { error: updateError } = await adminSupabase
        .from('users')
        .update(updates)
        .eq('id', existingUser.id);
      if (updateError) {
        console.error('[auth/callback] Failed to update existing user:', updateError.message);
      }

      console.log(`[auth/callback] Updated user id=${existingUser.id}, isCreator=${isCreator}`);
    } else {
      // Check for account linking by email
      let linkedUser = null;
      if (email) {
        const { data: byEmail } = await adminSupabase
          .from('users')
          .select('*')
          .eq('email', email)
          .single();
        linkedUser = byEmail;
      }

      if (linkedUser) {
        // Link new provider to existing account — update identity fields
        // so the display name/avatar reflect the current provider, not a stale one
        const linkUpdates: Record<string, unknown> = {
          provider,
          provider_user_id: user.id,
          username,
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          email_verified: emailVerified,
        };
        if (name) linkUpdates.name = name;
        if (avatarUrl) linkUpdates.avatar_url = avatarUrl;
        if (isCreator) {
          linkUpdates.is_creator = true;
          linkUpdates.role = 'creator';
          linkUpdates.creator_mode_on = true;
        }

        const { error: linkError } = await adminSupabase
          .from('users')
          .update(linkUpdates)
          .eq('id', linkedUser.id);
        if (linkError) {
          console.error('[auth/callback] Failed to link provider identity:', linkError.message);
        }

        console.log(`[auth/callback] Linked provider=${provider} to existing user id=${linkedUser.id}`);
      } else {
        // Create new user
        const { error: insertError } = await adminSupabase.from('users').insert({
          username,
          name,
          email,
          avatar_url: avatarUrl,
          provider,
          provider_user_id: user.id,
          role: isCreator ? 'creator' : 'user',
          is_creator: isCreator,
          creator_mode_on: isCreator,
          email_verified: emailVerified,
          github_id: provider === 'github' ? (user.user_metadata?.provider_id || null) : null,
          last_login_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (insertError) {
          console.error('[auth/callback] Failed to create user:', insertError.message);
        }

        console.log(`[auth/callback] Created new user: provider=${provider}, email=${email}, isCreator=${isCreator}`);
      }
    }
  } catch (err) {
    // Non-blocking: auth still works even if user table sync fails
    console.error('[auth/callback] User upsert failed:', (err as Error).message);
  }

  // Redirect to the intended destination (desktop goes to /editor, web to /)
  const host = request.headers.get('host') || '';
  const isDesktop = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const redirectTo = isDesktop ? next : '/';

  return NextResponse.redirect(`${origin}${redirectTo}`);
}
