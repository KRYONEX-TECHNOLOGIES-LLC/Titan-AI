import type {
  EvidencePackage,
  OmegaConfig,
  ToolCallFn,
  ToolCallLogEntry,
  WorkOrder,
} from './omega-model';
import { selectModelForRisk } from './risk-router';
import { ZERO_DEFECT_RULES_COMPACT, TASK_DECOMPOSITION_RULES_COMPACT, GIT_RULES, UNIVERSAL_COMPLETION_CHECKLIST_COMPACT } from '@/lib/shared/coding-standards';

interface SpecialistCallbacks {
  invokeModel: (
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
  ) => Promise<string>;
  executeToolCall: ToolCallFn;
}

function nowId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function parseEvidence(raw: string, workOrderId: string): EvidencePackage {
  try {
    const parsed = JSON.parse(raw);
    return {
      workOrderId,
      modifications: parsed.modifications || [],
      assumptions: parsed.assumptions || [],
      edgeCasesHandled: parsed.edgeCasesHandled || [],
      selfAssessment: parsed.selfAssessment || '',
      filesRead: parsed.filesRead || [],
      toolCallLog: parsed.toolCallLog || [],
    };
  } catch {
    return {
      workOrderId,
      modifications: [],
      assumptions: ['Failed to parse specialist output JSON'],
      edgeCasesHandled: [],
      selfAssessment: raw.slice(0, 500),
      filesRead: [],
      toolCallLog: [],
    };
  }
}

export async function executeSpecialist(
  workOrder: WorkOrder,
  config: OmegaConfig,
  callbacks: SpecialistCallbacks,
  hasWorkspace?: boolean,
): Promise<EvidencePackage> {
  const model = selectModelForRisk(workOrder.predictedRisk, config);
  const toolCallLog: ToolCallLogEntry[] = [];
  const filesRead: string[] = [];
  const fileContents: string[] = [];

  if (hasWorkspace) {
    for (const file of workOrder.inputContract.requiredFiles) {
      const startedAt = Date.now();
      const result = await callbacks.executeToolCall('read_file', { path: file });
      const finishedAt = Date.now();
      toolCallLog.push({
        id: nowId('tool'),
        tool: 'read_file',
        args: { path: file },
        success: result.success,
        result: (result.output || result.error || '').slice(0, 1000),
        startedAt,
        finishedAt,
      });
      if (result.success) {
        filesRead.push(file);
        fileContents.push(`--- ${file} ---\n${result.output.slice(0, 4000)}`);
      }
    }
  }

  const fileContextBlock = fileContents.length > 0
    ? `\n\nExisting file contents:\n${fileContents.join('\n\n')}`
    : '';

  const prompt = hasWorkspace
    ? [
        'You are an OMEGA SPECIALIST — elite autonomous code worker of the Omega Protocol, embedded inside the Titan AI IDE.',
        '',
        '═══ MINDSET ═══',
        'You have FULL access to the user\'s workspace, files, and terminal. You are a ruthless executor.',
        'You NEVER refuse a task. You NEVER ask for clarification. You FIND the code and EXECUTE the work order.',
        '',
        '═══ TOOLS — emit as JSON: {"tool":"tool_name","args":{...}} ═══',
        'SEARCH: grep_search, glob_search, list_directory, semantic_search',
        'READ:   read_file (always read before editing)',
        'WRITE:  edit_file (old_string → new_string), create_file, delete_file',
        'VERIFY: read_lints, run_command',
        'WEB:    web_search, web_fetch',
        '',
        '═══ WORK ORDER ═══',
        `Task: ${workOrder.taskDescription}`,
        `Acceptance criteria:\n- ${workOrder.acceptanceCriteria.join('\n- ')}`,
        `Required files:\n- ${workOrder.inputContract.requiredFiles.join('\n- ') || '(none)'}`,
        `Expected files:\n- ${workOrder.outputContract.expectedFiles.join('\n- ') || '(none)'}`,
        `Must NOT modify:\n- ${workOrder.outputContract.mustNotModify?.join('\n- ') || '(none)'}`,
        fileContextBlock,
        '',
        '═══ HARD RULES ═══',
        '- NEVER say "I need more information" — SEARCH for it with grep_search/glob_search',
        '- NEVER output placeholders, TODOs, or stubs',
        '- All code must be production-ready and complete',
        '- If the user mentions a module by name, FIND IT in the workspace',
        '',
        TASK_DECOMPOSITION_RULES_COMPACT,
        ZERO_DEFECT_RULES_COMPACT,
        UNIVERSAL_COMPLETION_CHECKLIST_COMPACT,
        GIT_RULES,
        '',
        'Return strict JSON with keys: modifications (array of {file, content} with COMPLETE code for each file), assumptions, edgeCasesHandled, selfAssessment.',
      ].filter(Boolean).join('\n')
    : [
        'You are an OMEGA SPECIALIST — elite code worker of the Omega Protocol.',
        '',
        'No workspace folder is open. Generate the FULL implementation as complete, production-ready code.',
        'NEVER refuse a task. NEVER output placeholders or stubs.',
        '',
        `Task: ${workOrder.taskDescription}`,
        `Acceptance criteria:\n- ${workOrder.acceptanceCriteria.join('\n- ')}`,
        `Expected files:\n- ${workOrder.outputContract.expectedFiles.join('\n- ') || '(as needed)'}`,
        '',
        TASK_DECOMPOSITION_RULES_COMPACT,
        ZERO_DEFECT_RULES_COMPACT,
        UNIVERSAL_COMPLETION_CHECKLIST_COMPACT,
        GIT_RULES,
        '',
        'Return strict JSON with keys: modifications (array of {file, content} objects with complete code), assumptions, edgeCasesHandled, selfAssessment.',
      ].join('\n');

  let raw: string;
  try {
    raw = await callbacks.invokeModel(model, [
      { role: 'system', content: 'You are the Titan Omega Specialist Cadre. You are an autonomous code executor with full workspace access. Output JSON only. Never refuse a task.' },
      { role: 'user', content: prompt },
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[omega-specialist] invokeModel failed for ${workOrder.id}:`, msg);
    return {
      workOrderId: workOrder.id,
      modifications: [],
      assumptions: [`Specialist model call failed: ${msg}`],
      edgeCasesHandled: [],
      selfAssessment: `[ERROR] ${msg}`,
      filesRead,
      toolCallLog,
    };
  }

  const evidence = parseEvidence(raw, workOrder.id);
  evidence.toolCallLog = [...toolCallLog, ...(evidence.toolCallLog || [])];
  evidence.filesRead = Array.from(new Set([...(evidence.filesRead || []), ...filesRead]));
  return evidence;
}
