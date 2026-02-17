/**
 * Titan AI VectorDB - Type Definitions
 */

// Chunk types
export type ChunkType = 'function' | 'class' | 'method' | 'module' | 'comment' | 'import' | 'other';

// Code chunk stored in vector DB
export interface CodeChunk {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  type: ChunkType;
  language: string;
  symbols: string[];
  embedding?: number[];
  metadata: ChunkMetadata;
}

// Chunk metadata
export interface ChunkMetadata {
  repository?: string;
  branch?: string;
  commit?: string;
  lastModified?: number;
  size: number;
  hash: string;
}

// Search query
export interface SearchQuery {
  text: string;
  filters?: SearchFilters;
  limit?: number;
  minScore?: number;
}

// Search filters
export interface SearchFilters {
  filePath?: string | string[];
  fileType?: string | string[];
  language?: string | string[];
  chunkType?: ChunkType | ChunkType[];
  symbols?: string[];
  modifiedAfter?: number;
  modifiedBefore?: number;
}

// Search result
export interface SearchResult {
  chunk: CodeChunk;
  score: number;
  highlights?: string[];
}

// Embedding provider
export type EmbeddingProvider = 'openai' | 'voyage' | 'local';

// Embedding config
export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string;
  apiKey?: string;
  dimensions?: number;
  batchSize?: number;
}

// VectorDB config
export interface VectorDBConfig {
  path: string;
  tableName?: string;
  embedding: EmbeddingConfig;
  cacheEnabled?: boolean;
  cacheTTL?: number;
}

// Index stats
export interface IndexStats {
  totalChunks: number;
  totalFiles: number;
  byLanguage: Record<string, number>;
  byType: Record<ChunkType, number>;
  lastUpdated: number;
  sizeBytes: number;
}

// Sync result
export interface SyncResult {
  added: number;
  updated: number;
  deleted: number;
  errors: string[];
  duration: number;
}
