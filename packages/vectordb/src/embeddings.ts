/**
 * Titan AI VectorDB - Embedding Service
 * Generate embeddings using various providers
 */

import type { EmbeddingConfig, EmbeddingProvider } from './types.js';

export class EmbeddingService {
  private config: EmbeddingConfig;

  constructor(config: EmbeddingConfig) {
    this.config = {
      batchSize: 100,
      dimensions: 1536,
      ...config,
    };
  }

  /**
   * Generate embeddings for texts
   */
  async embed(texts: string[]): Promise<number[][]> {
    const batches = this.batchTexts(texts);
    const results: number[][] = [];

    for (const batch of batches) {
      const embeddings = await this.embedBatch(batch);
      results.push(...embeddings);
    }

    return results;
  }

  /**
   * Embed a single text
   */
  async embedSingle(text: string): Promise<number[]> {
    const [embedding] = await this.embed([text]);
    return embedding;
  }

  /**
   * Embed a batch of texts
   */
  private async embedBatch(texts: string[]): Promise<number[][]> {
    switch (this.config.provider) {
      case 'openai':
        return this.embedOpenAI(texts);
      case 'voyage':
        return this.embedVoyage(texts);
      case 'local':
        return this.embedLocal(texts);
      default:
        throw new Error(`Unknown embedding provider: ${this.config.provider}`);
    }
  }

  /**
   * OpenAI embeddings
   */
  private async embedOpenAI(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model || 'text-embedding-3-small',
        input: texts,
        dimensions: this.config.dimensions,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding error: ${response.status}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
  }

  /**
   * Voyage AI embeddings
   */
  private async embedVoyage(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model || 'voyage-code-3',
        input: texts,
      }),
    });

    if (!response.ok) {
      throw new Error(`Voyage embedding error: ${response.status}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
  }

  /**
   * Local embeddings (Ollama)
   */
  private async embedLocal(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      const response = await fetch('http://localhost:11434/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model || 'nomic-embed-text',
          prompt: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama embedding error: ${response.status}`);
      }

      const data = (await response.json()) as { embedding: number[] };
      embeddings.push(data.embedding);
    }

    return embeddings;
  }

  /**
   * Batch texts for API limits
   */
  private batchTexts(texts: string[]): string[][] {
    const batches: string[][] = [];
    const batchSize = this.config.batchSize ?? 100;

    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Get embedding dimensions
   */
  getDimensions(): number {
    return this.config.dimensions ?? 1536;
  }
}
