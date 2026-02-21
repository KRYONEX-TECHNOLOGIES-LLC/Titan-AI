/**
 * Titan Protocol v2 — Task Manifest DAG
 *
 * Provides topological sorting, dependency resolution, ready-node detection,
 * and cycle validation for the Directed Acyclic Graph of subtasks.
 */

import type { DAGNode, DAGEdge, SubtaskSpec } from './lane-model';

// ─── DAG Validation ─────────────────────────────────────────────────────────

export class CyclicDependencyError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Cyclic dependency detected in task manifest: ${cycle.join(' → ')}`);
    this.name = 'CyclicDependencyError';
  }
}

export class MissingDependencyError extends Error {
  constructor(public readonly nodeId: string, public readonly missingDep: string) {
    super(`Node "${nodeId}" depends on "${missingDep}" which does not exist in the manifest`);
    this.name = 'MissingDependencyError';
  }
}

/**
 * Validate the DAG: check for missing dependencies and cycles.
 */
export function validateDAG(nodes: DAGNode[]): void {
  const nodeIds = new Set(nodes.map(n => n.id));

  for (const node of nodes) {
    for (const dep of node.dependencies) {
      if (!nodeIds.has(dep)) {
        throw new MissingDependencyError(node.id, dep);
      }
    }
  }

  const sorted = toposort(nodes);
  if (sorted.length !== nodes.length) {
    throw new CyclicDependencyError(
      nodes.filter(n => !sorted.includes(n.id)).map(n => n.id)
    );
  }
}

// ─── Topological Sort (Kahn's Algorithm) ────────────────────────────────────

export function toposort(nodes: DAGNode[]): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const node of nodes) {
    for (const dep of node.dependencies) {
      const current = inDegree.get(node.id) ?? 0;
      inDegree.set(node.id, current + 1);
      const adj = adjacency.get(dep);
      if (adj) adj.push(node.id);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      const degree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, degree);
      if (degree === 0) queue.push(neighbor);
    }
  }

  return sorted;
}

// ─── Ready Node Detection ───────────────────────────────────────────────────

/**
 * Get all nodes that are PENDING and have all dependencies COMPLETE.
 */
export function getReadyNodes(nodes: DAGNode[]): DAGNode[] {
  const completedIds = new Set(
    nodes.filter(n => n.status === 'COMPLETE').map(n => n.id)
  );

  return nodes.filter(node => {
    if (node.status !== 'PENDING') return false;
    return node.dependencies.every(dep => completedIds.has(dep));
  });
}

/**
 * Get the execution order: groups of nodes that can run in parallel.
 * Each group is a "wave" -- all nodes in a wave can execute concurrently.
 */
export function getExecutionWaves(nodes: DAGNode[]): DAGNode[][] {
  const waves: DAGNode[][] = [];
  const remaining = nodes.map(n => ({ ...n }));
  const completed = new Set<string>();

  while (remaining.length > 0) {
    const wave = remaining.filter(n =>
      n.dependencies.every(dep => completed.has(dep))
    );

    if (wave.length === 0) {
      break;
    }

    waves.push(wave);

    for (const node of wave) {
      completed.add(node.id);
      const idx = remaining.findIndex(n => n.id === node.id);
      if (idx >= 0) remaining.splice(idx, 1);
    }
  }

  return waves;
}

// ─── Node Construction Helpers ──────────────────────────────────────────────

let _nodeCounter = 0;

export function createDAGNode(
  spec: SubtaskSpec,
  dependencies: string[] = [],
): DAGNode {
  _nodeCounter++;
  return {
    id: `node-${Date.now().toString(36)}-${_nodeCounter}`,
    spec,
    dependencies,
    status: 'PENDING',
  };
}

export function buildEdges(nodes: DAGNode[]): DAGEdge[] {
  const edges: DAGEdge[] = [];
  for (const node of nodes) {
    for (const dep of node.dependencies) {
      edges.push({ from: dep, to: node.id });
    }
  }
  return edges;
}

// ─── Manifest Completion Analysis ───────────────────────────────────────────

export interface ManifestProgress {
  total: number;
  pending: number;
  dispatched: number;
  complete: number;
  failed: number;
  percentComplete: number;
  isComplete: boolean;
  isSuccessful: boolean;
  hasFailed: boolean;
}

export function getManifestProgress(nodes: DAGNode[]): ManifestProgress {
  let pending = 0;
  let dispatched = 0;
  let complete = 0;
  let failed = 0;

  for (const node of nodes) {
    switch (node.status) {
      case 'PENDING': pending++; break;
      case 'DISPATCHED': dispatched++; break;
      case 'COMPLETE': complete++; break;
      case 'FAILED': failed++; break;
    }
  }

  const total = nodes.length;
  const finished = complete + failed;

  return {
    total,
    pending,
    dispatched,
    complete,
    failed,
    percentComplete: total > 0 ? Math.round((complete / total) * 100) : 0,
    isComplete: finished === total,
    isSuccessful: complete === total,
    hasFailed: failed > 0,
  };
}

/**
 * Find all downstream nodes that transitively depend on a given node.
 * Used to determine blast radius when a node fails.
 */
export function getDownstreamNodes(nodeId: string, nodes: DAGNode[]): DAGNode[] {
  const downstream: DAGNode[] = [];
  const visited = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const node of nodes) {
      if (node.dependencies.includes(current) && !visited.has(node.id)) {
        visited.add(node.id);
        downstream.push(node);
        queue.push(node.id);
      }
    }
  }

  return downstream;
}
