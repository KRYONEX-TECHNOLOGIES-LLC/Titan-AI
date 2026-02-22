import type { WorkOrder, WorkOrderDAG, WorkOrderStatus } from './omega-model';

interface ArchitectOutputNode {
  id: string;
  taskDescription: string;
  inputContract?: WorkOrder['inputContract'];
  outputContract?: WorkOrder['outputContract'];
  acceptanceCriteria?: string[];
  predictedRisk?: WorkOrder['predictedRisk'];
  dependencies?: string[];
}

interface ArchitectOutput {
  workOrders?: ArchitectOutputNode[];
}

function fallbackWorkOrder(goal: string): WorkOrder {
  return {
    id: 'wo-1',
    taskDescription: goal,
    inputContract: { requiredFiles: [], requiredContext: [] },
    outputContract: { expectedArtifacts: ['Implement requested change'], expectedFiles: [] },
    acceptanceCriteria: ['Code compiles', 'Behavior matches user request'],
    predictedRisk: 'medium',
    dependencies: [],
    status: 'PENDING',
    reworkCount: 0,
  };
}

export function createDAGFromArchitectOutput(llmOutput: string, goal: string): WorkOrderDAG {
  let parsed: ArchitectOutput = {};
  try {
    parsed = JSON.parse(llmOutput);
  } catch {
    parsed = {};
  }

  const rawNodes = parsed.workOrders && parsed.workOrders.length > 0
    ? parsed.workOrders
    : [fallbackWorkOrder(goal)];

  const nodes = new Map<string, WorkOrder>();
  const edges: Array<{ from: string; to: string }> = [];

  for (const raw of rawNodes) {
    const node: WorkOrder = {
      id: raw.id || `wo-${nodes.size + 1}`,
      taskDescription: raw.taskDescription || `Task ${nodes.size + 1}`,
      inputContract: {
        requiredFiles: raw.inputContract?.requiredFiles || [],
        requiredContext: raw.inputContract?.requiredContext || [],
      },
      outputContract: {
        expectedArtifacts: raw.outputContract?.expectedArtifacts || [],
        expectedFiles: raw.outputContract?.expectedFiles || [],
        mustNotModify: raw.outputContract?.mustNotModify || [],
      },
      acceptanceCriteria: raw.acceptanceCriteria && raw.acceptanceCriteria.length > 0
        ? raw.acceptanceCriteria
        : ['Implementation is correct', 'No regressions introduced'],
      predictedRisk: raw.predictedRisk || 'medium',
      dependencies: raw.dependencies || [],
      status: 'PENDING',
      reworkCount: 0,
    };
    nodes.set(node.id, node);
  }

  for (const node of nodes.values()) {
    for (const dep of node.dependencies) {
      edges.push({ from: dep, to: node.id });
    }
  }

  return {
    manifestId: `omega-${Date.now().toString(36)}`,
    goal,
    nodes,
    edges,
    createdAt: Date.now(),
  };
}

export function getReadyNodes(dag: WorkOrderDAG): WorkOrder[] {
  const finished = new Set<string>();
  for (const [id, node] of dag.nodes.entries()) {
    if (node.status === 'STAGED' || node.status === 'COMPLETE' || node.status === 'VERIFIED') {
      finished.add(id);
    }
  }

  const ready: WorkOrder[] = [];
  for (const node of dag.nodes.values()) {
    if (node.status !== 'PENDING' && node.status !== 'SCAFFOLDED') continue;
    const depsDone = node.dependencies.every((d) => finished.has(d));
    if (depsDone) ready.push(node);
  }
  return ready;
}

export function updateNodeStatus(
  dag: WorkOrderDAG,
  nodeId: string,
  status: WorkOrderStatus,
): WorkOrderDAG {
  const existing = dag.nodes.get(nodeId);
  if (!existing) return dag;
  dag.nodes.set(nodeId, { ...existing, status });
  return dag;
}

export function incrementReworkCount(dag: WorkOrderDAG, nodeId: string): number {
  const existing = dag.nodes.get(nodeId);
  if (!existing) return 0;
  const count = (existing.reworkCount || 0) + 1;
  dag.nodes.set(nodeId, { ...existing, reworkCount: count });
  return count;
}

export function isDAGComplete(dag: WorkOrderDAG): boolean {
  for (const node of dag.nodes.values()) {
    if (!['STAGED', 'COMPLETE', 'VERIFIED'].includes(node.status)) return false;
  }
  return true;
}

export function isDAGFailed(dag: WorkOrderDAG): boolean {
  for (const node of dag.nodes.values()) {
    if (node.status === 'ESCALATED' || node.status === 'FAILED') return true;
  }
  return false;
}
