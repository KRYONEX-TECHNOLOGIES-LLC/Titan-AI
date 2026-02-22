import type { ExecutionResult, OmegaConfig, SignedExecutionPlan, ToolCallFn } from './omega-model';
import { verifyPlanSignature } from './execution-plan';

interface OperatorCallbacks {
  executeToolCall: ToolCallFn;
  onEvent?: (type: string, payload: Record<string, unknown>) => void;
}

export async function executeSignedPlan(
  plan: SignedExecutionPlan,
  _config: OmegaConfig,
  callbacks: OperatorCallbacks,
): Promise<ExecutionResult> {
  if (!verifyPlanSignature(plan)) {
    return {
      success: false,
      stepsExecuted: 0,
      failedStepId: 'signature',
      results: [],
    };
  }

  const results: ExecutionResult['results'] = [];
  for (const step of plan.steps) {
    callbacks.onEvent?.('plan_step_started', {
      stepId: step.stepId,
      tool: step.tool,
      sourceWorkOrderId: step.sourceWorkOrderId,
    });

    const result = await callbacks.executeToolCall(step.tool, step.args);
    results.push({
      stepId: step.stepId,
      tool: step.tool,
      success: result.success,
      output: result.output || '',
      error: result.error,
    });

    callbacks.onEvent?.('plan_step_executed', {
      stepId: step.stepId,
      tool: step.tool,
      success: result.success,
      error: result.error,
    });

    if (!result.success) {
      return {
        success: false,
        stepsExecuted: results.length,
        failedStepId: step.stepId,
        results,
      };
    }
  }

  return {
    success: true,
    stepsExecuted: results.length,
    results,
  };
}
