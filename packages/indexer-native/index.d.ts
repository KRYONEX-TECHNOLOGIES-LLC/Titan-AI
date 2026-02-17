/**
 * Titan AI - Native Indexer TypeScript Definitions
 */

export interface CodeChunk {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  chunkType: string;
  language: string;
  symbols: string[];
  hash: string;
}

export interface Symbol {
  name: string;
  kind: string;
  filePath: string;
  startLine: number;
  endLine: number;
  signature?: string;
  exported: boolean;
}

export interface MerkleNode {
  hash: string;
  path: string;
  isFile: boolean;
  children: string[];
}

export interface SyncDiff {
  added: string[];
  modified: string[];
  deleted: string[];
}

/**
 * Parse a file and extract code chunks
 */
export function parseFile(filePath: string, content: string, language: string): CodeChunk[];

/**
 * Extract symbols from a file
 */
export function extractSymbols(filePath: string, content: string, language: string): Symbol[];

/**
 * Build a Merkle tree from file hashes
 */
export function buildMerkleTree(files: MerkleNode[]): string;

/**
 * Compute diff between two Merkle trees
 */
export function computeMerkleDiff(oldRoot: string, newFiles: MerkleNode[]): SyncDiff;

/**
 * Hash file content
 */
export function hashContent(content: string): string;

/**
 * Chunk code into semantic blocks
 */
export function chunkCode(
  content: string,
  language: string,
  maxChunkSize: number,
  overlap: number
): CodeChunk[];

/**
 * Get supported languages
 */
export function getSupportedLanguages(): string[];

/**
 * Get version info
 */
export function getVersion(): string;
