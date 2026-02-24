import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const sb = createAdminSupabase();
  if (!sb) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const body = await request.json();
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
  const target = String(body.target || 'harvest');
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids are required' }, { status: 400 });
  }

  if (target === 'samples') {
    const { error } = await sb.from('forge_samples').update({ outcome: 'success' }).in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, updated: ids.length, target: 'forge_samples' });
  }

  const { error } = await sb.from('forge_harvest').update({ status: 'approved' }).in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, updated: ids.length, target: 'forge_harvest' });
}
