import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/server';

export async function GET() {
  const sb = createAdminSupabase();
  if (!sb) {
    return NextResponse.json({ runs: [] });
  }

  const { data, error } = await sb
    .from('forge_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message, runs: [] }, { status: 500 });
  }

  return NextResponse.json({ runs: data || [] });
}
