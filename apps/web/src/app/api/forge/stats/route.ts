import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/server';

const EMPTY_STATS = {
  distillation: { total_samples: 0, high_value: 0, exported: 0, by_model: {}, by_outcome: {} },
  harvest: { total: 0, approved: 0, migrated: 0, rejected: 0, pending: 0, bySource: {}, byLanguage: {}, recentBatches: [] },
};

async function querySupabaseDirect() {
  const sb = createAdminSupabase();
  if (!sb) return null;

  try {
    const [
      sampleTotal, sampleHigh, sampleExported,
      harvestTotal, harvestApproved, harvestMigrated, harvestRejected, harvestPending,
      harvestSources, harvestBatches,
    ] = await Promise.all([
      sb.from('forge_samples').select('id', { count: 'exact', head: true }),
      sb.from('forge_samples').select('id', { count: 'exact', head: true }).gte('quality_score', 7),
      sb.from('forge_samples').select('id', { count: 'exact', head: true }).eq('exported', true),
      sb.from('forge_harvest').select('id', { count: 'exact', head: true }),
      sb.from('forge_harvest').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      sb.from('forge_harvest').select('id', { count: 'exact', head: true }).eq('status', 'migrated'),
      sb.from('forge_harvest').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
      sb.from('forge_harvest').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      sb.from('forge_harvest').select('source, language'),
      sb.from('forge_harvest_batches').select('*').order('started_at', { ascending: false }).limit(10),
    ]);

    const bySource: Record<string, number> = {};
    const byLanguage: Record<string, number> = {};
    for (const row of (harvestSources.data || []) as Array<{ source: string; language: string }>) {
      if (row.source) bySource[row.source] = (bySource[row.source] || 0) + 1;
      if (row.language) byLanguage[row.language] = (byLanguage[row.language] || 0) + 1;
    }

    return {
      distillation: {
        total_samples: sampleTotal.count || 0,
        high_value: sampleHigh.count || 0,
        exported: sampleExported.count || 0,
        by_model: {},
        by_outcome: {},
      },
      harvest: {
        total: harvestTotal.count || 0,
        approved: harvestApproved.count || 0,
        migrated: harvestMigrated.count || 0,
        rejected: harvestRejected.count || 0,
        pending: harvestPending.count || 0,
        bySource,
        byLanguage,
        recentBatches: harvestBatches.data || [],
      },
    };
  } catch (err) {
    console.error('[api/forge/stats] Direct Supabase query failed:', (err as Error).message);
    return null;
  }
}

export async function GET() {
  // Try @titan/forge module first (has richer stats)
  try {
    const forge = await import('@titan/forge');
    const db = new (forge as any).ForgeDB();
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
  } catch {
    // @titan/forge not available — fall back to direct Supabase queries
  }

  // Fallback: query Supabase directly
  const directStats = await querySupabaseDirect();
  if (directStats) {
    return NextResponse.json(directStats);
  }

  return NextResponse.json(EMPTY_STATS);
}
