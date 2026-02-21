import type { SupremeArtifact, SupremeConfig, SupremeTaskNode } from './supreme-model';
import { executePrimaryWorker } from './primary-worker';

interface AuditCallbacks {
  executeToolCall: (
    tool: string,
    args: Record<string, unknown>,
  ) => Promise<{ success: boolean; output: string; error?: string }>;
  invokeModel: (
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
  ) => Promise<string>;
}

export interface FormalCheckResult {
  passed: boolean;
  outputs: Array<{ command: string; success: boolean; output: string }>;
}

export interface AuditResult {
  artifactA: SupremeArtifact;
  artifactB: SupremeArtifact;
  verdict: {
    winner: 'artifactA' | 'artifactB' | 'synthesized';
    rationale: string;
  };
  formalChecksA: FormalCheckResult;
  formalChecksB: FormalCheckResult;
}

export async function generateDualImplementations(
  laneId: string,
  node: SupremeTaskNode,
  config: SupremeConfig,
  callbacks: AuditCallbacks,
): Promise<[SupremeArtifact, SupremeArtifact]> {
  const [artifactA, artifactB] = await Promise.all([
    executePrimaryWorker(`${laneId}-a`, node, config, callbacks),
    executePrimaryWorker(`${laneId}-b`, node, config, callbacks),
  ]);
  return [artifactA, artifactB];
}

export async function conductDebate(
  artifactA: SupremeArtifact,
  artifactB: SupremeArtifact,
  node: SupremeTaskNode,
  config: SupremeConfig,
  callbacks: AuditCallbacks,
) {
  const prompt = [
    `Task: ${node.title}`,
    'Compare two implementations and pick winner or synthesized approach.',
    `Artifact A:\n${artifactA.codeChanges.slice(0, 8000)}`,
    `Artifact B:\n${artifactB.codeChanges.slice(0, 8000)}`,
    'Return strict JSON: {"winner":"artifactA|artifactB|synthesized","rationale":"..."}',
  ].join('\n\n');

  const output = await callbacks.invokeModel(config.models.overseer, [
    { role: 'system', content: 'You are the Overseer. Critique both implementations adversarially.' },
    { role: 'user', content: prompt },
  ]);

  try {
    const parsed = JSON.parse(output);
    if (parsed.winner && parsed.rationale) {
      return {
        winner: parsed.winner as 'artifactA' | 'artifactB' | 'synthesized',
        rationale: String(parsed.rationale),
      };
    }
  } catch {
    // fall through
  }

  return {
    winner: 'synthesized' as const,
    rationale: output.slice(0, 1000) || 'Overseer selected synthesized approach.',
  };
}

export async function runFormalChecks(callbacks: AuditCallbacks): Promise<FormalCheckResult> {
  const commands = ['npm run -s typecheck', 'npm run -s lint', 'npm test'];
  const outputs: Array<{ command: string; success: boolean; output: string }> = [];
  for (const command of commands) {
    const res = await callbacks.executeToolCall('run_command', { command });
    outputs.push({ command, success: res.success, output: res.output || res.error || '' });
    if (!res.success) return { passed: false, outputs };
  }
  return { passed: true, outputs };
}

export async function runAdversarialAudit(
  laneId: string,
  node: SupremeTaskNode,
  config: SupremeConfig,
  callbacks: AuditCallbacks,
): Promise<AuditResult> {
  const [artifactA, artifactB] = await generateDualImplementations(laneId, node, config, callbacks);
  const [formalChecksA, formalChecksB] = await Promise.all([
    runFormalChecks(callbacks),
    runFormalChecks(callbacks),
  ]);
  const verdict = await conductDebate(artifactA, artifactB, node, config, callbacks);
  return { artifactA, artifactB, verdict, formalChecksA, formalChecksB };
}
