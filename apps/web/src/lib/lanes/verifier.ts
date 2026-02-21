/**
 * Titan Protocol v2 — Verifier (Ruthless Verifier) Agent
 *
 * Executes adversarial verification on a single lane's Worker output.
 * The Verifier's default assumption: the artifact is broken.
 * The burden of proof is on the artifact to demonstrate correctness.
 *
 * From ruthless-verifier.md:
 *   - PASS with zero findings = only acceptable passing output
 *   - PASS with findings = contradiction, treated as FAIL
 *   - CRITICAL finding = instant FAIL
 *   - 2+ MAJOR findings = FAIL
 *   - Verifier NEVER suggests fixes
 *   - Verifier NEVER reads previous verification results
 */

import type { Lane, VerifierArtifact, VerifierFinding, ChecklistResult } from './lane-model';
import { laneStore } from './lane-store';
import { MODEL_REGISTRY } from '@/lib/model-registry';

// ─── 19-Item Checklist ──────────────────────────────────────────────────────

const CHECKLIST_ITEMS = [
  { id: 'S1', category: 'Security', label: 'Input Validation', description: 'All external inputs validated before use' },
  { id: 'S2', category: 'Security', label: 'Credential Safety', description: 'No API keys, tokens, passwords hardcoded in source' },
  { id: 'S3', category: 'Security', label: 'Injection Prevention', description: 'No SQL injection, XSS, command injection, or path traversal' },
  { id: 'S4', category: 'Security', label: 'Sensitive Data', description: 'No passwords, tokens, PII logged to console/files' },
  { id: 'C1', category: 'Correctness', label: 'Solves the Problem', description: 'Code actually implements what the subtask specifies' },
  { id: 'C2', category: 'Correctness', label: 'Null Safety', description: 'All function boundaries handle null/undefined gracefully' },
  { id: 'C3', category: 'Correctness', label: 'Empty Collections', description: 'Empty arrays/maps/sets handled correctly' },
  { id: 'C4', category: 'Correctness', label: 'Boundary Inputs', description: 'Max-size inputs don\'t cause overflow, OOM, or infinite loops' },
  { id: 'C5', category: 'Correctness', label: 'Concurrency Safety', description: 'Concurrent access guarded if applicable' },
  { id: 'K1', category: 'Completeness', label: 'No TODOs', description: 'Zero TODO, FIXME, HACK, or XXX comments' },
  { id: 'K2', category: 'Completeness', label: 'No Stubs', description: 'No functions returning hardcoded values or throw "not implemented"' },
  { id: 'K3', category: 'Completeness', label: 'No Hardcoded Config', description: 'URLs, ports, API endpoints are configurable' },
  { id: 'K4', category: 'Completeness', label: 'Error Handling', description: 'Every I/O boundary has try/catch or equivalent' },
  { id: 'A1', category: 'Architecture', label: 'Memory Consistency', description: 'Code doesn\'t contradict active decisions in memory.md' },
  { id: 'A2', category: 'Architecture', label: 'Approved Dependencies', description: 'No new dependencies without Supervisor approval' },
  { id: 'A3', category: 'Architecture', label: 'File Structure', description: 'New files in correct directories per conventions' },
  { id: 'P1', category: 'Performance', label: 'Algorithmic Efficiency', description: 'No O(n^2) where O(n) or O(n log n) is achievable' },
  { id: 'P2', category: 'Performance', label: 'No Redundant I/O', description: 'No duplicate network/file/DB calls for same data' },
  { id: 'P3', category: 'Performance', label: 'Resource Cleanup', description: 'All file handles, connections, listeners properly closed' },
];

// ─── Verifier System Prompt ─────────────────────────────────────────────────

