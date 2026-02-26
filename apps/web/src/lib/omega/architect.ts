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

async function callWithRetry(
  fn: () => Promise<string>,
  maxRetries = 3,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timed out after 30s')), 30000)),
      ]);
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        const delay = 1000 * Math.pow(2, attempt);
        console.warn(`[omega] Retry ${attempt + 1}/${maxRetries} after ${delay}ms:`, err instanceof Error ? err.message : err);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  return `[ERROR] Call failed after ${maxRetries} attempts: ${lastError instanceof Error ? lastError.message : 'unknown'}`;
}

async function buildWorkOrders(goal: string, config: OmegaConfig, callbacks: OmegaCallbacks): Promise<WorkOrderDAG> {
  const autopsy = await performAutopsy(callbacks.executeToolCall, '');
  callbacks.onEvent('autopsy_complete', {
    projectName: autopsy.projectName,
    projectType: autopsy.projectType,
    packageManager: autopsy.packageManager,
  });

  const fileTreeSection = callbacks.fileTree
    ? `\n═══ PROJECT FILE TREE (loaded in IDE) ═══\n${callbacks.fileTree.slice(0, 8000)}\n`
    : '';

  const decompositionPrompt = [
    'You are THE OMEGA ARCHITECT — supreme planner of the Omega Protocol inside the Titan AI IDE.',
    '',
    '═══ MINDSET ═══',
    'You have FULL access to the user\'s workspace, all files, terminal, and development tools.',
    'When the user says "the app", "this project", "this" — they mean the project loaded in the IDE.',
    'NEVER ask for clarification. NEVER say you need more information.',
    'If the user mentions ANY module, engine, feature, or component by name — ASSUME IT EXISTS and plan tasks to find and improve it.',
    '',
    '═══ WORKSPACE INTEL ═══',
    `Project type: ${autopsy.projectType}`,
    `Known entrypoints: ${autopsy.entryPoints.join(', ') || '(none)'}`,
    fileTreeSection,
    '',
    '═══ OUTPUT FORMAT ═══',
    '- Plain text only. NO emojis. NO emoji bullets. Professional, direct, technical language.',
    '- Use plain text bullets (- or *) not emoji bullets.',
    '',
    '═══ DECOMPOSITION RULES ═══',
    '- First work order MUST be workspace reconnaissance: search and read existing code',
    '- Each work order must be specific enough that a specialist can execute it without questions',
    '- Include REAL file paths from the file tree above in inputContract.requiredFiles',
    '- NEVER create a work order that says "ask the user" or "clarify requirements"',
    `- Max work orders: ${config.maxDAGNodes}`,
    '',
    `═══ GOAL ═══`,
    goal,
    '',
    'Return JSON: {"workOrders":[{id, taskDescription, inputContract:{requiredFiles:[]}, outputContract:{expectedFiles:[],mustNotModify:[]}, acceptanceCriteria:[], predictedRisk:"low"|"medium"|"high"|"critical", dependencies:[]}]}',
  ].join('\n');

  const raw = await callbacks.invokeModel(config.architectModel, [
    { role: 'system', content: 'You are the Titan Omega Architect. You are an autonomous planner with full workspace access. Output JSON only. Never refuse or ask for clarification. NO emojis. Plain text only.' },
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

  let dag: WorkOrderDAG;
  try {
    dag = await buildWorkOrders(goal, config, callbacks);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    callbacks.onEvent('error', { phase: 'buildWorkOrders', message: msg });
    return {
      success: false,
      manifestId: 'failed',
      workOrdersTotal: 0,
      workOrdersVerified: 0,
      workOrdersFailed: 0,
      planStepCount: 0,
      execution: { success: false, stepsExecuted: 0, results: [] },
      integrationTest: undefined,
      summary: `Omega failed during planning: ${msg}`,
      output: '',
    };
  }

  const staged = new Map<string, ASTModification[]>();
  const collectedOutputs: string[] = [];

  while (!isDAGComplete(dag) && !isDAGFailed(dag)) {
    const readyNodes = getReadyNodes(dag);
    if (readyNodes.length === 0) break;

    for (const node of readyNodes) {
      try {
        callbacks.onEvent('specialist_dispatched', {
          workOrderId: node.id,
          risk: node.predictedRisk,
        });
        updateNodeStatus(dag, node.id, 'WORKING');
        const hasWorkspace = !!(callbacks.workspacePath);
        const evidence = await executeSpecialist(node, config, callbacks, hasWorkspace);
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
          const evidenceText = evidence.selfAssessment || evidence.modifications.map(m => JSON.stringify(m)).join('\n');
          if (evidenceText) collectedOutputs.push(evidenceText);
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[omega] Work order ${node.id} failed:`, msg);
        callbacks.onEvent('error', { phase: 'specialist_execution', workOrderId: node.id, message: msg });
        updateNodeStatus(dag, node.id, 'FAILED');
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

  const combinedOutput = collectedOutputs.join('\n\n---\n\n');

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
    output: combinedOutput,
  };

  callbacks.onEvent('orchestration_complete', result as unknown as Record<string, unknown>);
  return result;
}
