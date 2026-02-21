import type { ExecutionPlan } from './supreme-model';
import { validateExecutionPlan, validateToolCall } from './schema-validator';

export interface OperatorCallbacks {
  executeToolCall: (
    tool: string,
    args: Record<string, unknown>,
  ) => Promise<{ success: boolean; output: string; error?: string }>;
}

export interface OperatorStepResult {
  id: string;
  tool: string;
  success: boolean;
  output: string;
  error?: string;
}

export interface OperatorExecutionResult {
  success: boolean;
  steps: OperatorStepResult[];
  rawLog: string;
}

export async function executeApprovedPlan(
  plan: ExecutionPlan,
  callbacks: OperatorCallbacks,
): Promise<OperatorExecutionResult> {
  const planValidation = validateExecutionPlan(plan);
  if (!planValidation.valid) {
    return {
      success: false,
      steps: [],
      rawLog: `Execution plan validation failed: ${(planValidation.errors || []).join('; ')}`,
    };
  }

  const stepResults: OperatorStepResult[] = [];
  for (const step of plan.steps) {
    const toolValidation = validateToolCall(step.tool, step.args);
    if (!toolValidation.valid) {
      stepResults.push({
        id: step.id,
        tool: step.tool,
        success: false,
        output: '',
        error: `Tool schema validation failed: ${(toolValidation.errors || []).join('; ')}`,
      });
      return {
        success: false,
        steps: stepResults,
        rawLog: formatRawLog(stepResults),
      };
    }

    const result = await callbacks.executeToolCall(step.tool, step.args);
    stepResults.push({
      id: step.id,
      tool: step.tool,
      success: result.success,
      output: result.output,
      error: result.error,
    });
    if (!result.success) {
      return {
        success: false,
        steps: stepResults,
        rawLog: formatRawLog(stepResults),
      };
    }
  }

  return {
    success: true,
    steps: stepResults,
    rawLog: formatRawLog(stepResults),
  };
}

export async function runTestSuite(callbacks: OperatorCallbacks): Promise<OperatorStepResult> {
  const result = await callbacks.executeToolCall('run_command', {
    command: 'npm test',
  });
  return {
    id: 'test-suite',
    tool: 'run_command',
    success: result.success,
    output: result.output,
    error: result.error,
  };
}

export function reportLogs(result: OperatorExecutionResult): string {
  return result.rawLog;
}

function formatRawLog(steps: OperatorStepResult[]) {
  return steps
    .map((step) => {
      const header = `[${step.success ? 'OK' : 'FAIL'}] ${step.tool} (${step.id})`;
      const body = step.success ? step.output : `${step.error || 'Unknown error'}\n${step.output}`;
      return `${header}\n${body}\n`;
    })
    .join('\n');
}
