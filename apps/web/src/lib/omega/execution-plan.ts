import crypto from 'crypto';
import type { ASTModification, ExecutionStep, SignedExecutionPlan, WorkOrder } from './omega-model';
import { resolveASTOperations } from './ast-engine';

function sortByDependencies(steps: ExecutionStep[], workOrders: WorkOrder[]): ExecutionStep[] {
  const order = new Map<string, number>();
  workOrders.forEach((wo, idx) => order.set(wo.id, idx));
  return [...steps].sort((a, b) => (order.get(a.sourceWorkOrderId) || 0) - (order.get(b.sourceWorkOrderId) || 0));
}

export function createSignedPlan(
  manifestId: string,
  stagedModifications: Map<string, ASTModification[]>,
  workOrders: WorkOrder[],
): SignedExecutionPlan {
  const steps: ExecutionStep[] = [];
  let stepCounter = 0;
  const filesTouched = new Set<string>();

  for (const [workOrderId, mods] of stagedModifications.entries()) {
    for (const mod of mods) {
      filesTouched.add(mod.filePath);
      if (mod.operations.some((op) => op.type === 'create_file')) {
        const createOp = mod.operations.find((op) => op.type === 'create_file') as { type: 'create_file'; content: string } | undefined;
        steps.push({
          stepId: `step-${++stepCounter}`,
          tool: 'create_file',
          args: { path: mod.filePath, content: createOp?.content || '' },
          sourceWorkOrderId: workOrderId,
          rationale: 'Create target file from verified AST modification',
        });
        continue;
      }

      const edits = resolveASTOperations(mod.operations, mod.rawFallback?.oldString || '');
      for (const edit of edits) {
        steps.push({
          stepId: `step-${++stepCounter}`,
          tool: 'edit_file',
          args: {
            path: mod.filePath,
            old_string: edit.oldString,
            new_string: edit.newString,
          },
          sourceWorkOrderId: workOrderId,
          rationale: 'Apply verified AST-derived edit',
        });
      }
    }
  }

  const orderedSteps = sortByDependencies(steps, workOrders);
  const unsigned = {
    manifestId,
    createdBy: 'architect',
    steps: orderedSteps,
    totalFilesAffected: filesTouched.size,
    estimatedToolCalls: orderedSteps.length,
  };

  const signature = crypto
    .createHash('sha256')
    .update(JSON.stringify(unsigned))
    .digest('hex');

  return {
    planId: `plan-${Date.now().toString(36)}`,
    manifestId,
    signature,
    createdBy: 'architect',
    steps: orderedSteps,
    totalFilesAffected: filesTouched.size,
    estimatedToolCalls: orderedSteps.length,
  };
}

export function verifyPlanSignature(plan: SignedExecutionPlan): boolean {
  const unsigned = {
    manifestId: plan.manifestId,
    createdBy: plan.createdBy,
    steps: plan.steps,
    totalFilesAffected: plan.totalFilesAffected,
    estimatedToolCalls: plan.estimatedToolCalls,
  };
  const recomputed = crypto
    .createHash('sha256')
    .update(JSON.stringify(unsigned))
    .digest('hex');
  return recomputed === plan.signature;
}
