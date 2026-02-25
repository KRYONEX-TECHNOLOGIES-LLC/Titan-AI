// ── Titan Plan Sniper — SENTINEL Role ────────────────────────────────────────
// Uses ByteDance Seed 1.6 ($0.25/$2) for deep-thinking verification.
// Checks each completed task against acceptance criteria, lint, and types.

import { callModelDirect } from '@/lib/llm-call';
import type {
  SniperConfig,
  SniperDAGNode,
  CodeArtifact,
  SentinelVerdict,
  ToolCallLog,
  SniperCostTracker,
} from './sniper-model';
import { estimateTokens } from './sniper-model';

const SENTINEL_SYSTEM = `You are SENTINEL, the verification agent in the Titan Plan Sniper pipeline.
Your job is to rigorously verify that a task was completed correctly.

You receive:
1. The task specification with acceptance criteria
2. The code changes that were made
3. Any tool call results (lint, tests, etc.)

VERIFICATION CHECKLIST:
- Does the code compile/parse without errors?
- Are all acceptance criteria met?
- Does the code follow the specified conventions?
- Are there edge cases not handled?
- Are there security issues (XSS, injection, exposed secrets)?
- Is error handling present and correct?
- Are TypeScript types used properly (no any unless justified)?

OUTPUT FORMAT (JSON):
{
  "pass": true/false,
  "lintPassed": true/false,
  "typeCheckPassed": true/false,
  "criteriaMetCount": <number>,
  "criteriaTotalCount": <number>,
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion 1"]
}

Be strict but fair. Only fail if there are genuine problems, not style preferences.`;

export async function runSentinel(
  node: SniperDAGNode,
  artifact: CodeArtifact,
  toolCallResults: ToolCallLog[],
  config: SniperConfig,
  costTracker: SniperCostTracker,
): Promise<SentinelVerdict> {
  const userMessage = [
    `## Task: ${node.title}`,
    `Type: ${node.taskType} | Risk: ${node.risk}`,
    `\n## Acceptance Criteria\n${node.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
    `\n## Code Changes Made\n${artifact.codeChanges.slice(0, 10000)}`,
    `\n## Files Modified: ${artifact.filesModified.join(', ')}`,
    `\n## Tool Call Results\n${toolCallResults.map(tc =>
      `${tc.tool}: ${tc.success ? 'OK' : 'FAIL'} — ${tc.result.slice(0, 200)}`
    ).join('\n')}`,
  ].join('\n');

  const response = await callModelDirect(
    config.models.sentinel,
    [
      { role: 'system', content: SENTINEL_SYSTEM },
      { role: 'user', content: userMessage },
    ],
    { temperature: 0.1, maxTokens: 3000 },
  );

  costTracker.record(config.models.sentinel, estimateTokens(userMessage), estimateTokens(response));

  try {
    const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    const raw = jsonMatch ? jsonMatch[1] : response;
    const parsed = JSON.parse(raw.trim());
    return {
      pass: Boolean(parsed.pass),
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
      lintPassed: Boolean(parsed.lintPassed ?? true),
      typeCheckPassed: Boolean(parsed.typeCheckPassed ?? true),
      criteriaMetCount: Number(parsed.criteriaMetCount || 0),
      criteriaTotalCount: Number(parsed.criteriaTotalCount || node.acceptanceCriteria.length),
    };
  } catch {
    const hasFailure = toolCallResults.some(tc => !tc.success);
    return {
      pass: !hasFailure,
      issues: hasFailure ? ['Some tool calls failed'] : [],
      suggestions: [],
      lintPassed: true,
      typeCheckPassed: true,
      criteriaMetCount: 0,
      criteriaTotalCount: node.acceptanceCriteria.length,
    };
  }
}
