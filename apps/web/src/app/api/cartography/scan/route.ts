import { NextRequest, NextResponse } from 'next/server';
import { walkFiles } from '@/lib/cartography/file-walker';
import { buildGraph } from '@/lib/cartography/graph-builder';
import { analyzeHotspots } from '@/lib/cartography/hotspot-detector';
import { analyzeWithLLM } from '@/lib/cartography/cartographer-llm';
import type { CartographyResult } from '@/lib/cartography/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

let cachedResult: CartographyResult | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const workspacePath: string = body.workspacePath || process.cwd();
    const fileTree: string | undefined = body.fileTree;
    const skipLLM: boolean = body.skipLLM === true;
    const forceRefresh: boolean = body.forceRefresh === true;

    if (!forceRefresh && cachedResult && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
      return NextResponse.json(cachedResult);
    }

    const files = walkFiles(workspacePath, 500);

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No code files found in workspace' },
        { status: 400 },
      );
    }

    const graph = buildGraph(files);
    const hotspotReport = analyzeHotspots(graph);

    let analysis;
    if (skipLLM) {
      analysis = {
        architectureSummary: `Project contains ${graph.totalFiles} files with ${graph.totalEdges} dependency edges.`,
        hotspotAnalysis: `${hotspotReport.critical.length} critical, ${hotspotReport.important.length} important hotspots.`,
        refactoringSuggestions: graph.antiPatterns
          .filter(p => p.severity === 'critical')
          .slice(0, 5)
          .map(p => `${p.file}: ${p.detail}`),
        healthScore: hotspotReport.healthScore,
        keyDecisions: [],
        risks: graph.antiPatterns.filter(p => p.severity === 'critical').map(p => p.detail),
        legacyPatterns: [],
        couplingHotZones: [],
        modernizationPlan: [],
      };
    } else {
      analysis = await analyzeWithLLM(graph, hotspotReport, fileTree);
    }

    const result: CartographyResult = {
      graph,
      analysis,
      scannedAt: Date.now(),
    };

    cachedResult = result;
    cacheTimestamp = Date.now();

    return NextResponse.json(result);
  } catch (err) {
    console.error('[cartography/scan] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function GET() {
  if (cachedResult) {
    return NextResponse.json({
      status: 'cached',
      scannedAt: cachedResult.scannedAt,
      totalFiles: cachedResult.graph.totalFiles,
      healthScore: cachedResult.analysis.healthScore,
    });
  }
  return NextResponse.json({ status: 'no_scan', description: 'POST to trigger a scan' });
}
