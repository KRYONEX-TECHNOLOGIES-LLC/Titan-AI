/**
 * Titan AI VectorDB - LanceDB Client
 * Main client for vector storage operations
 */

import * as lancedb from '@lancedb/lancedb';
import type {
  VectorDBConfig,
  CodeChunk,
  SearchQuery,
  SearchResult,
  IndexStats,
  SyncResult,
} from './types.js';
import { EmbeddingService } from './embeddings.js';
import { SearchEngine } from './search.js';
import { EmbeddingCache } from './cache.js';

export class VectorDBClient {
  private config: VectorDBConfig;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private embeddings: EmbeddingService;
  private search: SearchEngine;
  private cache: EmbeddingCache;

  constructor(config: VectorDBConfig) {
    this.config = {
      tableName: 'code_chunks',
      cacheEnabled: true,
      cacheTTL: 3600000, // 1 hour
      ...config,
    };

    this.embeddings = new EmbeddingService(config.embedding);
    this.search = new SearchEngine(this);
    this.cache = new EmbeddingCache({
      enabled: this.config.cacheEnabled ?? true,
      ttl: this.config.cacheTTL ?? 3600000,
    });
  }

  /**
   * Initialize the database connection
   */
  async initialize(): Promise<void> {
    this.db = await lancedb.connect(this.config.path);

    // Check if table exists
    const tables = await this.db.tableNames();
    if (tables.includes(this.config.tableName!)) {
      this.table = await this.db.openTable(this.config.tableName!);
    }
  }

  /**
   * Create or get the code chunks table
   */
  async ensureTable(): Promise<lancedb.Table> {
    if (!this.db) {
      await this.initialize();
    }

    if (!this.table) {
      // Create table with schema
      const dimensions = this.config.embedding.dimensions ?? 1536;
      
      this.table = await this.db!.createTable(this.config.tableName!, [
        {
          id: 'init',
          filePath: '',
          content: '',
          startLine: 0,
          endLine: 0,
          type: 'other',
          language: '',
          symbols: [],
          vector: new Array(dimensions).fill(0),
          metadata: JSON.stringify({}),
        },
      ]);

      // Delete the init row
      await this.table.delete('id = "init"');
    }

    return this.table;
  }

  /**
   * Add chunks to the database
   */
  async addChunks(chunks: CodeChunk[]): Promise<void> {
    const table = await this.ensureTable();

    // Generate embeddings for chunks without them
    const chunksToEmbed = chunks.filter(c => !c.embedding);
    if (chunksToEmbed.length > 0) {
      const texts = chunksToEmbed.map(c => c.content);
      const embeddings = await this.embeddings.embed(texts);

      for (let i = 0; i < chunksToEmbed.length; i++) {
        chunksToEmbed[i].embedding = embeddings[i];
      }
    }

    // Convert to table format
    const rows = chunks.map(chunk => ({
      id: chunk.id,
      filePath: chunk.filePath,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      type: chunk.type,
      language: chunk.language,
      symbols: chunk.symbols,
      vector: chunk.embedding,
      metadata: JSON.stringify(chunk.metadata),
    }));

    await table.add(rows);
  }

  /**
   * Update existing chunks
   */
  async updateChunks(chunks: CodeChunk[]): Promise<void> {
    const table = await this.ensureTable();

    for (const chunk of chunks) {
      // Generate embedding if not present
      if (!chunk.embedding) {
        const [embedding] = await this.embeddings.embed([chunk.content]);
        chunk.embedding = embedding;
      }

      // Delete old and add new
      await table.delete(`id = "${chunk.id}"`);
      await this.addChunks([chunk]);
    }
  }

  /**
   * Delete chunks by IDs
   */
  async deleteChunks(ids: string[]): Promise<void> {
    const table = await this.ensureTable();

    for (const id of ids) {
      await table.delete(`id = "${id}"`);
    }
  }

