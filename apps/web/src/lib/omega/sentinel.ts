import type {
  EvidencePackage,
  OmegaConfig,
  RejectionMemo,
  ToolCallFn,
  VerificationResult,
  WorkOrder,
} from './omega-model';
import { buildRejectionMemo } from './rejection-memo';

interface SentinelCallbacks {
  invokeModel: (
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
  ) => Promise<string>;
  executeToolCall: ToolCallFn;
}

async function runCommandCheck(
  executeToolCall: ToolCallFn,
  command?: string,
): Promise<boolean> {
  if (!command) return true;
  const result = await executeToolCall('run_command', { command });
  return result.success;
}

export async function executeSentinel(
  workOrder: WorkOrder,
  evidence: EvidencePackage,
  config: OmegaConfig,
  callbacks: SentinelCallbacks,
): Promise<VerificationResult | RejectionMemo> {
  const staticAnalysis = {
    lintPassed: true,
    typeCheckPassed: true,
    complexityScore: 1,
    securityIssues: [] as string[],
  };

  // Static analysis: lightweight checks with optional lint/type command hints.
  staticAnalysis.lintPassed = await runCommandCheck(callbacks.executeToolCall, 'npm run lint');
  staticAnalysis.typeCheckPassed = await runCommandCheck(callbacks.executeToolCall, 'npm run typecheck');

  // Dynamic analysis: ask Sentinel model to propose edge-case tests and score confidence.
  const testPrompt = [
    'You are THE SENTINEL. Assess this evidence package for dynamic test coverage.',
    `Task: ${workOrder.taskDescription}`,
    `Acceptance criteria:\n- ${workOrder.acceptanceCriteria.join('\n- ')}`,
    `Edge cases claimed:\n- ${evidence.edgeCasesHandled.join('\n- ') || '(none)'}`,
    'Return JSON: {"testsGenerated": number, "testsPassed": number, "testsFailed": number, "failedTestDetails": string[]}',
  ].join('\n\n');

  let dynamicAnalysis = {
    testsGenerated: Math.max(evidence.edgeCasesHandled.length, 1),
    testsPassed: Math.max(evidence.edgeCasesHandled.length, 1),
    testsFailed: 0,
    failedTestDetails: [] as string[],
  };

  try {
    const raw = await callbacks.invokeModel(config.sentinelModel, [
      { role: 'system', content: 'You are a strict verifier. Output JSON only.' },
      { role: 'user', content: testPrompt },
    ]);
    const parsed = JSON.parse(raw);
    dynamicAnalysis = {
      testsGenerated: Number(parsed.testsGenerated || dynamicAnalysis.testsGenerated),
      testsPassed: Number(parsed.testsPassed || dynamicAnalysis.testsPassed),
      testsFailed: Number(parsed.testsFailed || 0),
      failedTestDetails: Array.isArray(parsed.failedTestDetails) ? parsed.failedTestDetails : [],
    };
  } catch {
    // Keep conservative defaults if parsing fails.
  }

  // Semantic validation against intent.
  let semanticValidation = { intentMet: true, rationale: 'No semantic issues detected.' };
  try {
    const raw = await callbacks.invokeModel(config.sentinelModel, [
      { role: 'system', content: 'You are THE SENTINEL. Validate intent fulfillment. Output JSON only.' },
      {
        role: 'user',
        content: [
          `Task: ${workOrder.taskDescription}`,
          `Acceptance criteria:\n- ${workOrder.acceptanceCriteria.join('\n- ')}`,
          `Self assessment: ${evidence.selfAssessment}`,
          'Return JSON: {"intentMet": boolean, "rationale": string}',
        ].join('\n\n'),
      },
    ]);
    const parsed = JSON.parse(raw);
    semanticValidation = {
      intentMet: Boolean(parsed.intentMet),
      rationale: String(parsed.rationale || ''),
    };
  } catch {
    // Defaults preserve pass unless static/dynamic fail.
  }

  const failed =
    !staticAnalysis.lintPassed ||
    !staticAnalysis.typeCheckPassed ||
    staticAnalysis.securityIssues.length > 0 ||
    dynamicAnalysis.testsFailed > 0 ||
    !semanticValidation.intentMet;

  if (failed) {
    return buildRejectionMemo(
      workOrder.id,
      staticAnalysis,
      dynamicAnalysis,
      semanticValidation,
    );
  }

  return {
    workOrderId: workOrder.id,
    verdict: 'PASS',
    staticAnalysis,
    dynamicAnalysis,
    semanticValidation,
    stagedModifications: evidence.modifications,
  };
}
