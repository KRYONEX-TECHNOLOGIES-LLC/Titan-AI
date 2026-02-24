import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const sb = createAdminSupabase();
  if (!sb) return NextResponse.json({ samples: [], total: 0, page: 1, limit: 20 });

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await sb
    .from('forge_samples')
    .select('id, created_at, model_id, quality_score, outcome, response, messages, quality_signals, exported', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message, samples: [], total: 0, page, limit }, { status: 500 });
  }

  return NextResponse.json({
    samples: data || [],
    total: count || 0,
    page,
    limit,
    hasMore: (count || 0) > page * limit,
  });
}
