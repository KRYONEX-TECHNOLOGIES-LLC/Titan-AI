/**
 * GET/POST /api/creator-mode
 * GET:  Returns { enabled: boolean, isCreator: boolean } for the current user.
 * POST: Toggles creator mode. Requires is_creator=true. Rate limited.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase/server';

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_TOGGLES_PER_WINDOW = 10;
const toggleHistory = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const history = toggleHistory.get(userId) || [];
  const recent = history.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  toggleHistory.set(userId, recent);

  if (recent.length >= MAX_TOGGLES_PER_WINDOW) {
    return true;
  }
  recent.push(now);
  toggleHistory.set(userId, recent);
  return false;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    return NextResponse.json({
      enabled: user.creatorModeOn,
      isCreator: user.isCreator,
    });
  } catch (err) {
    console.error('[creator-mode] GET error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!user.isCreator) {
      console.warn(`[creator-mode] Non-creator user ${user.id} attempted to toggle creator mode`);
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (isRateLimited(user.id)) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
    }

    const body = await request.json();
    const enabled = Boolean(body.enabled);

    const adminSb = createAdminSupabase();
    if (!adminSb) {
      return NextResponse.json({ error: 'Auth not configured' }, { status: 503 });
    }
    const { error } = await adminSb
      .from('users')
      .update({ creator_mode_on: enabled, updated_at: new Date().toISOString() })
      .eq('provider_user_id', user.providerUserId);

    if (error) {
      console.error('[creator-mode] Failed to update creator mode:', error.message, {
        providerUserId: user.providerUserId,
      });
      return NextResponse.json({ error: 'Failed to update creator mode' }, { status: 500 });
    }

    console.log(`[creator-mode] Creator mode toggled: enabled=${enabled}, user=${user.email}`);

    return NextResponse.json({ enabled });
  } catch (err) {
    console.error('[creator-mode] POST error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
