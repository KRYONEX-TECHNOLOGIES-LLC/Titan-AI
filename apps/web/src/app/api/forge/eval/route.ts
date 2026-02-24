import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const runId = String(body.runId || '');
    if (!runId) {
      return NextResponse.json({ error: 'runId is required' }, { status: 400 });
    }

    const sb = createAdminSupabase();
    if (!sb) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const { data: run } = await sb.from('forge_runs').select('*').eq('id', runId).single();
    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    const forgePkg = '@titan' + '/forge';
    const mod = await import(/* webpackIgnore: true */ forgePkg);
    const { ForgeEvaluator, ForgeDB } = mod;
    const db = new ForgeDB();

    const evaluator = new ForgeEvaluator();
    const teacherModel = String(body.teacherModel || 'anthropic/claude-opus-4.6');
    const studentModel = String(body.studentModel || run.model_path || run.base_model);
    const sampleCount = Number(body.sampleCount || 40);

    const metrics = await evaluator.run({
      runId,
      teacherModel,
      studentEndpoint: 'https://openrouter.ai/api/v1',
      studentModel,
      judgeModel: String(body.judgeModel || 'openai/gpt-4o'),
      sampleCount,
      minScore: Number(run.min_quality_score || 7),
    });

    if (!metrics) {
      await db.updateRunStatus(runId, 'failed');
      return NextResponse.json({ error: 'Evaluation produced no metrics' }, { status: 500 });
    }

    return NextResponse.json({ success: true, runId, metrics });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'Eval failed' }, { status: 500 });
  }
}
