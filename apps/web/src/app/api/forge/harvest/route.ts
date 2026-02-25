import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  let ForgeHarvester: any, runFilterPipeline: any, runParallelHarvest: any;
  try {
    const forge: any = await import('@titan/forge');
    ForgeHarvester = forge.ForgeHarvester;
    runFilterPipeline = forge.runFilterPipeline;
    runParallelHarvest = forge.runParallelHarvest;
  } catch {
    return NextResponse.json({ error: 'Forge is only available in the Titan Desktop app' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const {
      source = 'all',
      topic = 'all',
      limit = 20,
      parallel = false,
      workerCount = 4,
      minScore = 6,
      evolInstruct = false,
    } = body;

    if (parallel) {
      try {
        const result = await runParallelHarvest({
          source,
          topic,
          limit: Math.min(limit, 500),
          parallel: true,
          workerCount: Math.min(workerCount, 100),
          minScore,
          evolInstruct,
        });

        return NextResponse.json({
          mode: 'parallel',
          batchId: result.batchId,
          total_input: result.total_input,
          after_pass1: result.after_pass1,
          after_pass1_5: result.after_pass1_5,
          after_pass2: result.after_pass2,
          after_pass3: result.after_pass3,
          after_pass4: result.after_pass4,
          after_pass4_5: result.after_pass4_5,
          ai_rejected: result.ai_rejected,
          near_duplicates: result.near_duplicates,
          evolved: result.evolved || 0,
          saved: result.saved,
          elapsed: result.elapsed,
          workers: result.workers,
        });
      } catch (err) {
        console.error('[api/forge/harvest] Parallel harvest error:', (err as Error).message);
        return NextResponse.json(
          { error: `Parallel harvest failed: ${(err as Error).message}` },
          { status: 500 },
        );
      }
    }

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
      result = await runFilterPipeline(scraped, batchId, minScore);
    } catch (filterErr) {
      const msg = (filterErr as Error).message;
      console.error('[api/forge/harvest] Filter pipeline error:', msg);
      return NextResponse.json(
        { error: `Filter pipeline failed: ${msg}`, total_input: scraped.length, saved: 0 },
        { status: 500 },
      );
    }

    return NextResponse.json({
      mode: 'sequential',
      total_input: result.total_input,
      after_pass1: result.after_pass1,
      after_pass1_5: result.after_pass1_5,
      after_pass2: result.after_pass2,
      after_pass3: result.after_pass3,
      after_pass4: result.after_pass4,
      after_pass4_5: result.after_pass4_5,
      ai_rejected: result.ai_rejected,
      near_duplicates: result.near_duplicates,
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
