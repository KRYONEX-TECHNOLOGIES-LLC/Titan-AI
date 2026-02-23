// ── Titan Forge — Supabase Database Client ──
// Typed wrapper around the Forge tables in Supabase.
// Uses the service role key (bypasses RLS) for all writes.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  ForgeSample,
  ForgeRun,
  ForgeEval,
  QualitySignals,
  SampleOutcome,
  TrainingRunStatus,
  EvalMetrics,
} from './types.js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      '[forge/db] Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export class ForgeDB {
  // ── Samples ──

  async insertSample(
    sample: Omit<ForgeSample, 'created_at' | 'exported'> & { id?: string },
  ): Promise<string | null> {
    try {
      const db = getClient();
      const row: Record<string, unknown> = {
        session_id: sample.session_id,
        model_id: sample.model_id,
        model_tier: sample.model_tier,
        system_prompt: sample.system_prompt,
        messages: sample.messages,
        response: sample.response,
        tool_calls: sample.tool_calls,
        tool_results: sample.tool_results,
        tokens_in: sample.tokens_in,
        tokens_out: sample.tokens_out,
        latency_ms: sample.latency_ms,
        cost_usd: sample.cost_usd,
        quality_score: sample.quality_score,
        quality_signals: sample.quality_signals,
        outcome: sample.outcome,
        prompt_hash: sample.prompt_hash,
      };
      if (sample.id) row.id = sample.id;
      const { data, error } = await db
        .from('forge_samples')
        .insert(row)
        .select('id')
        .single();

      if (error) {
        console.error('[forge/db] insertSample failed:', error.message);
        return null;
      }
      return (data as { id: string }).id;
    } catch (err) {
      console.error('[forge/db] insertSample threw:', (err as Error).message);
      return null;
    }
  }

  async updateScore(
    id: string,
    score: number,
    signals: QualitySignals,
    outcome: SampleOutcome,
  ): Promise<boolean> {
    try {
      const db = getClient();
      const { error } = await db
        .from('forge_samples')
        .update({ quality_score: score, quality_signals: signals, outcome })
        .eq('id', id);

      if (error) {
        console.error('[forge/db] updateScore failed:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[forge/db] updateScore threw:', (err as Error).message);
      return false;
    }
  }

  async appendToolResults(
    id: string,
    toolResults: ForgeSample['tool_results'],
  ): Promise<boolean> {
    try {
      const db = getClient();
      const { error } = await db.rpc('forge_append_tool_results', {
        sample_id: id,
        new_results: toolResults,
      });

      if (error) {
        // Fallback: fetch and overwrite
        const { data: existing } = await db
          .from('forge_samples')
          .select('tool_results')
          .eq('id', id)
          .single();
        if (!existing) return false;
        const merged = [
          ...(existing as { tool_results: ForgeSample['tool_results'] }).tool_results,
          ...toolResults,
        ];
        const { error: updateError } = await db
          .from('forge_samples')
          .update({ tool_results: merged })
          .eq('id', id);
        return !updateError;
      }
      return true;
    } catch (err) {
      console.error('[forge/db] appendToolResults threw:', (err as Error).message);
      return false;
    }
  }

  async getSamplesForExport(
    minScore: number = 7,
    limit: number = 5000,
  ): Promise<ForgeSample[]> {
    try {
      const db = getClient();
      const { data, error } = await db
        .from('forge_samples')
        .select('*')
        .eq('exported', false)
        .eq('model_tier', 'frontier')
        .gte('quality_score', minScore)
        .order('quality_score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[forge/db] getSamplesForExport failed:', error.message);
        return [];
      }
      return (data as ForgeSample[]) || [];
    } catch (err) {
      console.error('[forge/db] getSamplesForExport threw:', (err as Error).message);
      return [];
    }
  }

  async markExported(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    try {
      const db = getClient();
      const { error } = await db
        .from('forge_samples')
        .update({ exported: true })
        .in('id', ids);

      if (error) {
        console.error('[forge/db] markExported failed:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[forge/db] markExported threw:', (err as Error).message);
      return false;
    }
  }

  async dedupCheck(promptHash: string): Promise<{ exists: boolean; id?: string; score?: number }> {
    try {
      const db = getClient();
      const { data, error } = await db
        .from('forge_samples')
        .select('id, quality_score')
        .eq('prompt_hash', promptHash)
        .order('quality_score', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) return { exists: false };
      const row = data[0] as { id: string; quality_score: number };
      return { exists: true, id: row.id, score: row.quality_score };
    } catch {
      return { exists: false };
    }
  }

  async getStats(): Promise<{
    total: number;
    highValue: number;
    exported: number;
    byModel: Record<string, number>;
    byOutcome: Record<string, number>;
  }> {
    try {
      const db = getClient();
      const [totalRes, highRes, exportedRes, modelRes, outcomeRes] = await Promise.all([
        db.from('forge_samples').select('id', { count: 'exact', head: true }),
        db.from('forge_samples').select('id', { count: 'exact', head: true }).gte('quality_score', 7),
        db.from('forge_samples').select('id', { count: 'exact', head: true }).eq('exported', true),
        db.from('forge_samples').select('model_id'),
        db.from('forge_samples').select('outcome'),
      ]);

      const byModel: Record<string, number> = {};
      for (const row of (modelRes.data || []) as Array<{ model_id: string }>) {
        byModel[row.model_id] = (byModel[row.model_id] || 0) + 1;
      }

      const byOutcome: Record<string, number> = {};
      for (const row of (outcomeRes.data || []) as Array<{ outcome: string }>) {
        byOutcome[row.outcome] = (byOutcome[row.outcome] || 0) + 1;
      }

      return {
        total: totalRes.count || 0,
        highValue: highRes.count || 0,
        exported: exportedRes.count || 0,
        byModel,
        byOutcome,
      };
    } catch (err) {
      console.error('[forge/db] getStats threw:', (err as Error).message);
      return { total: 0, highValue: 0, exported: 0, byModel: {}, byOutcome: {} };
    }
  }

  // ── Training Runs ──

  async insertRun(run: Omit<ForgeRun, 'id' | 'created_at'>): Promise<string | null> {
    try {
      const db = getClient();
      const { data, error } = await db
        .from('forge_runs')
        .insert(run)
        .select('id')
        .single();

      if (error) {
        console.error('[forge/db] insertRun failed:', error.message);
        return null;
      }
      return (data as { id: string }).id;
    } catch (err) {
      console.error('[forge/db] insertRun threw:', (err as Error).message);
      return null;
    }
  }

  async updateRunStatus(
    id: string,
    status: TrainingRunStatus,
    metrics?: EvalMetrics,
    modelPath?: string,
  ): Promise<boolean> {
    try {
      const db = getClient();
      const update: Record<string, unknown> = { status };
      if (metrics) update.metrics = metrics;
      if (modelPath) update.model_path = modelPath;

      const { error } = await db.from('forge_runs').update(update).eq('id', id);
      if (error) {
        console.error('[forge/db] updateRunStatus failed:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[forge/db] updateRunStatus threw:', (err as Error).message);
      return false;
    }
  }

  // ── Evals ──

  async insertEvals(evals: Omit<ForgeEval, 'id' | 'created_at'>[]): Promise<boolean> {
    if (evals.length === 0) return true;
    try {
      const db = getClient();
      const { error } = await db.from('forge_evals').insert(evals);
      if (error) {
        console.error('[forge/db] insertEvals failed:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[forge/db] insertEvals threw:', (err as Error).message);
      return false;
    }
  }

  async getEvalSummary(runId: string): Promise<EvalMetrics | null> {
    try {
      const db = getClient();
      const { data, error } = await db
        .from('forge_evals')
        .select('teacher_score, student_score, category')
        .eq('run_id', runId);

      if (error || !data || data.length === 0) return null;

      const rows = data as Array<{ teacher_score: number; student_score: number; category: string }>;
      const total = rows.length;
      const avgTeacher = rows.reduce((s, r) => s + Number(r.teacher_score), 0) / total;
      const avgStudent = rows.reduce((s, r) => s + Number(r.student_score), 0) / total;
      const winRate = rows.filter((r) => Number(r.student_score) >= Number(r.teacher_score)).length / total;

      const byCategory: Record<string, { teacher: number; student: number }> = {};
      for (const row of rows) {
        if (!byCategory[row.category]) byCategory[row.category] = { teacher: 0, student: 0 };
        byCategory[row.category].teacher += Number(row.teacher_score);
        byCategory[row.category].student += Number(row.student_score);
      }

      return {
        student_win_rate: winRate,
        avg_teacher_score: avgTeacher,
        avg_student_score: avgStudent,
        score_ratio: avgTeacher > 0 ? avgStudent / avgTeacher : 0,
        by_category: byCategory,
        total_evaluated: total,
      };
    } catch (err) {
      console.error('[forge/db] getEvalSummary threw:', (err as Error).message);
      return null;
    }
  }
}
