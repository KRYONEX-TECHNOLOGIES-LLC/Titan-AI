import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/server';

const EMPTY_STATS = {
  distillation: { total_samples: 0, high_value: 0, exported: 0, by_model: {}, by_outcome: {} },
  harvest: { total: 0, approved: 0, migrated: 0, rejected: 0, pending: 0, bySource: {}, byLanguage: {}, recentBatches: [] },
  recentSamples: [] as Array<{ id: string; source?: string; content?: string; category?: string; quality_score?: number }>,
};

async function querySupabaseDirect() {
  const sb = createAdminSupabase();
  if (!sb) return null;

  try {
    const [
      sampleTotal, sampleHigh, sampleExported,
      harvestTotal, harvestApproved, harvestMigrated, harvestRejected, harvestPending,
      harvestSources, harvestBatches,
      recentHarvestSamples,
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
      sb.from('forge_harvest').select('id, source, instruction, response, quality_score, tags').order('created_at', { ascending: false }).limit(50),
    ]);

    const bySource: Record<string, number> = {};
    const byLanguage: Record<string, number> = {};
    for (const row of (harvestSources.data || []) as Array<{ source: string; language: string }>) {
      if (row.source) bySource[row.source] = (bySource[row.source] || 0) + 1;
      if (row.language) byLanguage[row.language] = (byLanguage[row.language] || 0) + 1;
    }

    const recentSamples = ((recentHarvestSamples.data || []) as Array<{
      id: string; source?: string; instruction?: string; response?: string; quality_score?: number; tags?: string[];
    }>).map(s => ({
      id: s.id,
      source: s.source,
      content: [s.instruction, s.response].filter(Boolean).join('\n\n'),
      category: (s.tags || []).find((t: string) => ['best-practices', 'ai-research', 'tech-news', 'innovations', 'patterns'].includes(t)) || 'knowledge',
      quality_score: s.quality_score,
    }));

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
      recentSamples,
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
    const forgeDb = new (forge as any).ForgeDB();
    const [sampleStats, harvestStats] = await Promise.all([
      forgeDb.getStats(),
      forgeDb.getHarvestStats(),
    ]);

    // Also fetch recent samples for Alfred knowledge ingestion
    let recentSamples: Array<{ id: string; source?: string; content?: string; category?: string; quality_score?: number }> = [];
    try {
      const sb = createAdminSupabase();
      if (sb) {
        const { data } = await sb.from('forge_harvest').select('id, source, instruction, response, quality_score, tags').order('created_at', { ascending: false }).limit(50);
        recentSamples = ((data || []) as Array<{ id: string; source?: string; instruction?: string; response?: string; quality_score?: number; tags?: string[] }>).map(s => ({
          id: s.id,
          source: s.source,
          content: [s.instruction, s.response].filter(Boolean).join('\n\n'),
          category: (s.tags || []).find((t: string) => ['best-practices', 'ai-research', 'tech-news', 'innovations', 'patterns'].includes(t)) || 'knowledge',
          quality_score: s.quality_score,
        }));
      }
    } catch { /* non-critical */ }

    return NextResponse.json({
      distillation: {
        total_samples: sampleStats.total,
        high_value: sampleStats.highValue,
        exported: sampleStats.exported,
        by_model: sampleStats.byModel,
        by_outcome: sampleStats.byOutcome,
      },
      harvest: harvestStats,
      recentSamples,
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
