import type { CartographyGraph, GraphNode } from './types';

export interface HotspotReport {
  critical: GraphNode[];
  important: GraphNode[];
  normal: GraphNode[];
  topRisks: Array<{ file: string; reason: string; score: number }>;
  healthScore: number;
}

export function analyzeHotspots(graph: CartographyGraph): HotspotReport {
  const critical = graph.nodes.filter(n => n.hotspotCategory === 'critical');
  const important = graph.nodes.filter(n => n.hotspotCategory === 'important');
  const normal = graph.nodes.filter(n => n.hotspotCategory === 'normal');

  const topRisks: Array<{ file: string; reason: string; score: number }> = [];

  for (const node of critical) {
    const reasons: string[] = [];
    if (node.fanIn > 20) reasons.push(`high fan-in (${node.fanIn} importers)`);
    if (node.fanOut > 15) reasons.push(`high fan-out (${node.fanOut} dependencies)`);
    if (node.lineCount > 500) reasons.push(`large file (${node.lineCount} lines)`);
    if (graph.cycles.some(c => c.files.includes(node.path))) reasons.push('in circular import');

    topRisks.push({
      file: node.path,
      reason: reasons.join('; ') || 'high composite score',
      score: node.hotspotScore,
    });
  }

  const healthScore = computeHealthScore(graph, critical.length, important.length);

  return {
    critical,
    important,
    normal,
    topRisks: topRisks.sort((a, b) => b.score - a.score).slice(0, 10),
    healthScore,
  };
}

function computeHealthScore(
  graph: CartographyGraph,
  criticalCount: number,
  importantCount: number,
): number {
  let score = 100;

  const criticalRatio = criticalCount / Math.max(graph.totalFiles, 1);
  score -= criticalRatio * 200;

  const importantRatio = importantCount / Math.max(graph.totalFiles, 1);
  score -= importantRatio * 50;

  score -= graph.cycles.length * 5;

  const godFiles = graph.antiPatterns.filter(p => p.type === 'god-file').length;
  score -= godFiles * 8;

  const orphans = graph.antiPatterns.filter(p => p.type === 'orphan').length;
  const orphanRatio = orphans / Math.max(graph.totalFiles, 1);
  score -= orphanRatio * 30;

  const avgCohesion =
    graph.clusters.length > 0
      ? graph.clusters.reduce((sum, c) => sum + c.cohesion, 0) / graph.clusters.length
      : 1;
  score -= (1 - avgCohesion) * 20;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function serializeHotspotReport(report: HotspotReport): string {
  const lines: string[] = [
    `Health Score: ${report.healthScore}/100`,
    `Critical files: ${report.critical.length}`,
    `Important files: ${report.important.length}`,
    '',
    'Top Risks:',
  ];

  for (const risk of report.topRisks.slice(0, 5)) {
    lines.push(`  - ${risk.file} (score ${risk.score}): ${risk.reason}`);
  }

  return lines.join('\n');
}
