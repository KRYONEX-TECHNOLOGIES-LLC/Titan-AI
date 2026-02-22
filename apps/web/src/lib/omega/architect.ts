import type {
  ASTModification,
  OmegaCallbacks,
  OmegaConfig,
  OmegaResult,
  VerificationResult,
  WorkOrder,
  WorkOrderDAG,
} from './omega-model';
import { createSignedPlan } from './execution-plan';
import { runIntegrationTest } from './integration-tester';
import { executeSignedPlan } from './operator';
import { performAutopsy } from './project-autopsy';
import { scaffoldWorkOrders } from './scaffolder';
import { executeSentinel } from './sentinel';
import { executeSpecialist } from './specialist';
import {
  createDAGFromArchitectOutput,
  getReadyNodes,
  incrementReworkCount,
  isDAGComplete,
  isDAGFailed,
  updateNodeStatus,
} from './work-order';

async function buildWorkOrders(goal: string, config: OmegaConfig, callbacks: OmegaCallbacks): Promise<WorkOrderDAG> {
  const autopsy = await performAutopsy(callbacks.executeToolCall, '');
  callbacks.onEvent('autopsy_complete', {
    projectName: autopsy.projectName,
    projectType: autopsy.projectType,
    packageManager: autopsy.packageManager,
  });

  const decompositionPrompt = [
    'You are THE ARCHITECT. Create a DAG of work orders in strict JSON.',
    `Goal: ${goal}`,
    `Project type: ${autopsy.projectType}`,
    `Known entrypoints: ${autopsy.entryPoints.join(', ') || '(none)'}`,
    `Max nodes: ${config.maxDAGNodes}`,
    'Return JSON: {"workOrders":[{id, taskDescription, inputContract, outputContract, acceptanceCriteria, predictedRisk, dependencies}]}',
  ].join('\n\n');

  const raw = await callbacks.invokeModel(config.architectModel, [
    { role: 'system', content: 'You are Titan Omega Architect. Output JSON only.' },
    { role: 'user', content: decompositionPrompt },
  ]);

  const dag = createDAGFromArchitectOutput(raw, goal);
  await scaffoldWorkOrders(dag, autopsy, callbacks.executeToolCall);
  callbacks.onEvent('blueprint_complete', {
    manifestId: dag.manifestId,
    workOrderCount: dag.nodes.size,
  });
  callbacks.onEvent('scaffolding_complete', {
    manifestId: dag.manifestId,
    scaffolded: dag.nodes.size,
  });
  return dag;
}

function isPass(result: VerificationResult | { verdict: 'FAIL' }): result is VerificationResult {
  return result.verdict === 'PASS';
}

export async function orchestrateOmega(
  goal: string,
  config: OmegaConfig,
  callbacks: OmegaCallbacks,
): Promise<OmegaResult> {
  callbacks.onEvent('orchestration_start', { goal, config });

  const dag = await buildWorkOrders(goal, config, callbacks);
  const staged = new Map<string, ASTModification[]>();

  while (!isDAGComplete(dag) && !isDAGFailed(dag)) {
    const readyNodes = getReadyNodes(dag);
    if (readyNodes.length === 0) break;

    for (const node of readyNodes) {
      callbacks.onEvent('specialist_dispatched', {
        workOrderId: node.id,
        risk: node.predictedRisk,
      });
      updateNodeStatus(dag, node.id, 'WORKING');
      const evidence = await executeSpecialist(node, config, callbacks);
      callbacks.onEvent('specialist_complete', {
        workOrderId: node.id,
        modifications: evidence.modifications.length,
      });

      updateNodeStatus(dag, node.id, 'PENDING_VERIFICATION');
      const verification = await executeSentinel(node, evidence, config, callbacks);

      if (isPass(verification)) {
        updateNodeStatus(dag, node.id, 'VERIFIED');
        staged.set(node.id, verification.stagedModifications);
        updateNodeStatus(dag, node.id, 'STAGED');
        callbacks.onEvent('verification_pass', {
          workOrderId: node.id,
          stagedModifications: verification.stagedModifications.length,
        });
      } else {
        updateNodeStatus(dag, node.id, 'REJECTED');
        const reworkCount = incrementReworkCount(dag, node.id);
        callbacks.onEvent('verification_fail', {
          workOrderId: node.id,
          memo: verification,
          reworkCount,
        });
        if (reworkCount <= config.maxReworkAttempts) {
          updateNodeStatus(dag, node.id, 'REWORKING');
          updateNodeStatus(dag, node.id, 'PENDING');
          callbacks.onEvent('rework_dispatched', { workOrderId: node.id, reworkCount });
        } else {
          updateNodeStatus(dag, node.id, 'ESCALATED');
          callbacks.onEvent('escalation', { workOrderId: node.id, reason: 'max_rework_attempts_exceeded' });
        }
      }
    }
  }

  const workOrders = Array.from(dag.nodes.values()) as WorkOrder[];
  const plan = createSignedPlan(dag.manifestId, staged, workOrders);
  callbacks.onEvent('plan_assembled', {
    manifestId: dag.manifestId,
    steps: plan.steps.length,
    files: plan.totalFilesAffected,
  });

  const execution = await executeSignedPlan(plan, config, {
    executeToolCall: callbacks.executeToolCall,
    onEvent: callbacks.onEvent,
  });

  const autopsy = await performAutopsy(callbacks.executeToolCall, '');
  const integrationTest = config.enableIntegrationTest
    ? await runIntegrationTest(autopsy, callbacks.executeToolCall)
    : undefined;

  const verifiedCount = Array.from(dag.nodes.values()).filter((n) => n.status === 'STAGED' || n.status === 'COMPLETE').length;
  const failedCount = Array.from(dag.nodes.values()).filter((n) => n.status === 'FAILED' || n.status === 'ESCALATED').length;
  const success = execution.success && failedCount === 0;

  const summary = [
    `Omega execution ${success ? 'completed successfully' : 'completed with failures'}.`,
    `Work orders verified: ${verifiedCount}/${dag.nodes.size}.`,
    `Execution steps: ${execution.stepsExecuted}/${plan.steps.length}.`,
    integrationTest ? `Integration test: ${integrationTest.success ? 'PASS' : 'FAIL'}.` : '',
  ].filter(Boolean).join(' ');

  const result: OmegaResult = {
    success,
    manifestId: dag.manifestId,
    workOrdersTotal: dag.nodes.size,
    workOrdersVerified: verifiedCount,
    workOrdersFailed: failedCount,
    planStepCount: plan.steps.length,
    execution,
    integrationTest,
    summary,
  };

  callbacks.onEvent('orchestration_complete', result as unknown as Record<string, unknown>);
  return result;
}
