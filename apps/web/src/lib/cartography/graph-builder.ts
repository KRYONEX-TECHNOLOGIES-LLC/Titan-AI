import type {
  CartographyFileNode,
  CartographyGraph,
  GraphNode,
  GraphEdge,
  ImportCycle,
  Cluster,
  AntiPattern,
} from './types';

interface AdjEntry {
  imports: Set<string>;
  importedBy: Set<string>;
}

function buildAdjacency(files: CartographyFileNode[]): Map<string, AdjEntry> {
  const adj = new Map<string, AdjEntry>();
  const pathSet = new Set(files.map(f => f.path));

  for (const f of files) {
    if (!adj.has(f.path)) adj.set(f.path, { imports: new Set(), importedBy: new Set() });
  }

  for (const f of files) {
    const allImports = [...f.imports, ...f.dynamicImports];
    for (const imp of allImports) {
      const resolved = resolveToKnownFile(imp, pathSet);
      if (!resolved || resolved === f.path) continue;

      adj.get(f.path)!.imports.add(resolved);
      if (!adj.has(resolved)) adj.set(resolved, { imports: new Set(), importedBy: new Set() });
      adj.get(resolved)!.importedBy.add(f.path);
    }
  }

  return adj;
}

function resolveToKnownFile(imp: string, known: Set<string>): string | null {
  if (known.has(imp)) return imp;

  for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
    if (known.has(imp + ext)) return imp + ext;
  }
  for (const idx of ['/index.ts', '/index.tsx', '/index.js']) {
    if (known.has(imp + idx)) return imp + idx;
  }

  if (imp.startsWith('src/')) {
    const stripped = imp.slice(4);
    return resolveToKnownFile(stripped, known);
  }

  return null;
}

function detectCycles(adj: Map<string, AdjEntry>): ImportCycle[] {
  const cycles: ImportCycle[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];
  const found = new Set<string>();

  function dfs(node: string) {
    visited.add(node);
    inStack.add(node);
    stack.push(node);

    const entry = adj.get(node);
    if (entry) {
      for (const dep of entry.imports) {
        if (!adj.has(dep)) continue;

        if (!visited.has(dep)) {
          dfs(dep);
        } else if (inStack.has(dep)) {
          const cycleStart = stack.indexOf(dep);
          if (cycleStart >= 0) {
            const cyclePath = stack.slice(cycleStart);
            const key = [...cyclePath].sort().join('|');
            if (!found.has(key)) {
              found.add(key);
              cycles.push({ files: [...cyclePath], length: cyclePath.length });
            }
          }
        }
      }
    }

    stack.pop();
    inStack.delete(node);
  }

  for (const node of adj.keys()) {
    if (!visited.has(node)) dfs(node);
  }

  return cycles;
}

function computeBetweenness(adj: Map<string, AdjEntry>, nodes: string[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const n of nodes) scores.set(n, 0);

  for (const source of nodes) {
    const queue: string[] = [source];
    const dist = new Map<string, number>([[source, 0]]);
    const sigma = new Map<string, number>([[source, 1]]);
    const pred = new Map<string, string[]>();
    const order: string[] = [];

    while (queue.length > 0) {
      const v = queue.shift()!;
      order.push(v);
      const d = dist.get(v)!;
      const entry = adj.get(v);
      if (!entry) continue;

      for (const w of entry.imports) {
        if (!adj.has(w)) continue;
        if (!dist.has(w)) {
          dist.set(w, d + 1);
          sigma.set(w, 0);
          queue.push(w);
        }
        if (dist.get(w) === d + 1) {
          sigma.set(w, (sigma.get(w) || 0) + (sigma.get(v) || 1));
          if (!pred.has(w)) pred.set(w, []);
          pred.get(w)!.push(v);
        }
      }
    }

    const delta = new Map<string, number>();
    for (const n of nodes) delta.set(n, 0);

    for (let i = order.length - 1; i >= 0; i--) {
      const w = order[i];
      const preds = pred.get(w) || [];
      for (const v of preds) {
        const share = ((sigma.get(v) || 1) / (sigma.get(w) || 1)) * (1 + (delta.get(w) || 0));
        delta.set(v, (delta.get(v) || 0) + share);
      }
      if (w !== source) {
        scores.set(w, (scores.get(w) || 0) + (delta.get(w) || 0));
      }
    }
  }

  const maxB = Math.max(1, ...scores.values());
  for (const [k, v] of scores) scores.set(k, v / maxB);

  return scores;
}