  /**
   * Delete chunks by file path
   */
  async deleteByFile(filePath: string): Promise<void> {
    const table = await this.ensureTable();
    await table.delete(`filePath = "${filePath}"`);
  }

  /**
   * Search for similar chunks
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    return this.search.search(query);
  }

  /**
   * Perform vector search
   */
  async vectorSearch(
    queryVector: number[],
    limit: number = 10,
    filter?: string
  ): Promise<SearchResult[]> {
    const table = await this.ensureTable();

    let search = table.search(queryVector).limit(limit);

    if (filter) {
      search = search.where(filter);
    }

    const results = await search.toArray();

    return results.map(row => ({
      chunk: {
        id: row.id as string,
        filePath: row.filePath as string,
        content: row.content as string,
        startLine: row.startLine as number,
        endLine: row.endLine as number,
        type: row.type as CodeChunk['type'],
        language: row.language as string,
        symbols: row.symbols as string[],
        metadata: JSON.parse(row.metadata as string),
      },
      score: row._distance as number,
    }));
  }

  /**
   * Get chunk by ID
   */
  async getChunk(id: string): Promise<CodeChunk | null> {
    const table = await this.ensureTable();
    const results = await table.search([]).where(`id = "${id}"`).limit(1).toArray();

    if (results.length === 0) return null;

    const row = results[0];
    return {
      id: row.id as string,
      filePath: row.filePath as string,
      content: row.content as string,
      startLine: row.startLine as number,
      endLine: row.endLine as number,
      type: row.type as CodeChunk['type'],
      language: row.language as string,
      symbols: row.symbols as string[],
      metadata: JSON.parse(row.metadata as string),
    };
  }

  /**
   * Get all chunks for a file
   */
  async getChunksByFile(filePath: string): Promise<CodeChunk[]> {
    const table = await this.ensureTable();
    const results = await table
      .search([])
      .where(`filePath = "${filePath}"`)
      .toArray();

    return results.map(row => ({
      id: row.id as string,
      filePath: row.filePath as string,
      content: row.content as string,
      startLine: row.startLine as number,
      endLine: row.endLine as number,
      type: row.type as CodeChunk['type'],
      language: row.language as string,
      symbols: row.symbols as string[],
      metadata: JSON.parse(row.metadata as string),
    }));
  }

  /**
   * Get index statistics
   */
  async getStats(): Promise<IndexStats> {
    const table = await this.ensureTable();
    const count = await table.countRows();

    // These would need aggregation queries in production
    return {
      totalChunks: count,
      totalFiles: 0, // Would need distinct count
      byLanguage: {},
      byType: {} as Record<CodeChunk['type'], number>,
      lastUpdated: Date.now(),
      sizeBytes: 0,
    };
  }

  /**
   * Sync with a file system
   */
  async sync(
    getFiles: () => Promise<string[]>,
    readFile: (path: string) => Promise<string>,
    parseChunks: (path: string, content: string) => CodeChunk[]
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      added: 0,
      updated: 0,
      deleted: 0,
      errors: [],
      duration: 0,
    };

    try {
      const files = await getFiles();

      for (const filePath of files) {
        try {
          const content = await readFile(filePath);
          const chunks = parseChunks(filePath, content);

          // Delete existing chunks for this file
          await this.deleteByFile(filePath);

          // Add new chunks
          await this.addChunks(chunks);
          result.added += chunks.length;
        } catch (error) {
          result.errors.push(`${filePath}: ${error}`);
        }
      }
    } catch (error) {
      result.errors.push(`Sync failed: ${error}`);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    this.db = null;
    this.table = null;
  }

  /**
   * Get embedding service
   */
  getEmbeddingService(): EmbeddingService {
    return this.embeddings;
  }

  /**
   * Get cache
   */
  getCache(): EmbeddingCache {
    return this.cache;
  }
}

/**
 * Create a VectorDB client
 */
export function createVectorDB(config: VectorDBConfig): VectorDBClient {
  return new VectorDBClient(config);
}
