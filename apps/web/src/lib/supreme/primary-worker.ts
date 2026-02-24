import type { SupremeArtifact, SupremeConfig, SupremeTaskNode, ToolCallLogEntry } from './supreme-model';

export interface WorkerExecutionCallbacks {
  executeToolCall: (
    tool: string,
    args: Record<string, unknown>,
  ) => Promise<{ success: boolean; output: string; error?: string }>;
  invokeModel: (
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
  ) => Promise<string>;
}

function section(text: string, heading: string) {
  const marker = `${heading}:`;
  const idx = text.indexOf(marker);
  if (idx === -1) return '';
  const tail = text.slice(idx + marker.length);
  const next = tail.search(/\n[A-Z_ ]+:/);
  return (next === -1 ? tail : tail.slice(0, next)).trim();
}

function extractFiles(text: string) {
  return Array.from(new Set(text.match(/`([^`]+\.[a-zA-Z0-9]+)`/g)?.map((m) => m.replace(/`/g, '')) || []));
}

export async function executePrimaryWorker(
  laneId: string,
  node: SupremeTaskNode,
  config: SupremeConfig,
  callbacks: WorkerExecutionCallbacks,
  hasWorkspace?: boolean,
): Promise<SupremeArtifact> {
  const startedAt = Date.now();
  const toolCallLog: ToolCallLogEntry[] = [];

  const system = hasWorkspace
    ? [
        'You are TITAN_CODER (Primary Worker, Qwen3 Coder).',
        'You do coding/refactor/test work only and must be concrete.',
        'Return output with EXACT sections:',
        'INSPECTION EVIDENCE:',
        'CODE ARTIFACT:',
        'SELF-REVIEW:',
        'VERIFICATION HINTS:',
      ].join('\n')
    : [
        'You are TITAN_CODER (Primary Worker, Qwen3 Coder).',
        'You do coding/refactor/test work only and must be concrete.',
        'No workspace is open — generate all code as complete markdown code blocks with filenames.',
        'Format: ```language:path/to/file.ext',
        'Provide FULL working implementations. No stubs or placeholders.',
        'Return output with EXACT sections:',
        'INSPECTION EVIDENCE:',
        'CODE ARTIFACT:',
        'SELF-REVIEW:',
        'VERIFICATION HINTS:',
      ].join('\n');

  const user = [
    `Task: ${node.title}`,
    node.description,
    `Acceptance Criteria:\n- ${node.acceptanceCriteria.join('\n- ')}`,
    `Verification Criteria:\n- ${node.verificationCriteria.join('\n- ')}`,
    `Relevant files:\n- ${node.relevantFiles.join('\n- ') || '(none)'}`,
  ].join('\n\n');

  const llmOutput = await callbacks.invokeModel(config.models.primaryWorker, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  return {
    laneId,
    nodeId: node.id,
    role: 'PRIMARY_WORKER',
    model: config.models.primaryWorker,
    inspectionEvidence: section(llmOutput, 'INSPECTION EVIDENCE'),
    codeChanges: section(llmOutput, 'CODE ARTIFACT'),
    selfReview: section(llmOutput, 'SELF-REVIEW'),
    verificationHints: section(llmOutput, 'VERIFICATION HINTS'),
    filesModified: extractFiles(llmOutput),
    toolCallLog,
    rawOutput: llmOutput,
    createdAt: startedAt,
  };
}
