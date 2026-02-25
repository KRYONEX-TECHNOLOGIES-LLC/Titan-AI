import { NextRequest, NextResponse } from 'next/server';
import { ForgeHarvester, runFilterPipeline } from '@titan/forge';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source = 'all', topic = 'all', limit = 20 } = body;

    let harvester;
    try {
      harvester = new ForgeHarvester();
    } catch (initErr) {
      const msg = (initErr as Error).message;
      if (msg.includes('Missing Supabase')) {
        return NextResponse.json(
          { error: 'Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/web/.env', detail: msg },
          { status: 500 },
        );
      }
      throw initErr;
    }

    let scraped;
    let batchId: string;
    try {
      const harvest = await harvester.harvest({ source, topic, limit });
      scraped = harvest.scraped;
      batchId = harvest.batchId;
    } catch (harvestErr) {
      const msg = (harvestErr as Error).message;
      console.error('[api/forge/harvest] Harvest phase error:', msg);
      return NextResponse.json({ error: `Harvest failed: ${msg}` }, { status: 500 });
    }

    if (!scraped || scraped.length === 0) {
      return NextResponse.json({ total_input: 0, saved: 0, message: 'No items scraped' });
    }

    let result;
    try {
      result = await runFilterPipeline(scraped, batchId, 6);
    } catch (filterErr) {
      const msg = (filterErr as Error).message;
      console.error('[api/forge/harvest] Filter pipeline error:', msg);
      return NextResponse.json(
        { error: `Filter pipeline failed: ${msg}`, total_input: scraped.length, saved: 0 },
        { status: 500 },
      );
    }

    return NextResponse.json({
      total_input: result.total_input,
      after_pass1: result.after_pass1,
      after_pass1_5: result.after_pass1_5,
      after_pass2: result.after_pass2,
      after_pass3: result.after_pass3,
      after_pass4: result.after_pass4,
      ai_rejected: result.ai_rejected,
      saved: result.saved,
    });
  } catch (err) {
    console.error('[api/forge/harvest] Unhandled error:', (err as Error).message);
    return NextResponse.json(
      { error: (err as Error).message || 'Unknown harvest error' },
      { status: 500 },
    );
  }
}
