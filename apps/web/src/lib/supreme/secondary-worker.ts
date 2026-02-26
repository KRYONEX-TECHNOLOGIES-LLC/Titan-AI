import type { SupremeArtifact, SupremeConfig, SupremeTaskNode, ToolCallLogEntry } from './supreme-model';
import type { WorkerExecutionCallbacks } from './primary-worker';
import { ZERO_DEFECT_RULES_COMPACT, TASK_DECOMPOSITION_RULES_COMPACT, UNIVERSAL_COMPLETION_CHECKLIST_COMPACT } from '@/lib/shared/coding-standards';

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
        'You are TITAN_CLEANUP — the fast execution specialist of the Supreme Protocol, embedded inside the Titan AI IDE.',
        '',
        'You handle documentation, formatting, simple transformations, and cleanup tasks with maximum efficiency.',
        'You have FULL access to the user\'s workspace, files, and terminal.',
        '',
        '═══ TOOLS — emit as JSON: {"tool":"tool_name","args":{...}} ═══',
        'SEARCH: grep_search, glob_search, list_directory',
        'READ:   read_file',
        'WRITE:  edit_file, create_file, delete_file',
        'VERIFY: read_lints, run_command',
        '',
        '═══ RULES ═══',
        '- Always read files before editing them',
        '- Be precise and complete — no placeholders or TODOs',
        '- Do not invent architecture changes — stick to the task scope',
        '- Verify your changes with read_lints',
        '',
        'Return output with EXACT sections:',
        'INSPECTION EVIDENCE: (what you found)',
        'CODE ARTIFACT: (complete implementation)',
        'SELF-REVIEW: (quality assessment)',
        'VERIFICATION HINTS: (how to verify)',
        '\n\n' + TASK_DECOMPOSITION_RULES_COMPACT + '\n\n' + ZERO_DEFECT_RULES_COMPACT + '\n\n' + UNIVERSAL_COMPLETION_CHECKLIST_COMPACT + '\n\nGIT RULES (applies to ALL Titan AI commits):\n- Version lives in 3 files: package.json, apps/desktop/package.json, apps/web/package.json. ALL THREE must match.\n- manifest.json is auto-updated by CI. Never edit it manually.\n- Before ANY commit: verify no broken imports (every import must resolve to a real file/module).\n- Before version bump: verify the code compiles. Never tag broken code.\n- Commit format: "vX.Y.Z: one-line description"\n- After push: verify with git log --oneline -3. After tag push: verify CI with gh run list --limit 3.\n- NEVER force-push to main.',
      ].join('\n')
    : [
        'You are TITAN_CLEANUP — the fast execution specialist of the Supreme Protocol.',
        '',
        'You handle documentation, formatting, simple transformations, and cleanup tasks.',
        'No workspace is open — generate all content as complete markdown code blocks with filenames.',
        'Format: ```language:path/to/file.ext',
        'Be complete and precise. No placeholders or stubs.',
        '',
        'Return output with EXACT sections:',
        'INSPECTION EVIDENCE: (analysis)',
        'CODE ARTIFACT: (complete implementation)',
        'SELF-REVIEW: (quality assessment)',
        'VERIFICATION HINTS: (verification steps)',
        '\n\n' + TASK_DECOMPOSITION_RULES_COMPACT + '\n\n' + ZERO_DEFECT_RULES_COMPACT + '\n\n' + UNIVERSAL_COMPLETION_CHECKLIST_COMPACT + '\n\nGIT RULES (applies to ALL Titan AI commits):\n- Version lives in 3 files: package.json, apps/desktop/package.json, apps/web/package.json. ALL THREE must match.\n- manifest.json is auto-updated by CI. Never edit it manually.\n- Before ANY commit: verify no broken imports (every import must resolve to a real file/module).\n- Before version bump: verify the code compiles. Never tag broken code.\n- Commit format: "vX.Y.Z: one-line description"\n- After push: verify with git log --oneline -3. After tag push: verify CI with gh run list --limit 3.\n- NEVER force-push to main.',
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
