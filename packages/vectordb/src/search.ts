/**
 * Titan AI VectorDB - Search Engine
 * Advanced semantic search with filtering
 */

import type { SearchQuery, SearchResult, SearchFilters, CodeChunk } from './types.js';
import type { VectorDBClient } from './client.js';

export class SearchEngine {
  private client: VectorDBClient;

  constructor(client: VectorDBClient) {
    this.client = client;
  }

  /**
   * Perform semantic search
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    // Generate embedding for query
    const embedding = await this.client.getEmbeddingService().embedSingle(query.text);

    // Build filter string
    const filter = this.buildFilter(query.filters);

    // Execute vector search
    const results = await this.client.vectorSearch(
      embedding,
      query.limit ?? 10,
      filter
    );

    // Filter by minimum score
    const filtered = query.minScore
      ? results.filter(r => r.score >= query.minScore!)
      : results;

    // Add highlights
    return filtered.map(r => ({
      ...r,
      highlights: this.extractHighlights(r.chunk.content, query.text),
    }));
  }

  /**
   * Hybrid search (vector + keyword)
   */
  async hybridSearch(
    query: SearchQuery,
    keywordWeight: number = 0.3
  ): Promise<SearchResult[]> {
    // Get vector results
    const vectorResults = await this.search(query);

    // Simple keyword matching for reranking
    const reranked = vectorResults.map(result => {
      const keywordScore = this.calculateKeywordScore(
        result.chunk.content,
        query.text
      );
      const hybridScore =
        result.score * (1 - keywordWeight) + keywordScore * keywordWeight;

      return {
        ...result,
        score: hybridScore,
      };
    });

    return reranked.sort((a, b) => b.score - a.score);
  }

  /**
   * Build LanceDB filter string
   */
  private buildFilter(filters?: SearchFilters): string | undefined {
    if (!filters) return undefined;

    const conditions: string[] = [];

    if (filters.filePath) {
      const paths = Array.isArray(filters.filePath)
        ? filters.filePath
        : [filters.filePath];
      const pathConditions = paths.map(p => `filePath LIKE '%${p}%'`);
      conditions.push(`(${pathConditions.join(' OR ')})`);
    }

    if (filters.language) {
      const langs = Array.isArray(filters.language)
        ? filters.language
        : [filters.language];
      const langConditions = langs.map(l => `language = '${l}'`);
      conditions.push(`(${langConditions.join(' OR ')})`);
    }

    if (filters.chunkType) {
      const types = Array.isArray(filters.chunkType)
        ? filters.chunkType
        : [filters.chunkType];
      const typeConditions = types.map(t => `type = '${t}'`);
      conditions.push(`(${typeConditions.join(' OR ')})`);
    }

    return conditions.length > 0 ? conditions.join(' AND ') : undefined;
  }

  /**
   * Calculate keyword match score
   */
  private calculateKeywordScore(content: string, query: string): number {
    const contentLower = content.toLowerCase();
    const words = query.toLowerCase().split(/\s+/);

    let matches = 0;
    for (const word of words) {
      if (contentLower.includes(word)) {
        matches++;
      }
    }

    return words.length > 0 ? matches / words.length : 0;
  }

  /**
   * Extract highlighted snippets
   */
  private extractHighlights(content: string, query: string): string[] {
    const highlights: string[] = [];
    const words = query.toLowerCase().split(/\s+/);
    const lines = content.split('\n');

    for (const line of lines) {
      const lineLower = line.toLowerCase();
      for (const word of words) {
        if (lineLower.includes(word) && line.trim().length > 0) {
          highlights.push(line.trim());
          break;
        }
      }
      if (highlights.length >= 3) break;
    }

    return highlights;
  }
}