function buildVerifierSystemPrompt(lane: Lane): string {
  const artifact = lane.artifacts.workerOutput;
  if (!artifact) throw new Error(`No worker artifact for lane ${lane.lane_id}`);

  return `You are the Ruthless Verifier operating under the Titan Governance Protocol v2.

"I have read and I am bound by the Titan Governance Protocol."

=== YOUR PHILOSOPHICAL MANDATE ===
You are NOT trying to find a way to PASS the artifact.
You ARE trying to find a reason to FAIL it.
Default assumption: The artifact is broken.
The burden of proof is on the artifact to demonstrate correctness.

=== LANE BEING VERIFIED ===
Lane ID: ${lane.lane_id}
Subtask: ${lane.spec.title}
Description: ${lane.spec.description}

Success Criteria:
${lane.spec.successCriteria.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}

Verification Criteria:
${lane.spec.verificationCriteria.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}

=== WORKER OUTPUT TO VERIFY ===

### INSPECTION EVIDENCE
${artifact.inspectionEvidence || '(none provided)'}

### CODE ARTIFACT
${artifact.codeChanges || '(none provided)'}

### SELF-REVIEW
${artifact.selfReview || '(none provided)'}

### VERIFICATION HINTS (from the Coder)
${artifact.verificationHints || '(none provided)'}

### FILES MODIFIED
${artifact.filesModified.map(f => `  - ${f.filePath}${f.startLine ? `:${f.startLine}-${f.endLine}` : ''}`).join('\n') || '(none)'}

### TOOL CALL SUMMARY
${artifact.toolCallLog.slice(0, 20).map(t => `  ${t.tool}(${JSON.stringify(t.args).slice(0, 100)}) → ${t.success ? 'OK' : 'FAIL'}`).join('\n') || '(none)'}

=== THE 19-ITEM CHECKLIST (You MUST check every item) ===

SECURITY:
${CHECKLIST_ITEMS.filter(c => c.category === 'Security').map(c => `  ${c.id}: ${c.label} — FAIL if: ${c.description} is violated`).join('\n')}

CORRECTNESS:
${CHECKLIST_ITEMS.filter(c => c.category === 'Correctness').map(c => `  ${c.id}: ${c.label} — FAIL if: ${c.description} is violated`).join('\n')}

COMPLETENESS:
${CHECKLIST_ITEMS.filter(c => c.category === 'Completeness').map(c => `  ${c.id}: ${c.label} — FAIL if: ${c.description} is violated`).join('\n')}

ARCHITECTURE:
${CHECKLIST_ITEMS.filter(c => c.category === 'Architecture').map(c => `  ${c.id}: ${c.label} — FAIL if: ${c.description} is violated`).join('\n')}

PERFORMANCE:
${CHECKLIST_ITEMS.filter(c => c.category === 'Performance').map(c => `  ${c.id}: ${c.label} — FAIL if: ${c.description} is violated`).join('\n')}

=== OUTPUT FORMAT (STRICT) ===

Line 1: PASS or FAIL (nothing else on this line)

Then:
## FINDINGS
[Issue #1]
- Severity: CRITICAL | MAJOR | MINOR
- Location: [exact file:line or section]
- Description: [what is wrong]

(repeat for each issue found)

## CHECKLIST RESULTS
For each of the 19 items, state: [ID] PASS or [ID] FAIL with brief evidence.

## RATIONALE
[Overall explanation of the verdict]

=== CRITICAL RULES ===
1. A PASS with zero findings is the ONLY acceptable passing output.
2. A PASS with findings is a contradiction and will be treated as FAIL.
3. Any CRITICAL finding = FAIL.
4. Any 2+ MAJOR findings = FAIL.
5. MINOR findings alone do not cause FAIL but must be reported.
6. You must NEVER suggest fixes. You find problems. The Coder fixes problems.
7. You must NEVER approve with caveats. Either it passes all checks or it fails.
8. You must NEVER read previous verification results. Each verification is independent.
9. Include evidence: which files you checked, specific lines examined.`;
}

// ─── LLM Call ───────────────────────────────────────────────────────────────

