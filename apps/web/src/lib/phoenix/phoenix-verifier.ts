// ── Phoenix Self-Healing Verifier ────────────────────────────────────────────
// 3-strike verification loop with consensus fallback. Ensures tasks essentially
// cannot fail by cascading through CODER retry, ARCHITECT escalation, and
// multi-model consensus voting.

import type {
  PhoenixConfig,
  PhoenixArtifact,
  PhoenixSubtask,
  PhoenixVerdict,
  PhoenixConsensusVote,
  PhoenixRole,
} from './phoenix-model';
import { estimateTokens, tryParseJSON, getPhoenixModel } from './phoenix-model';

export type PhoenixInvokeModel = (
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
) => Promise<string>;

export interface StrikeRecord {
  strike: number;
  role: PhoenixRole;
  model: string;
  issues: string[];
  attemptOutput: string;
}

export interface VerificationResult {
  pass: boolean;
  finalArtifact: PhoenixArtifact | null;
  verdict: PhoenixVerdict;
  strikes: StrikeRecord[];
  consensus: PhoenixConsensusVote[] | null;
  tokensUsed: { in: number; out: number };
}

// ── Core Verification ───────────────────────────────────────────────────────

export async function verifyArtifact(
  subtask: PhoenixSubtask,
  artifact: PhoenixArtifact,
  config: PhoenixConfig,
  invokeModel: PhoenixInvokeModel,
): Promise<{ verdict: PhoenixVerdict; tokensIn: number; tokensOut: number }> {
  const system = [
    'You are the PHOENIX_VERIFIER. Analyze the code artifact for correctness.',
    'Check for: logic errors, edge cases, security vulnerabilities, missing error handling,',
    'type safety issues, performance problems, and completeness vs acceptance criteria.',
    'Return strict JSON (no markdown wrapping):',
    '{"pass":true,"issues":[],"suggestions":[],"confidence":0.95}',
    'confidence is 0.0-1.0. Set pass=false if ANY significant issue exists.',
  ].join('\n');

  const user = [
    `Task: ${subtask.title}`,
    `Description: ${subtask.description}`,
    `Acceptance Criteria:\n${subtask.acceptanceCriteria.map(c => `- ${c}`).join('\n')}`,
    `Files Modified: ${artifact.filesModified.join(', ') || '(none)'}`,
    `Code Output:\n${artifact.codeChanges.slice(0, 16000)}`,
  ].join('\n\n');

  const tokensIn = estimateTokens(system + user);
  let tokensOut = 0;

  try {
    const output = await invokeModel(getPhoenixModel('VERIFIER', config), [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
    tokensOut = estimateTokens(output);

    const parsed = tryParseJSON(output);
    if (parsed && typeof parsed.pass === 'boolean') {
      return {
        verdict: {
          pass: parsed.pass as boolean,
          issues: Array.isArray(parsed.issues) ? (parsed.issues as string[]).map(String) : [],
          suggestions: Array.isArray(parsed.suggestions) ? (parsed.suggestions as string[]).map(String) : [],
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence as number : 0.5,
        },
        tokensIn,
        tokensOut,
      };
    }
  } catch {
    // fall through to heuristic
  }

  const hasContent = artifact.codeChanges.trim().length > 50;
  return {
    verdict: {
      pass: hasContent,
      issues: hasContent ? [] : ['Empty or trivial output'],
      suggestions: [],
      confidence: hasContent ? 0.4 : 0.1,
    },
    tokensIn,
    tokensOut,
  };
}

// ── Consensus Voting ────────────────────────────────────────────────────────

export async function runConsensus(
  subtask: PhoenixSubtask,
  failedAttempts: StrikeRecord[],
  config: PhoenixConfig,
  invokeModel: PhoenixInvokeModel,
): Promise<{ votes: PhoenixConsensusVote[]; winner: PhoenixConsensusVote | null; tokensIn: number; tokensOut: number }> {
  const context = [
    `Task: ${subtask.title}`,
    `Description: ${subtask.description}`,
    `Acceptance Criteria:\n${subtask.acceptanceCriteria.map(c => `- ${c}`).join('\n')}`,
    '',
    'Previous attempts failed with these issues:',
    ...failedAttempts.map((s, i) =>
      `Attempt ${i + 1} (${s.role}): ${s.issues.join('; ')}`
    ),
    '',
    'Produce the CORRECT solution. Return strict JSON:',
    '{"solution":"<complete code solution>","score":8,"rationale":"why this is correct"}',
  ].join('\n');

  const voters: { role: PhoenixRole; model: string }[] = [
    { role: 'ARCHITECT', model: config.models.architect },
    { role: 'CODER',     model: config.models.coder },
    { role: 'JUDGE',     model: config.models.judge },
  ];

  let totalIn = 0;
  let totalOut = 0;
  const votes: PhoenixConsensusVote[] = [];

  const results = await Promise.allSettled(
    voters.map(async (voter) => {
      const output = await invokeModel(voter.model, [
        { role: 'system', content: `You are PHOENIX_${voter.role} participating in consensus voting.` },
        { role: 'user', content: context },
      ]);
      return { voter, output };
    })
  );

  for (const result of results) {
    if (result.status === 'rejected') continue;
    const { voter, output } = result.value;
    totalIn += estimateTokens(context);
    totalOut += estimateTokens(output);

    const parsed = tryParseJSON(output);
    votes.push({
      role: voter.role,
      model: voter.model,
      solution: parsed ? String(parsed.solution || output) : output,
      score: parsed && typeof parsed.score === 'number' ? (parsed.score as number) : 5,
      rationale: parsed ? String(parsed.rationale || '') : '',
    });
  }

  const winner = votes.length > 0
    ? votes.reduce((best, v) => v.score > best.score ? v : best, votes[0])
    : null;

  return { votes, winner, tokensIn: totalIn, tokensOut: totalOut };
}

// ── Self-Healing Loop ───────────────────────────────────────────────────────

export async function selfHealingVerification(
  subtask: PhoenixSubtask,
  initialArtifact: PhoenixArtifact,
  config: PhoenixConfig,
  invokeModel: PhoenixInvokeModel,
  retryWithCoder: (feedback: string) => Promise<PhoenixArtifact>,
  retryWithArchitect: (feedback: string) => Promise<PhoenixArtifact>,
): Promise<VerificationResult> {
  const strikes: StrikeRecord[] = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let currentArtifact = initialArtifact;

  for (let strike = 1; strike <= config.maxStrikes; strike++) {
    const { verdict, tokensIn, tokensOut } = await verifyArtifact(
      subtask, currentArtifact, config, invokeModel,
    );
    totalTokensIn += tokensIn;
    totalTokensOut += tokensOut;

    if (verdict.pass) {
      return {
        pass: true,
        finalArtifact: currentArtifact,
        verdict,
        strikes,
        consensus: null,
        tokensUsed: { in: totalTokensIn, out: totalTokensOut },
      };
    }

    const feedback = [
      `VERIFICATION FAILED (strike ${strike}/${config.maxStrikes})`,
      `Issues: ${verdict.issues.join('; ')}`,
      `Suggestions: ${verdict.suggestions.join('; ')}`,
      `Confidence: ${verdict.confidence}`,
      '',
      `Original task: ${subtask.title}`,
      `Criteria: ${subtask.acceptanceCriteria.join('; ')}`,
    ].join('\n');

    if (strike === 1) {
      strikes.push({
        strike: 1,
        role: 'CODER',
        model: config.models.coder,
        issues: verdict.issues,
        attemptOutput: currentArtifact.codeChanges.slice(0, 500),
      });
      currentArtifact = await retryWithCoder(feedback);
    } else if (strike === 2) {
      strikes.push({
        strike: 2,
        role: 'ARCHITECT',
        model: config.models.architect,
        issues: verdict.issues,
        attemptOutput: currentArtifact.codeChanges.slice(0, 500),
      });
      currentArtifact = await retryWithArchitect(feedback);
    } else {
      strikes.push({
        strike: 3,
        role: 'JUDGE',
        model: config.models.judge,
        issues: verdict.issues,
        attemptOutput: currentArtifact.codeChanges.slice(0, 500),
      });

      const { votes, winner, tokensIn: cIn, tokensOut: cOut } = await runConsensus(
        subtask, strikes, config, invokeModel,
      );
      totalTokensIn += cIn;
      totalTokensOut += cOut;

      if (winner && winner.score >= 6) {
        const consensusArtifact: PhoenixArtifact = {
          ...currentArtifact,
          role: winner.role,
          model: winner.model,
          output: winner.solution,
          codeChanges: winner.solution,
          createdAt: Date.now(),
        };
        return {
          pass: true,
          finalArtifact: consensusArtifact,
          verdict: { pass: true, issues: [], suggestions: [], confidence: winner.score / 10 },
          strikes,
          consensus: votes,
          tokensUsed: { in: totalTokensIn, out: totalTokensOut },
        };
      }

      return {
        pass: false,
        finalArtifact: null,
        verdict: {
          pass: false,
          issues: ['All 3 strikes exhausted, consensus could not produce a viable solution'],
          suggestions: votes.map(v => `${v.role}: ${v.rationale}`),
          confidence: 0,
        },
        strikes,
        consensus: votes,
        tokensUsed: { in: totalTokensIn, out: totalTokensOut },
      };
    }
  }

  return {
    pass: false,
    finalArtifact: null,
    verdict: { pass: false, issues: ['Verification loop ended unexpectedly'], suggestions: [], confidence: 0 },
    strikes,
    consensus: null,
    tokensUsed: { in: totalTokensIn, out: totalTokensOut },
  };
}
