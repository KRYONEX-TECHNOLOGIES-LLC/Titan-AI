import { NextResponse } from 'next/server';

export async function GET() {
  let ForgeDB: any;
  try {
    const forge = await import('@titan/forge');
    ForgeDB = forge.ForgeDB;
  } catch {
    return NextResponse.json({
      distillation: { total_samples: 0, high_value: 0, exported: 0, by_model: {}, by_outcome: {} },
      harvest: { total: 0, approved: 0, migrated: 0, rejected: 0, pending: 0, bySource: {}, recentBatches: [] },
    });
  }

  try {
    const db = new ForgeDB();

    const [sampleStats, harvestStats] = await Promise.all([
      db.getStats(),
      db.getHarvestStats(),
    ]);

    return NextResponse.json({
      distillation: {
        total_samples: sampleStats.total,
        high_value: sampleStats.highValue,
        exported: sampleStats.exported,
        by_model: sampleStats.byModel,
        by_outcome: sampleStats.byOutcome,
      },
      harvest: harvestStats,
    });
  } catch (err) {
    console.error('[api/forge/stats] Error:', (err as Error).message);
    return NextResponse.json({
      distillation: { total_samples: 0, high_value: 0, exported: 0, by_model: {}, by_outcome: {} },
      harvest: { total: 0, approved: 0, migrated: 0, rejected: 0, pending: 0, bySource: {}, recentBatches: [] },
    });
  }
}
