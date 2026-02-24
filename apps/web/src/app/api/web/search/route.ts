import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { query } = (await req.json()) as { query?: string };
    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const results = await duckDuckGoSearch(query);
    return NextResponse.json({ results });
  } catch (err) {
    console.error('[api/web/search]', err);
    return NextResponse.json({ results: [], error: 'search failed' }, { status: 500 });
  }
}

async function duckDuckGoSearch(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const encoded = encodeURIComponent(query);
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
    headers: {
      'User-Agent': 'TitanAI/1.0 (IDE)',
      'Accept': 'text/html',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return [];
  const html = await res.text();

  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const regex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  while ((match = regex.exec(html)) !== null && results.length < 10) {
    const url = decodeURIComponent((match[1] ?? '').replace(/.*uddg=/, '').replace(/&.*/, ''));
    const title = (match[2] ?? '').replace(/<[^>]+>/g, '').trim();
    const snippet = (match[3] ?? '').replace(/<[^>]+>/g, '').trim();
    if (title && url) results.push({ title, url, snippet });
  }

  return results;
}
