// ── Titan Plan Sniper — SENTINEL Role ────────────────────────────────────────
// Uses ByteDance Seed 1.6 ($0.25/$2) for deep-thinking verification.
// Checks each completed task against acceptance criteria, lint, and types.

import { callModelDirect } from '@/lib/llm-call';
import { ZERO_DEFECT_RULES_COMPACT, TASK_DECOMPOSITION_RULES_COMPACT, UNIVERSAL_COMPLETION_CHECKLIST_COMPACT } from '@/lib/shared/coding-standards';
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
Your job is to rigorously verify that a task was completed correctly. You are the last line of defense.

You receive:
1. The task specification with acceptance criteria
2. The code changes that were made
3. Any tool call results (lint, tests, etc.)

ACCEPTANCE CRITERIA VERIFICATION (most important):
- Check EVERY acceptance criterion INDIVIDUALLY. Go through them one by one.
- For each criterion, state: MET or NOT MET with a specific reason.
- A single missed or unmet acceptance criterion = automatic FAIL. No exceptions.
- Do not give partial credit. Either the criterion is fully satisfied or it is not.
- If the code "mostly" meets a criterion but has gaps, it is NOT MET.

IMPORT & TYPE VERIFICATION:
- Verify every import resolves to a real module/file. Phantom imports (importing from files that don't exist or symbols that aren't exported) = FAIL.
- Verify TypeScript types match — no implicit any, no type assertions that hide errors, no mismatched interfaces.
- Check that referenced variables, functions, and types are actually in scope where they're used.

COMPLETENESS VERIFICATION:
- Scan for placeholder code: TODOs, "implement here", empty function bodies, stub returns, hardcoded mock data meant to be replaced.
- Any placeholder code = automatic FAIL with specific location cited.
- Every function must have a real, working implementation.

GENERAL VERIFICATION CHECKLIST:
- Does the code compile/parse without errors?
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
  "criteriaDetails": [{"criterion": "<text>", "met": true/false, "reason": "<why>"}],
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion 1"]
}

Be strict. The CODER gets a retry if you fail them — it's better to catch problems now than ship broken code.
Plain text only. NO emojis. NO emoji bullets. Professional, direct, technical language.

${TASK_DECOMPOSITION_RULES_COMPACT}

${ZERO_DEFECT_RULES_COMPACT}

${UNIVERSAL_COMPLETION_CHECKLIST_COMPACT}

GIT RULES (applies to ALL Titan AI commits):
- Version lives in 3 files: package.json, apps/desktop/package.json, apps/web/package.json. ALL THREE must match.
- manifest.json is auto-updated by CI. Never edit it manually.
- Before ANY commit: verify no broken imports (every import must resolve to a real file/module).
- Before version bump: verify the code compiles. Never tag broken code.
- Commit format: "vX.Y.Z: one-line description"
- After push: verify with git log --oneline -3. After tag push: verify CI with gh run list --limit 3.
- NEVER force-push to main.`;

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