function buildClusters(files: CartographyFileNode[], adj: Map<string, AdjEntry>): Cluster[] {
  const dirMap = new Map<string, string[]>();

  for (const f of files) {
    const parts = f.path.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    if (!dirMap.has(dir)) dirMap.set(dir, []);
    dirMap.get(dir)!.push(f.path);
  }

  const clusters: Cluster[] = [];
  for (const [dir, filePaths] of dirMap) {
    if (filePaths.length < 2) continue;
    const fileSet = new Set(filePaths);
    let internal = 0;
    let external = 0;

    for (const fp of filePaths) {
      const entry = adj.get(fp);
      if (!entry) continue;
      for (const imp of entry.imports) {
        if (fileSet.has(imp)) internal++;
        else external++;
      }
    }

    const total = internal + external;
    clusters.push({
      id: dir,
      label: dir.split('/').pop() || dir,
      directory: dir,
      files: filePaths,
      internalEdges: internal,
      externalEdges: external,
      cohesion: total > 0 ? internal / total : 1,
    });
  }

  return clusters.sort((a, b) => b.files.length - a.files.length);
}

function findAntiPatterns(
  files: CartographyFileNode[],
  adj: Map<string, AdjEntry>,
  cycles: ImportCycle[],
): AntiPattern[] {
  const patterns: AntiPattern[] = [];
  const fileMap = new Map(files.map(f => [f.path, f]));

  for (const f of files) {
    const entry = adj.get(f.path);
    if (!entry) continue;

    if (f.lineCount > 500 && entry.imports.size > 20) {
      patterns.push({
        type: 'god-file',
        file: f.path,
        detail: `${f.lineCount} lines, ${entry.imports.size} imports — consider splitting`,
        severity: 'critical',
      });
    }

    if (entry.importedBy.size === 0 && f.kind !== 'config' && f.kind !== 'test' && f.kind !== 'style') {
      const isEntryPoint = f.kind === 'api-route' || f.path.includes('page.') || f.path.includes('layout.');
      if (!isEntryPoint) {
        patterns.push({
          type: 'orphan',
          file: f.path,
          detail: 'Not imported by any other file — may be dead code',
          severity: 'info',
        });
      }
    }

    if (entry.imports.size > 15) {
      patterns.push({
        type: 'high-coupling',
        file: f.path,
        detail: `Imports ${entry.imports.size} files — high coupling risk`,
        severity: 'warning',
      });
    }
  }

  for (const cycle of cycles) {
    for (const f of cycle.files) {
      patterns.push({
        type: 'cycle',
        file: f,
        detail: `Circular import chain (${cycle.length} files): ${cycle.files.join(' -> ')}`,
        severity: 'warning',
      });
    }
  }

  return patterns;
}

export function buildGraph(files: CartographyFileNode[]): CartographyGraph {
  const adj = buildAdjacency(files);
  const cycles = detectCycles(adj);
  const cycleFiles = new Set(cycles.flatMap(c => c.files));
  const nodeKeys = [...adj.keys()];
  const betweenness = computeBetweenness(adj, nodeKeys);
  const clusters = buildClusters(files, adj);
  const antiPatterns = findAntiPatterns(files, adj, cycles);
  const fileMap = new Map(files.map(f => [f.path, f]));

  const edges: GraphEdge[] = [];
  for (const f of files) {
    const entry = adj.get(f.path);
    if (!entry) continue;

    for (const imp of entry.imports) {
      const isDynamic = f.dynamicImports.some(d => {
        const resolved = resolveToKnownFile(d, new Set(files.map(x => x.path)));
        return resolved === imp;
      });
      const isCyclic = cycleFiles.has(f.path) && cycleFiles.has(imp);
      edges.push({
        source: f.path,
        target: imp,
        type: isDynamic ? 'dynamic' : 'static',
        isCyclic,
      });
    }
  }

  const nodes: GraphNode[] = files.map(f => {
    const entry = adj.get(f.path);
    const fanIn = entry?.importedBy.size || 0;
    const fanOut = entry?.imports.size || 0;
    const btwn = betweenness.get(f.path) || 0;
    const inCycle = cycleFiles.has(f.path) ? 1 : 0;

    const normalized = {
      fanIn: Math.min(fanIn / 30, 1),
      fanOut: Math.min(fanOut / 20, 1),
      lines: Math.min(f.lineCount / 1000, 1),
      cycle: inCycle,
    };
    const hotspotScore = Math.round(
      (normalized.fanIn * 0.4 + normalized.fanOut * 0.3 + normalized.lines * 0.1 + normalized.cycle * 0.2) * 100,
    );

    const clusterDir = f.path.split('/').slice(0, -1).join('/') || '.';

    return {
      id: f.path,
      path: f.path,
      name: f.name,
      kind: f.kind,
      language: f.language,
      lineCount: f.lineCount,
      functionCount: f.functionCount,
      fanIn,
      fanOut,
      betweenness: Math.round(btwn * 100) / 100,
      hotspotScore,
      hotspotCategory: hotspotScore >= 60 ? 'critical' : hotspotScore >= 30 ? 'important' : 'normal',
      cluster: clusterDir,
    };
  });

  return {
    nodes: nodes.sort((a, b) => b.hotspotScore - a.hotspotScore),
    edges,
    clusters,
    cycles,
    antiPatterns,
    totalFiles: files.length,
    totalEdges: edges.length,
    scannedAt: Date.now(),
  };
}
