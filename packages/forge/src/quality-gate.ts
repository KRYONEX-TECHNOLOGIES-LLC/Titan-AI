// ── Titan Forge — Quality Gate ──
// Scores each captured sample from 0-10 based on outcome signals.
// Only samples with score >= 7 enter the training set.
// This is the most critical component — garbage in = garbage out.

import { ForgeDB } from './db.js';
import { TOP_TIER_MODELS } from './collector.js';
import type { QualitySignals, SampleOutcome, ForgeSample, OutcomeSignal } from './types.js';

const db = new ForgeDB();

// Signals accumulated per sample ID before final scoring
const signalBuffer = new Map<string, OutcomeSignal[]>();

export class QualityGate {
  // Called by ForgeSignals when an outcome event is received
  addSignal(signal: OutcomeSignal): void {
    const existing = signalBuffer.get(signal.sampleId) || [];
    existing.push(signal);
    signalBuffer.set(signal.sampleId, existing);
  }

  // Finalize scoring for a sample — call when the Titan turn is "done"
  async score(sampleId: string, sample: Partial<ForgeSample>): Promise<number> {
    const signals = signalBuffer.get(sampleId) || [];
    const scored = this.computeScore(sample, signals);

    const outcome: SampleOutcome =
      scored.final_score >= 7 ? 'success'
      : scored.final_score <= 2 ? 'failure'
      : 'unknown';

    await db.updateScore(sampleId, scored.final_score, scored, outcome);

    // Clean up signal buffer
    signalBuffer.delete(sampleId);

    return scored.final_score;
  }

  private computeScore(
    sample: Partial<ForgeSample>,
    signals: OutcomeSignal[],
  ): QualitySignals {
    const signalSet = new Set(signals.map((s) => s.type));
    const breakdown: Record<string, number> = {};

    // ── Immediate disqualifiers (score = 0) ──
    const hallucinated = signalSet.has('tool_hallucination');
    const userRejected = signalSet.has('user_rejected');
    const rolledBack = signalSet.has('git_rolled_back');
    const wrongTier = sample.model_tier !== 'frontier';

    if (hallucinated || userRejected || rolledBack || wrongTier) {
      return {
        build_fixed: false,
        debug_resolved: false,
        multifile_clean: false,
        git_committed: false,
        lint_clean: false,
        top_model: false,
        user_accepted: false,
        user_continued: false,
        hallucinated_path: hallucinated,
        user_rejected: userRejected,
        rolled_back: rolledBack,
        wrong_tier: wrongTier,
        fix_failed: false,
        pure_chat: false,
        score_breakdown: { disqualified: 0 },
        final_score: 0,
      };
    }

    // ── Positive signals ──
    const buildFixed = signalSet.has('build_passed') &&
      signals.some((s) => s.type === 'build_passed' && s.value === true);
    if (buildFixed) breakdown['build_fixed'] = 3;

    const debugResolved = signalSet.has('debug_resolved');
    if (debugResolved) breakdown['debug_resolved'] = 3;

    // Multi-file edit: 3+ edit_file tool calls in tool_calls array
    const toolCallNames = (sample.tool_calls || []).map((tc) => tc.function?.name || '');
    const editCount = toolCallNames.filter((n) => n === 'edit_file' || n === 'create_file').length;
    const multifileClean = editCount >= 3 && signalSet.has('build_passed');
    if (multifileClean) breakdown['multifile_clean'] = 2;

    const gitCommitted = signalSet.has('git_committed');
    if (gitCommitted) breakdown['git_committed'] = 2;

    const lintClean = signalSet.has('lint_clean');
    if (lintClean) breakdown['lint_clean'] = 1;

    const topModel = TOP_TIER_MODELS.has(sample.model_id || '');
    if (topModel) breakdown['top_model'] = 1;

    const userAccepted = signalSet.has('user_accepted');
    if (userAccepted) breakdown['user_accepted'] = 3;

    const userContinued = signalSet.has('user_continued');
    if (userContinued) breakdown['user_continued'] = 2;

    // ── Negative signals ──
    const fixFailed = signalSet.has('debug_failed');
    if (fixFailed) breakdown['fix_failed'] = -2;

    // Pure chat: no tool calls and no code blocks in response
    const hasToolCalls = (sample.tool_calls || []).length > 0;
    const hasCodeBlock = (sample.response || '').includes('```');
    const pureChat = !hasToolCalls && !hasCodeBlock;
    if (pureChat) breakdown['pure_chat'] = -1;

    // ── Compute final score ──
    const raw = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
    const final_score = Math.max(0, Math.min(10, raw));

    return {
      build_fixed: buildFixed,
      debug_resolved: debugResolved,
      multifile_clean: multifileClean,
      git_committed: gitCommitted,
      lint_clean: lintClean,
      top_model: topModel,
      user_accepted: userAccepted,
      user_continued: userContinued,
      hallucinated_path: false,
      user_rejected: false,
      rolled_back: false,
      wrong_tier: false,
      fix_failed: fixFailed,
      pure_chat: pureChat,
      score_breakdown: breakdown,
      final_score,
    };
  }

  // Batch re-score all unscored samples in the DB (useful for backfill)
  async rescoreUnscored(batchSize = 100): Promise<{ rescored: number; errors: number }> {
    let rescored = 0;
    let errors = 0;
    try {
      const client = new ForgeDB();
      // Get samples with score 0 that have tool_results (meaning signals came in)
      const { data } = await (client as unknown as {
        _getClient: () => {
          from: (table: string) => {
            select: (cols: string) => {
              eq: (col: string, val: unknown) => {
                not: (col: string, op: string, val: unknown) => {
                  limit: (n: number) => Promise<{ data: ForgeSample[] | null }>;
                };
              };
            };
          };
        };
      })._getClient()
        .from('forge_samples')
        .select('*')
        .eq('quality_score', 0)
        .not('tool_results', 'eq', '[]')
        .limit(batchSize) as unknown as { data: ForgeSample[] | null };

      for (const sample of data || []) {
        try {
          await this.score(sample.id, sample);
          rescored++;
        } catch {
          errors++;
        }
      }
    } catch (err) {
      console.error('[forge/quality-gate] rescoreUnscored failed:', (err as Error).message);
    }
    return { rescored, errors };
  }
}

// Singleton
export const qualityGate = new QualityGate();
