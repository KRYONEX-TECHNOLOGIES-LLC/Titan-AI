// ── Titan Plan Sniper V2 — JUDGE Role ────────────────────────────────────────
// Uses Qwen3.5 Plus ($0.40/$2, 1M context) for final quality gate.
// Reviews the entire completed project, fills the common-sense checklist,
// and produces a final verdict.

import { callModelDirect } from '@/lib/llm-call';
import { ZERO_DEFECT_RULES_COMPACT, TASK_DECOMPOSITION_RULES_COMPACT, GIT_RULES, UNIVERSAL_COMPLETION_CHECKLIST_COMPACT } from '@/lib/shared/coding-standards';
import type {
  SniperConfig,
  SniperDAG,
  SniperLane,
  JudgeVerdict,
  SniperCostTracker,
} from './sniper-model';
import { estimateTokens } from './sniper-model';

const JUDGE_SYSTEM = `You are JUDGE, the final quality gate in the Titan Plan Sniper pipeline.
All tasks have been completed and verified. Your job is to do a holistic review of the
entire project and fill out the common-sense checklist.

REVIEW CHECKLIST CATEGORIES:
- frontend: Routes, buttons, forms, responsive, loading states, navigation
- backend: API endpoints, error handling, input validation
- database: Schema, migrations, seed data
- auth: Login/signup, protected routes, roles
- api: CORS, rate limiting
- testing: Unit tests, E2E tests
- deployment: Environment variables, production build
- ux: User feedback, empty states
- performance: Image optimization, bundle size
- security: XSS prevention, no secrets in client code
- accessibility: Alt text, keyboard navigation

OUTPUT FORMAT (JSON):
{
  "score": <1-10>,
  "pass": true/false,
  "issues": ["issue 1"],
  "checklistUpdates": [
    { "id": "cs-fe-routes", "checked": true, "notes": "All routes implemented" },
    { "id": "cs-be-api", "checked": true, "notes": "All endpoints working" }
  ],
  "summary": "Brief summary of the overall quality"
}

CHECKLIST IDs:
cs-fe-routes, cs-fe-buttons, cs-fe-forms, cs-fe-responsive, cs-fe-loading, cs-fe-nav,
cs-be-api, cs-be-error, cs-be-validation,
cs-db-schema, cs-db-seed,
cs-auth-login, cs-auth-protect, cs-auth-roles,
cs-api-cors, cs-api-rate,
cs-test-unit, cs-test-e2e,
cs-deploy-env, cs-deploy-build,
cs-ux-feedback, cs-ux-empty,
cs-perf-images, cs-perf-bundle,
cs-sec-xss, cs-sec-secrets,
cs-a11y-alt, cs-a11y-keyboard

Only mark items as checked if they are genuinely addressed by the completed tasks.
Be honest — this is the last line of defense before shipping.
Plain text only. NO emojis. NO emoji bullets. Professional, direct, technical language.

QUIZ-SKIP RULE: To skip ANY checklist item, you MUST:
1. Name 2-3 specific files/locations you checked to confirm the item is irrelevant
2. State WHY it does not apply (e.g., "No forms exist — this is a static promo site")
3. If you cannot name files you checked, the item is NOT skippable — mark it as FAILED

${UNIVERSAL_COMPLETION_CHECKLIST_COMPACT}
${TASK_DECOMPOSITION_RULES_COMPACT}
${ZERO_DEFECT_RULES_COMPACT}
${GIT_RULES}`;

export async function runJudge(
  dag: SniperDAG,
  lanes: SniperLane[],
  config: SniperConfig,
  costTracker: SniperCostTracker,
  emit: (type: string, data: Record<string, unknown>) => void,
): Promise<JudgeVerdict> {
  emit('judge_start', { model: config.models.judge, laneCount: lanes.length });

  const completedLanes = lanes.filter(l => l.status === 'VERIFIED' || l.status === 'COMPLETE');
  const failedLanes = lanes.filter(l => l.status === 'FAILED');

  const taskSummaries = completedLanes.map(lane => {
    const node = dag.nodes.find(n => n.id === lane.nodeId);
    const artifact = lane.codeArtifact;
    return [
      `### ${node?.title || lane.nodeId}`,
      `Type: ${node?.taskType} | Risk: ${node?.risk}`,
      `Files: ${artifact?.filesModified.join(', ') || 'none'}`,
      `Sentinel: ${lane.sentinelVerdict?.pass ? 'PASS' : 'FAIL'}`,
      artifact?.codeChanges ? `Code (truncated):\n${artifact.codeChanges.slice(0, 2000)}` : '',
    ].filter(Boolean).join('\n');
  });

  const userMessage = [
    `## Project: ${dag.goal}`,
    `\n## Statistics`,
    `Total tasks: ${dag.nodes.length}`,
    `Completed: ${completedLanes.length}`,
    `Failed: ${failedLanes.length}`,
    `\n## Completed Tasks\n${taskSummaries.join('\n\n---\n\n')}`,
    failedLanes.length > 0
      ? `\n## Failed Tasks\n${failedLanes.map(l => {
          const node = dag.nodes.find(n => n.id === l.nodeId);
          return `- ${node?.title || l.nodeId}: ${l.sentinelVerdict?.issues.join('; ') || 'unknown'}`;
        }).join('\n')}`
      : '',
  ].filter(Boolean).join('\n');

  const response = await callModelDirect(
    config.models.judge,
    [
      { role: 'system', content: JUDGE_SYSTEM },
      { role: 'user', content: userMessage },
    ],
    { temperature: 0.1, maxTokens: 4000 },
  );

  costTracker.record(config.models.judge, estimateTokens(userMessage), estimateTokens(response));

  try {
    const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    const raw = jsonMatch ? jsonMatch[1] : response;
    const parsed = JSON.parse(raw.trim());

    const verdict: JudgeVerdict = {
      score: Number(parsed.score) || 5,
      pass: Boolean(parsed.pass),
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
      checklistUpdates: Array.isArray(parsed.checklistUpdates)
        ? parsed.checklistUpdates.map((u: Record<string, unknown>) => ({
            id: String(u.id || ''),
            checked: Boolean(u.checked),
            notes: String(u.notes || ''),
          }))
        : [],
      summary: String(parsed.summary || ''),
    };

    emit('judge_complete', {
      score: verdict.score,
      pass: verdict.pass,
      issueCount: verdict.issues.length,
      checklistCount: verdict.checklistUpdates.length,
    });

    return verdict;
  } catch {
    const fallback: JudgeVerdict = {
      score: failedLanes.length === 0 ? 7 : 4,
      pass: failedLanes.length === 0,
      issues: failedLanes.length > 0 ? ['Some tasks failed'] : [],
      checklistUpdates: [],
      summary: `${completedLanes.length}/${dag.nodes.length} tasks completed.`,
    };
    emit('judge_complete', { score: fallback.score, pass: fallback.pass });
    return fallback;
  }
}
