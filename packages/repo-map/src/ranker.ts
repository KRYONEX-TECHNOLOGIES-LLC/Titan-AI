/**
 * Titan AI Repo Map - PageRank Ranker
 * Rank symbols by importance using PageRank algorithm
 */

import type { RepoGraph, RankedSymbol, RepoSymbol } from './types.js';
import { RepoGraphBuilder } from './graph.js';

export interface RankerConfig {
  dampingFactor: number;
  iterations: number;
  convergenceThreshold: number;
}

export class SymbolRanker {
  private config: RankerConfig;
  private graphBuilder: RepoGraphBuilder;

  constructor(config: Partial<RankerConfig> = {}) {
    this.config = {
      dampingFactor: 0.85,
      iterations: 100,
      convergenceThreshold: 0.0001,
      ...config,
    };

    this.graphBuilder = new RepoGraphBuilder();
  }

  /**
   * Rank all symbols using PageRank
   */
  rank(graph: RepoGraph): RankedSymbol[] {
    const n = graph.symbols.size;
    if (n === 0) return [];

    // Build adjacency lists
    const outgoing = this.graphBuilder.buildAdjacencyList(graph);
    const incoming = this.graphBuilder.buildReverseAdjacency(graph);

    // Initialize ranks
    const ranks = new Map<string, number>();
    const initialRank = 1 / n;
    for (const id of graph.symbols.keys()) {
      ranks.set(id, initialRank);
    }

    // Iterate until convergence
    const d = this.config.dampingFactor;
    const baseRank = (1 - d) / n;

    for (let iter = 0; iter < this.config.iterations; iter++) {
      const newRanks = new Map<string, number>();
      let maxDelta = 0;

      for (const [id, symbol] of graph.symbols) {
        let sum = 0;

        // Sum contributions from incoming links
        for (const incomingId of incoming.get(id) ?? []) {
          const outDegree = outgoing.get(incomingId)?.length ?? 1;
          sum += (ranks.get(incomingId) ?? 0) / outDegree;
        }

        const newRank = baseRank + d * sum;
        newRanks.set(id, newRank);

        const delta = Math.abs(newRank - (ranks.get(id) ?? 0));
        maxDelta = Math.max(maxDelta, delta);
      }

      // Update ranks
      for (const [id, rank] of newRanks) {
        ranks.set(id, rank);
      }

      // Check convergence
      if (maxDelta < this.config.convergenceThreshold) {
        break;
      }
    }

    // Build ranked symbols
    const ranked: RankedSymbol[] = [];
    for (const [id, symbol] of graph.symbols) {
      const pageRank = ranks.get(id) ?? 0;
      const importance = this.calculateImportance(symbol, graph, pageRank);

      ranked.push({
        ...symbol,
        rank: pageRank,
        importance,
      });
    }

    // Sort by importance
    return ranked.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Rank with relevance to a query
   */
  rankWithRelevance(
    graph: RepoGraph,
    query: string,
    focusSymbols?: string[]
  ): RankedSymbol[] {
    // Get base ranking
    const ranked = this.rank(graph);

    // Calculate relevance scores
    const queryTerms = query.toLowerCase().split(/\s+/);

    for (const symbol of ranked) {
      let relevance = 0;

      // Name matching
      const nameLower = symbol.name.toLowerCase();
      for (const term of queryTerms) {
        if (nameLower.includes(term)) {
          relevance += 0.5;
        }
        if (nameLower === term) {
          relevance += 0.5;
        }
      }

      // Signature matching
      if (symbol.signature) {
        const sigLower = symbol.signature.toLowerCase();
        for (const term of queryTerms) {
          if (sigLower.includes(term)) {
            relevance += 0.2;
          }
        }
      }

      // Focus boost
      if (focusSymbols?.includes(symbol.id)) {
        relevance += 1.0;
      }

      symbol.relevance = relevance;

      // Combine importance with relevance
      symbol.importance = symbol.importance * 0.3 + relevance * 0.7;
    }

    return ranked.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Calculate importance score
   */
  private calculateImportance(
    symbol: RepoSymbol,
    graph: RepoGraph,
    pageRank: number
  ): number {
    let importance = pageRank;

    // Boost for exported symbols
    if (symbol.exported) {
      importance *= 1.5;
    }

    // Boost for certain kinds
    const kindBoosts: Record<string, number> = {
      class: 1.3,
      interface: 1.2,
      function: 1.0,
      type: 1.1,
      method: 0.9,
      variable: 0.7,
    };
    importance *= kindBoosts[symbol.kind] ?? 1.0;

    // Penalty for test files
    if (symbol.filePath.includes('test') || symbol.filePath.includes('spec')) {
      importance *= 0.5;
    }

    return importance;
  }

  /**
   * Get top N symbols
   */
  getTopSymbols(graph: RepoGraph, n: number): RankedSymbol[] {
    return this.rank(graph).slice(0, n);
  }

  /**
   * Get symbols related to a specific symbol
   */
  getRelatedSymbols(
    graph: RepoGraph,
    symbolId: string,
    depth: number = 1
  ): RankedSymbol[] {
    const related = new Set<string>();
    const toVisit = [symbolId];
    let currentDepth = 0;

    const outgoing = this.graphBuilder.buildAdjacencyList(graph);
    const incoming = this.graphBuilder.buildReverseAdjacency(graph);

    while (currentDepth < depth && toVisit.length > 0) {
      const nextLevel: string[] = [];

      for (const id of toVisit) {
        // Add outgoing connections
        for (const out of outgoing.get(id) ?? []) {
          if (out !== symbolId && !related.has(out)) {
            related.add(out);
            nextLevel.push(out);
          }
        }

        // Add incoming connections
        for (const inc of incoming.get(id) ?? []) {
          if (inc !== symbolId && !related.has(inc)) {
            related.add(inc);
            nextLevel.push(inc);
          }
        }
      }

      toVisit.length = 0;
      toVisit.push(...nextLevel);
      currentDepth++;
    }

    // Rank and return related symbols
    const allRanked = this.rank(graph);
    return allRanked.filter(s => related.has(s.id));
  }
}
