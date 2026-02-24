import type {
  EvidencePackage,
  OmegaConfig,
  ToolCallFn,
  ToolCallLogEntry,
  WorkOrder,
} from './omega-model';
import { selectModelForRisk } from './risk-router';

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
      if (result.success) filesRead.push(file);
    }
  }

  const prompt = hasWorkspace
    ? [
        'You are a SPECIALIST code worker. Execute this Work Order precisely.',
        `Task: ${workOrder.taskDescription}`,
        `Acceptance criteria:\n- ${workOrder.acceptanceCriteria.join('\n- ')}`,
        `Required files:\n- ${workOrder.inputContract.requiredFiles.join('\n- ') || '(none)'}`,
        `Expected files:\n- ${workOrder.outputContract.expectedFiles.join('\n- ') || '(none)'}`,
        `Must NOT modify:\n- ${workOrder.outputContract.mustNotModify?.join('\n- ') || '(none)'}`,
        'Return strict JSON with keys: modifications, assumptions, edgeCasesHandled, selfAssessment.',
      ].join('\n\n')
    : [
        'You are a SPECIALIST code worker. Execute this Work Order precisely.',
        'No workspace folder is open. Generate the FULL implementation as complete code.',
        `Task: ${workOrder.taskDescription}`,
        `Acceptance criteria:\n- ${workOrder.acceptanceCriteria.join('\n- ')}`,
        `Expected files:\n- ${workOrder.outputContract.expectedFiles.join('\n- ') || '(as needed)'}`,
        'Return strict JSON with keys: modifications (array of {file, content} objects with complete code), assumptions, edgeCasesHandled, selfAssessment.',
      ].join('\n\n');

  const raw = await callbacks.invokeModel(model, [
    { role: 'system', content: 'You are the Titan Omega Specialist Cadre. Output JSON only.' },
    { role: 'user', content: prompt },
  ]);

  const evidence = parseEvidence(raw, workOrder.id);
  evidence.toolCallLog = [...toolCallLog, ...(evidence.toolCallLog || [])];
  evidence.filesRead = Array.from(new Set([...(evidence.filesRead || []), ...filesRead]));
  return evidence;
}