function envValue(...names: string[]): string {
  for (const name of names) {
    const raw = process.env[name];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return '';
}

function resolveProviderModelId(modelId: string): string {
  const entry = MODEL_REGISTRY.find(m => m.id === modelId);
  return entry?.providerModelId || modelId;
}

async function callLLM(
  messages: Array<{ role: string; content: string }>,
  modelId: string,
): Promise<string> {
  const openRouterKey = envValue('OPENROUTER_API_KEY');
  const litellmBase = envValue('TITAN_LITELLM_BASE_URL', 'LITELLM_PROXY_URL');
  const litellmKey = envValue('TITAN_LITELLM_API_KEY', 'LITELLM_MASTER_KEY');

  let apiUrl: string;
  let headers: Record<string, string>;
  const providerModelId = resolveProviderModelId(modelId);

  if (openRouterKey) {
    apiUrl = (envValue('OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1') + '/chat/completions';
    headers = {
      'Authorization': `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://titan-ai.up.railway.app',
      'X-Title': 'Titan AI - Verifier Lane',
    };
  } else if (litellmBase) {
    apiUrl = litellmBase.replace(/\/$/, '') + '/chat/completions';
    headers = {
      'Content-Type': 'application/json',
      ...(litellmKey ? { 'Authorization': `Bearer ${litellmKey}` } : {}),
    };
  } else {
    throw new Error('No LLM provider configured');
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: providerModelId,
      messages,
      temperature: 0,
      max_tokens: 16000,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Verifier LLM call failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ─── Verifier Execution ─────────────────────────────────────────────────────

export async function executeVerifierLane(lane: Lane): Promise<VerifierArtifact> {
  const startTime = Date.now();

  if (!lane.artifacts.workerOutput) {
    throw new Error(`Cannot verify lane ${lane.lane_id}: no worker artifact`);
  }

  laneStore.transitionLane(lane.lane_id, 'VERIFYING', 'verifier', 'Verification started');

  const systemPrompt = buildVerifierSystemPrompt(lane);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Verify this artifact now. Apply the full 19-item checklist. Return your verdict.' },
  ];

  const rawOutput = await callLLM(messages, lane.verifier_model_id);
  const endTime = Date.now();

  const artifact = parseVerifierOutput(rawOutput);

  laneStore.updateArtifacts(lane.lane_id, { verifierReport: artifact });
  laneStore.updateMetrics(lane.lane_id, {
    verifierDurationMs: endTime - startTime,
  });

  if (artifact.verdict === 'PASS') {
    laneStore.transitionLane(lane.lane_id, 'VERIFIED', 'verifier', 'Verification PASSED with zero findings');
  } else {
    laneStore.transitionLane(lane.lane_id, 'REJECTED', 'verifier', `Verification FAILED: ${artifact.rationale.slice(0, 200)}`, {
      findingsCount: artifact.findings.length,
      criticalCount: artifact.findings.filter(f => f.severity === 'CRITICAL').length,
      majorCount: artifact.findings.filter(f => f.severity === 'MAJOR').length,
    });
  }

  return artifact;
}

// ─── Output Parser ──────────────────────────────────────────────────────────

function parseVerifierOutput(raw: string): VerifierArtifact {
  const lines = raw.split('\n');
  const firstLine = lines[0]?.trim().toUpperCase() || '';

  let verdict: 'PASS' | 'FAIL';
  if (firstLine === 'PASS') {
    verdict = 'PASS';
  } else if (firstLine === 'FAIL') {
    verdict = 'FAIL';
  } else if (firstLine.startsWith('PASS')) {
    verdict = 'PASS';
  } else {
    verdict = 'FAIL';
  }

  const findings = parseFindings(raw);
  const checklistResults = parseChecklist(raw);
  const rationale = parseRationale(raw);

  // Enforce: PASS with findings is treated as FAIL
  if (verdict === 'PASS' && findings.length > 0) {
    verdict = 'FAIL';
  }

  // Enforce: any CRITICAL = FAIL
  if (findings.some(f => f.severity === 'CRITICAL')) {
    verdict = 'FAIL';
  }

  // Enforce: 2+ MAJOR = FAIL
  if (findings.filter(f => f.severity === 'MAJOR').length >= 2) {
    verdict = 'FAIL';
  }

  return { verdict, findings, rationale, rawOutput: raw, checklistResults };
}

function parseFindings(raw: string): VerifierFinding[] {
  const findings: VerifierFinding[] = [];
  const findingsSection = raw.match(/##?\s*FINDINGS([\s\S]*?)(?=##?\s*(?:CHECKLIST|RATIONALE)|$)/i);
  if (!findingsSection) return findings;

  const text = findingsSection[1];
  const issueBlocks = text.split(/\[Issue\s*#?\d+\]/i).filter(b => b.trim());

  let counter = 0;
  for (const block of issueBlocks) {
    counter++;
    const severityMatch = block.match(/Severity:\s*(CRITICAL|MAJOR|MINOR)/i);
    const locationMatch = block.match(/Location:\s*(.+)/i);
    const descriptionMatch = block.match(/Description:\s*([\s\S]*?)(?=\n-\s|$)/i);

    if (severityMatch) {
      findings.push({
        id: `finding-${counter}`,
        severity: severityMatch[1].toUpperCase() as VerifierFinding['severity'],
        location: locationMatch?.[1]?.trim() || 'unknown',
        description: descriptionMatch?.[1]?.trim() || block.trim().slice(0, 200),
      });
    }
  }

  return findings;
}

function parseChecklist(raw: string): ChecklistResult[] {
  const results: ChecklistResult[] = [];
  const checklistSection = raw.match(/##?\s*CHECKLIST\s*RESULTS?([\s\S]*?)(?=##?\s*RATIONALE|$)/i);
  if (!checklistSection) return results;

  for (const item of CHECKLIST_ITEMS) {
    const pattern = new RegExp(`\\[?${item.id}\\]?\\s*(PASS|FAIL)`, 'i');
    const match = checklistSection[1].match(pattern);
    results.push({
      checkId: item.id,
      label: item.label,
      passed: match ? match[1].toUpperCase() === 'PASS' : true,
      evidence: match ? match.input?.slice(match.index || 0, (match.index || 0) + 200).trim() : undefined,
    });
  }

  return results;
}

function parseRationale(raw: string): string {
  const rationaleSection = raw.match(/##?\s*RATIONALE([\s\S]*?)$/i);
  return rationaleSection?.[1]?.trim() || 'No rationale provided';
}
