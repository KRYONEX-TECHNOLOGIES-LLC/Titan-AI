import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source = 'all', topic = 'all', limit = 20 } = body;

    const forgePkg = '@titan' + '/forge';
    const mod = await import(/* webpackIgnore: true */ forgePkg);
    const { ForgeHarvester, runFilterPipeline } = mod;

    const harvester = new ForgeHarvester();
    const { scraped, batchId } = await harvester.harvest({ source, topic, limit });

    if (scraped.length === 0) {
      return NextResponse.json({ total_input: 0, saved: 0, message: 'No items scraped' });
    }

    const result = await runFilterPipeline(scraped, batchId, 6);

    return NextResponse.json({
      total_input: result.total_input,
      after_pass1: result.after_pass1,
      after_pass2: result.after_pass2,
      after_pass3: result.after_pass3,
      after_pass4: result.after_pass4,
      saved: result.saved,
    });
  } catch (err) {
    console.error('[api/forge/harvest] Error:', (err as Error).message);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
