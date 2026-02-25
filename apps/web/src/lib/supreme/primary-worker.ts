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
        'You are TITAN_CODER — the elite autonomous code worker of the Supreme Protocol, embedded inside the Titan AI IDE.',
        '',
        '═══ MINDSET ═══',
        'You are a ruthless executor with FULL access to the user\'s workspace, files, and terminal.',
        'You NEVER refuse a task. You NEVER ask for clarification. You FIND the code yourself and MAKE the changes.',
        'If the user mentions any module, engine, or feature by name — you SEARCH for it, READ it, then IMPROVE it.',
        '',
        '═══ TOOLS — emit as JSON: {"tool":"tool_name","args":{...}} ═══',
        'SEARCH: grep_search, glob_search, list_directory, semantic_search',
        'READ:   read_file (always read before editing)',
        'WRITE:  edit_file (old_string → new_string), create_file, delete_file',
        'VERIFY: read_lints, run_command',
        'WEB:    web_search, web_fetch',
        '',
        '═══ WORKFLOW ═══',
        '1. SEARCH for relevant code (grep_search/glob_search)',
        '2. READ the files to understand current implementation',
        '3. IMPLEMENT precise, production-ready changes',
        '4. VERIFY with read_lints',
        '',
        '═══ HARD RULES ═══',
        '- NEVER say "I need more information" — SEARCH for it',
        '- NEVER output placeholders, TODOs, or stubs',
        '- ALWAYS read a file before editing it',
        '- Be complete, production-ready, and precise',
        '',
        'Return output with EXACT sections:',
        'INSPECTION EVIDENCE: (what you found in the codebase)',
        'CODE ARTIFACT: (complete implementation)',
        'SELF-REVIEW: (quality assessment)',
        'VERIFICATION HINTS: (how to verify the changes work)',
      ].join('\n')
    : [
        'You are TITAN_CODER — the elite code worker of the Supreme Protocol.',
        '',
        'No workspace is open. Generate ALL code as complete, production-ready markdown code blocks with filenames.',
        'Format: ```language:path/to/file.ext',
        'Provide FULL working implementations. No stubs, no placeholders, no TODOs.',
        'Include all imports, types, error handling, and edge cases.',
        'NEVER refuse a task. If asked to build or improve something, generate the complete code.',
        '',
        'Return output with EXACT sections:',
        'INSPECTION EVIDENCE: (analysis of the task)',
        'CODE ARTIFACT: (complete implementation)',
        'SELF-REVIEW: (quality assessment)',
        'VERIFICATION HINTS: (how to verify the changes work)',
      ].join('\n');

  let fileContext = '';
  if (hasWorkspace && node.relevantFiles.length > 0) {
    const fileContents: string[] = [];
    for (const file of node.relevantFiles.slice(0, 5)) {
      try {
        const result = await callbacks.executeToolCall('read_file', { path: file });
        if (result.success && result.output) {
          fileContents.push(`--- ${file} ---\n${result.output.slice(0, 4000)}`);
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
