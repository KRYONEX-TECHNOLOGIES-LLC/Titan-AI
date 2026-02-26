import { callModelDirect } from '@/lib/llm-call';
import type { CartographyGraph, LLMAnalysis } from './types';
import type { HotspotReport } from './hotspot-detector';

const CARTOGRAPHER_MODEL = 'deepseek/deepseek-v3.2';

const CARTOGRAPHER_SYSTEM = `You are the Cartographer — Titan AI's elite codebase intelligence engine.
You analyze dependency graphs, architecture patterns, and code health with surgical precision.

RULES:
- Plain text only. NO emojis. NO markdown headers. Professional, direct, technical language.
- Be specific: cite exact file paths, exact numbers, exact patterns.
- When recommending refactoring, explain WHY and the expected benefit.
- Health score must be 0-100 integer. Be honest — don't inflate.
- Return ONLY valid JSON. No code fences, no extra text.

OUTPUT FORMAT (strict JSON):
{
  "architectureSummary": "one paragraph describing the project architecture",
  "hotspotAnalysis": "paragraph analyzing the riskiest files and why",
  "refactoringSuggestions": ["suggestion 1", "suggestion 2", ...],
  "healthScore": 82,
  "keyDecisions": ["decision 1 detected", ...],
  "risks": ["risk 1", "risk 2", ...]
}`;

function buildAnalysisPrompt(graph: CartographyGraph, report: HotspotReport, fileTree?: string): string {
  const topNodes = graph.nodes.slice(0, 30).map(n =>
    `${n.path} [${n.kind}] lines=${n.lineCount} fan_in=${n.fanIn} fan_out=${n.fanOut} score=${n.hotspotScore}`,
  );

  const cycleStr = graph.cycles.length > 0
    ? graph.cycles.slice(0, 10).map(c => c.files.join(' -> ')).join('\n  ')
    : 'None detected';

  const clusterStr = graph.clusters.slice(0, 15).map(c =>
    `${c.directory} (${c.files.length} files, cohesion=${Math.round(c.cohesion * 100)}%)`,
  ).join('\n  ');

  const antiStr = graph.antiPatterns.slice(0, 15).map(p =>
    `[${p.severity}] ${p.type}: ${p.file} — ${p.detail}`,
  ).join('\n  ');

  const sections = [
    '=== CODEBASE METRICS ===',
    `Total files: ${graph.totalFiles}`,
    `Total dependency edges: ${graph.totalEdges}`,
    `Import cycles: ${graph.cycles.length}`,
    `Clusters: ${graph.clusters.length}`,
    `Anti-patterns found: ${graph.antiPatterns.length}`,
    `Computed health score: ${report.healthScore}/100`,
    '',
    '=== TOP 30 FILES BY HOTSPOT SCORE ===',
    ...topNodes,
    '',
    '=== IMPORT CYCLES ===',
    `  ${cycleStr}`,
    '',
    '=== CLUSTERS ===',
    `  ${clusterStr}`,
    '',
    '=== ANTI-PATTERNS ===',
    `  ${antiStr}`,
  ];

  if (fileTree) {
    sections.push('', '=== FILE TREE (truncated) ===', fileTree.slice(0, 6000));
  }

  sections.push('', 'Analyze this codebase thoroughly. Return your analysis as the JSON format specified.');

  return sections.join('\n');
}

export async function analyzeWithLLM(
  graph: CartographyGraph,
  report: HotspotReport,
  fileTree?: string,
): Promise<LLMAnalysis> {
  const userMessage = buildAnalysisPrompt(graph, report, fileTree);

  try {
    const raw = await callModelDirect(
      CARTOGRAPHER_MODEL,
      [
        { role: 'system', content: CARTOGRAPHER_SYSTEM },
        { role: 'user', content: userMessage },
      ],
      { temperature: 0.1, maxTokens: 4000 },
    );

    const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    return {
      architectureSummary: String(parsed.architectureSummary || 'Analysis unavailable'),
      hotspotAnalysis: String(parsed.hotspotAnalysis || 'No hotspot data'),
      refactoringSuggestions: Array.isArray(parsed.refactoringSuggestions)
        ? parsed.refactoringSuggestions.map(String)
        : [],
      healthScore: typeof parsed.healthScore === 'number'
        ? Math.max(0, Math.min(100, Math.round(parsed.healthScore)))
        : report.healthScore,
      keyDecisions: Array.isArray(parsed.keyDecisions) ? parsed.keyDecisions.map(String) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
    };
  } catch (err) {
    console.error('[cartographer-llm] Analysis failed:', (err as Error).message);
    return {
      architectureSummary: 'LLM analysis unavailable — using computed metrics only.',
      hotspotAnalysis: `${report.critical.length} critical files, ${report.important.length} important files detected.`,
      refactoringSuggestions: graph.antiPatterns
        .filter(p => p.severity === 'critical')
        .slice(0, 5)
        .map(p => `${p.file}: ${p.detail}`),
      healthScore: report.healthScore,
      keyDecisions: [],
      risks: graph.antiPatterns.filter(p => p.severity === 'critical').map(p => p.detail),
    };
  }
}

export async function queryCodebase(
  question: string,
  graph: CartographyGraph,
  analysis: LLMAnalysis,
): Promise<{ answer: string; relevantFiles: string[] }> {
  const context = [
    '=== ARCHITECTURE ===',
    analysis.architectureSummary,
    '',
    '=== HEALTH SCORE ===',
    `${analysis.healthScore}/100`,
    '',
    '=== KEY FILES (top 20 by importance) ===',
    ...graph.nodes.slice(0, 20).map(n =>
      `${n.path} [${n.kind}] fan_in=${n.fanIn} fan_out=${n.fanOut} lines=${n.lineCount}`,
    ),
    '',
    '=== CLUSTERS ===',
    ...graph.clusters.slice(0, 10).map(c => `${c.directory}: ${c.files.length} files`),
    '',
    '=== CYCLES ===',
    ...graph.cycles.slice(0, 5).map(c => c.files.join(' -> ')),
  ].join('\n');

  try {
    const raw = await callModelDirect(
      CARTOGRAPHER_MODEL,
      [
        {
          role: 'system',
          content: `You are the Cartographer — Titan AI's codebase intelligence engine.
Answer questions about code architecture, dependencies, and structure.
Be precise. Cite specific files. Plain text only, no emojis.
Return JSON: { "answer": "your answer", "relevantFiles": ["file1.ts", "file2.ts"] }`,
        },
        { role: 'user', content: `${context}\n\nQUESTION: ${question}` },
      ],
      { temperature: 0.1, maxTokens: 2000 },
    );

    const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { answer: cleaned, relevantFiles: [] };
    }

    return {
      answer: String(parsed.answer || cleaned),
      relevantFiles: Array.isArray(parsed.relevantFiles) ? parsed.relevantFiles.map(String) : [],
    };
  } catch (err) {
    return { answer: `Query failed: ${(err as Error).message}`, relevantFiles: [] };
  }
}
