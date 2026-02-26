import { NextRequest, NextResponse } from 'next/server';
import { queryCodebase } from '@/lib/cartography/cartographer-llm';
import type { CartographyGraph, LLMAnalysis } from '@/lib/cartography/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question: string = body.question;
    const graph: CartographyGraph = body.graph;
    const analysis: LLMAnalysis = body.analysis;

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }

    if (!graph || !graph.nodes) {
      return NextResponse.json(
        { error: 'graph data is required — run a scan first' },
        { status: 400 },
      );
    }

    if (!analysis) {
      return NextResponse.json(
        { error: 'analysis data is required — run a scan first' },
        { status: 400 },
      );
    }

    const result = await queryCodebase(question, graph, analysis);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cartography/query] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
