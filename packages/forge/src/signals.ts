// ── Titan Forge — Signal Detector ──
// Detects outcome signals from tool results and user messages.
// Feeds into the Quality Gate scorer.
// Used by useChat.ts to report what happened after each model turn.

import { qualityGate } from './quality-gate.js';
import type { OutcomeSignal, SignalType } from './types.js';

// Positive user words that indicate acceptance
const ACCEPTANCE_WORDS = [
  'perfect', 'exactly', 'great', 'nice', 'awesome', 'works', 'worked',
  'good', 'excellent', 'correct', 'yes', 'thanks', 'thank you', 'love it',
  'fire', 'clean', 'solid', 'nailed it', 'that did it',
];

// Rejection words that indicate the user is unhappy
const REJECTION_WORDS = [
  'no', 'wrong', 'nope', 'try again', 'thats wrong', "that's wrong",
  'not right', 'incorrect', 'broken', 'didnt work', "didn't work",
  'still broken', 'same error', 'not working', 'failed', 'doesnt work',
];

function emit(sampleId: string, type: SignalType, value: boolean | number | string): void {
  const signal: OutcomeSignal = { sampleId, type, value, timestamp: Date.now() };
  qualityGate.addSignal(signal);
}

export class ForgeSignals {
  // ── Called from useChat.ts tool result handler ──

  reportRunCommand(opts: {
    sampleId: string;
    command: string;
    exitCode: number;
    prevExitCode?: number;
  }): void {
    if (!opts.sampleId) return;
    // Build passed: exit code 0
    if (opts.exitCode === 0) {
      emit(opts.sampleId, 'build_passed', true);
    } else {
      emit(opts.sampleId, 'build_failed', true);
    }
    // Build was fixed: was failing before, now passing
    if (opts.prevExitCode !== undefined && opts.prevExitCode !== 0 && opts.exitCode === 0) {
      emit(opts.sampleId, 'build_passed', true);
    }
  }

  reportLintResult(opts: {
    sampleId: string;
    errorCount: number;
  }): void {
    if (!opts.sampleId) return;
    if (opts.errorCount === 0) {
      emit(opts.sampleId, 'lint_clean', true);
    } else {
      emit(opts.sampleId, 'lint_errors', opts.errorCount);
    }
  }

  reportGitCommit(opts: {
    sampleId: string;
    success: boolean;
  }): void {
    if (!opts.sampleId) return;
    if (opts.success) {
      emit(opts.sampleId, 'git_committed', true);
    }
  }

  reportCheckpointRestore(opts: { sampleId: string }): void {
    if (!opts.sampleId) return;
    emit(opts.sampleId, 'git_rolled_back', true);
  }

  reportDebugResult(opts: {
    sampleId: string;
    resolved: boolean;
  }): void {
    if (!opts.sampleId) return;
    emit(opts.sampleId, opts.resolved ? 'debug_resolved' : 'debug_failed', opts.resolved);
  }

  reportToolHallucination(opts: { sampleId: string; path: string }): void {
    if (!opts.sampleId) return;
    emit(opts.sampleId, 'tool_hallucination', opts.path);
  }

  // ── Called from useChat.ts user message handler ──

  reportUserMessage(opts: {
    sampleId: string;
    message: string;
    timeSinceTurnMs: number;
  }): void {
    if (!opts.sampleId) return;
    const lower = opts.message.toLowerCase().trim();

    // Immediate rejection: quick message with rejection words
    const isQuick = opts.timeSinceTurnMs < 15_000;
    const hasRejection = REJECTION_WORDS.some((w) => lower.includes(w));
    if (isQuick && hasRejection) {
      emit(opts.sampleId, 'user_rejected', opts.message.slice(0, 200));
      return;
    }

    // Acceptance: positive words
    const hasAcceptance = ACCEPTANCE_WORDS.some((w) => lower.includes(w));
    if (hasAcceptance) {
      emit(opts.sampleId, 'user_accepted', opts.message.slice(0, 200));
      return;
    }

    // Implicit continuation: user sent a new task message without complaining
    // Signals they accepted the previous output and moved on
    if (opts.timeSinceTurnMs > 5_000 && !hasRejection) {
      emit(opts.sampleId, 'user_continued', true);
    }
  }

  // ── Finalize: trigger quality gate scoring after turn completes ──
  async finalizeSample(
    sampleId: string,
    samplePartial: { model_id?: string; model_tier?: string; tool_calls?: unknown[]; response?: string },
  ): Promise<number> {
    if (!sampleId) return 0;
    return qualityGate.score(sampleId, samplePartial as Parameters<typeof qualityGate.score>[1]);
  }
}

// Singleton used by useChat.ts
export const forgeSignals = new ForgeSignals();
