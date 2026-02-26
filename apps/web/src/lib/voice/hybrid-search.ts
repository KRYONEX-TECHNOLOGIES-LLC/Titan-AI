/**
 * Hybrid Search with Reciprocal Rank Fusion (RRF)
 *
 * Combines sparse (BM25-style keyword) and dense (embedding vector) retrieval
 * using RRF: score(d) = Σ 1/(k + rank_i(d)) with k=60.
 *
 * This gives dramatically better knowledge retrieval than pure keyword matching,
 * finding relevant entries even when phrasing doesn't match stored keywords exactly.
 */

import type { BrainEntry } from './brain-storage';

// ═══ BM25 SPARSE SCORING ═══

interface BM25Params {
  k1: number; // term saturation (1.2-2.0)
  b: number;  // length normalization (0.75)
}

const DEFAULT_BM25: BM25Params = { k1: 1.5, b: 0.75 };

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function computeIDF(docs: string[][], term: string): number {
  const N = docs.length;
  const df = docs.filter(d => d.includes(term)).length;
  if (df === 0) return 0;
  return Math.log((N - df + 0.5) / (df + 0.5) + 1);
}

function bm25Score(
  queryTokens: string[],
  docTokens: string[],
  allDocs: string[][],
  avgDl: number,
  params: BM25Params = DEFAULT_BM25,
): number {
  let score = 0;
  const dl = docTokens.length;

  for (const term of queryTokens) {
    const tf = docTokens.filter(t => t === term).length;
    if (tf === 0) continue;

    const idf = computeIDF(allDocs, term);
    const tfNorm = (tf * (params.k1 + 1)) / (tf + params.k1 * (1 - params.b + params.b * dl / avgDl));
    score += idf * tfNorm;
  }

  return score;
}

function sparseRank(query: string, entries: BrainEntry[]): Array<{ entry: BrainEntry; score: number }> {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return entries.map(e => ({ entry: e, score: 0 }));

  const allDocs = entries.map(e => tokenize(`${e.content} ${e.category}`));
  const avgDl = allDocs.reduce((s, d) => s + d.length, 0) / (allDocs.length || 1);

  return entries
    .map((entry, i) => ({
      entry,
      score: bm25Score(queryTokens, allDocs[i], allDocs, avgDl),
    }))
    .sort((a, b) => b.score - a.score);
}

// ═══ DENSE (EMBEDDING) SCORING ═══

const EMBED_CACHE = new Map<string, number[]>();

async function getEmbedding(text: string): Promise<number[] | null> {
  const cacheKey = text.slice(0, 200);
  if (EMBED_CACHE.has(cacheKey)) return EMBED_CACHE.get(cacheKey)!;

  try {
    const res = await fetch('/api/titan/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 512) }),
    });

    if (!res.ok) return null;
    const data = await res.json() as { embedding?: number[] };
    if (!data.embedding) return null;

    EMBED_CACHE.set(cacheKey, data.embedding);
    if (EMBED_CACHE.size > 500) {
      const first = EMBED_CACHE.keys().next().value;
      if (first) EMBED_CACHE.delete(first);
    }

    return data.embedding;
  } catch {
    return null;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

async function denseRank(query: string, entries: BrainEntry[]): Promise<Array<{ entry: BrainEntry; score: number }>> {
  const queryEmb = await getEmbedding(query);
  if (!queryEmb) {
    return entries.map(e => ({ entry: e, score: 0 }));
  }

  const results: Array<{ entry: BrainEntry; score: number }> = [];
  for (const entry of entries) {
    const entryEmb = await getEmbedding(entry.content);
    const score = entryEmb ? cosineSimilarity(queryEmb, entryEmb) : 0;
    results.push({ entry, score });
  }

  return results.sort((a, b) => b.score - a.score);
}

// ═══ RECIPROCAL RANK FUSION ═══

const RRF_K = 60;

export interface HybridSearchResult {
  entry: BrainEntry;
  rrfScore: number;
  sparseRank: number;
  denseRank: number;
}

export async function hybridSearch(
  query: string,
  entries: BrainEntry[],
  options?: { maxResults?: number; useEmbeddings?: boolean },
): Promise<HybridSearchResult[]> {
  const maxResults = options?.maxResults ?? 20;
  const useEmbeddings = options?.useEmbeddings ?? true;

  if (entries.length === 0) return [];

  // Sparse ranking (always available — no API needed)
  const sparseResults = sparseRank(query, entries);

  // Dense ranking (requires embedding API)
  let denseResults: Array<{ entry: BrainEntry; score: number }>;
  if (useEmbeddings) {
    denseResults = await denseRank(query, entries);
  } else {
    denseResults = entries.map(e => ({ entry: e, score: 0 }));
  }

  // Build rank maps
  const sparseRankMap = new Map<string, number>();
  sparseResults.forEach((r, i) => sparseRankMap.set(r.entry.id, i + 1));

  const denseRankMap = new Map<string, number>();
  denseResults.forEach((r, i) => denseRankMap.set(r.entry.id, i + 1));

  // RRF fusion
  const fused: HybridSearchResult[] = entries.map(entry => {
    const sRank = sparseRankMap.get(entry.id) || entries.length;
    const dRank = denseRankMap.get(entry.id) || entries.length;

    const sparseScore = 1 / (RRF_K + sRank);
    const denseScore = useEmbeddings ? 1 / (RRF_K + dRank) : 0;

    // Weight: sparse 0.4, dense 0.4, importance 0.2
    const importanceBoost = (entry.importance / 10) * 0.005;
    const rrfScore = sparseScore + denseScore + importanceBoost;

    return { entry, rrfScore, sparseRank: sRank, denseRank: dRank };
  });

  fused.sort((a, b) => b.rrfScore - a.rrfScore);
  return fused.slice(0, maxResults);
}

/**
 * Fast keyword-only hybrid search (no API calls needed).
 * Useful when embedding API is unavailable.
 */
export function hybridSearchSync(
  query: string,
  entries: BrainEntry[],
  maxResults = 20,
): HybridSearchResult[] {
  if (entries.length === 0) return [];

  const sparseResults = sparseRank(query, entries);
  return sparseResults.slice(0, maxResults).map((r, i) => ({
    entry: r.entry,
    rrfScore: r.score + (r.entry.importance / 10) * 0.1,
    sparseRank: i + 1,
    denseRank: entries.length,
  }));
}
