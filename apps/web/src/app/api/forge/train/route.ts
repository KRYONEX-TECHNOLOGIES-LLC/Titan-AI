import { NextRequest, NextResponse } from 'next/server';
import { ForgeDB } from '@titan/forge';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const baseModel = String(body.baseModel || 'openai/gpt-oss-120b');
    const method = (String(body.method || 'qlora') as 'qlora' | 'full' | 'dpo');
    const minQualityScore = Number(body.minQualityScore || 7);
    const cfg = body.config || {};

    const db = new ForgeDB();

    const availableSamples = await db.getSamplesForExport(minQualityScore, 50000);
    const runId = await db.insertRun({
      base_model: baseModel,
      method,
      samples_used: availableSamples.length,
      min_quality_score: minQualityScore,
      config: {
        lora_r: Number(cfg.lora_r || 32),
        lora_alpha: Number(cfg.lora_alpha || 64),
        lora_dropout: Number(cfg.lora_dropout || 0.05),
        learning_rate: Number(cfg.learning_rate || 0.0002),
        num_epochs: Number(cfg.num_epochs || 3),
        sequence_len: Number(cfg.sequence_len || 8192),
        micro_batch_size: Number(cfg.micro_batch_size || 4),
        gradient_accumulation_steps: Number(cfg.gradient_accumulation_steps || 4),
        curriculum_phase: 'titan',
      },
      metrics: null,
      model_path: null,
      status: 'running',
    });

    if (!runId) {
      return NextResponse.json({ error: 'Could not create training run' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      run: {
        id: runId,
        base_model: baseModel,
        method,
        status: 'running',
        samples_used: availableSamples.length,
      },
      note: 'Run created. Connect your trainer worker to pick this run up.',
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'Training start failed' }, { status: 500 });
  }
}
