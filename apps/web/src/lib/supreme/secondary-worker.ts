import type { SupremeArtifact, SupremeConfig, SupremeTaskNode, ToolCallLogEntry } from './supreme-model';
import type { WorkerExecutionCallbacks } from './primary-worker';

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

export async function executeSecondaryWorker(
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
        'You are TITAN_CLEANUP (Secondary Worker, Llama 4 Maverick).',
        'You handle documentation, formatting, and simple transformations.',
        'Do not invent architecture changes.',
        'Return output with EXACT sections:',
        'INSPECTION EVIDENCE:',
        'CODE ARTIFACT:',
        'SELF-REVIEW:',
        'VERIFICATION HINTS:',
      ].join('\n')
    : [
        'You are TITAN_CLEANUP (Secondary Worker, Llama 4 Maverick).',
        'You handle documentation, formatting, and simple transformations.',
        'Do not invent architecture changes.',
        'No workspace is open — generate all content as complete markdown code blocks with filenames.',
        'Format: ```language:path/to/file.ext',
        'Return output with EXACT sections:',
        'INSPECTION EVIDENCE:',
        'CODE ARTIFACT:',
        'SELF-REVIEW:',
        'VERIFICATION HINTS:',
      ].join('\n');

  let fileContext = '';
  if (hasWorkspace && node.relevantFiles.length > 0) {
    const fileContents: string[] = [];
    for (const file of node.relevantFiles.slice(0, 3)) {
      try {
        const result = await callbacks.executeToolCall('read_file', { path: file });
        if (result.success && result.output) {
          fileContents.push(`--- ${file} ---\n${result.output.slice(0, 3000)}`);
          toolCallLog.push({ tool: 'read_file', args: { path: file }, success: true, result: '(read)', startedAt: Date.now(), finishedAt: Date.now() });
        }
      } catch { /* non-fatal */ }
    }
    if (fileContents.length > 0) {
      fileContext = `\n\nExisting Code Context:\n${fileContents.join('\n\n')}`;
    }
  }

  const user = [
    `Task: ${node.title}`,
    node.description,
    `Acceptance Criteria:\n- ${node.acceptanceCriteria.join('\n- ')}`,
    `Verification Criteria:\n- ${node.verificationCriteria.join('\n- ')}`,
    `Relevant files:\n- ${node.relevantFiles.join('\n- ') || '(none)'}`,
    fileContext,
  ].filter(Boolean).join('\n\n');

  const llmOutput = await callbacks.invokeModel(config.models.secondaryWorker, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  return {
    laneId,
    nodeId: node.id,
    role: 'SECONDARY_WORKER',
    model: config.models.secondaryWorker,
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
