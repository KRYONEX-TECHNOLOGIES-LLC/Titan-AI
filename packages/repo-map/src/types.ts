/**
 * Titan AI Repo Map - Type Definitions
 */

// Symbol types
export type SymbolKind = 
  | 'file'
  | 'class'
  | 'interface'
  | 'function'
  | 'method'
  | 'property'
  | 'variable'
  | 'type'
  | 'enum'
  | 'module';

// Symbol in the repository
export interface RepoSymbol {
  id: string;
  name: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
  signature?: string;
  documentation?: string;
  exported: boolean;
}

// Reference between symbols
export interface SymbolReference {
  fromSymbol: string;
  toSymbol: string;
  type: 'import' | 'call' | 'extend' | 'implement' | 'use';
  line?: number;
}

// Repository graph
export interface RepoGraph {
  symbols: Map<string, RepoSymbol>;
  references: SymbolReference[];
  files: Map<string, string[]>; // file -> symbol IDs
}

// Ranked symbol
export interface RankedSymbol extends RepoSymbol {
  rank: number;
  importance: number;
  relevance?: number;
}

// Context selection options
export interface ContextSelectionOptions {
  maxTokens: number;
  maxFiles: number;
  includeImports: boolean;
  includeTests: boolean;
  prioritizeRecent: boolean;
  focusFiles?: string[];
  focusSymbols?: string[];
}

// Selected context
export interface SelectedContext {
  files: Array<{
    path: string;
    content: string;
    symbols: RepoSymbol[];
    rank: number;
  }>;
  totalTokens: number;
  truncated: boolean;
}

// Repo map configuration
export interface RepoMapConfig {
  includePaths: string[];
  excludePaths: string[];
  languages: string[];
  maxFileSize: number;
  cacheEnabled: boolean;
}

// File info
export interface FileInfo {
  path: string;
  language: string;
  size: number;
  lastModified: number;
  symbols: RepoSymbol[];
}

// Map statistics
export interface MapStats {
  totalFiles: number;
  totalSymbols: number;
  totalReferences: number;
  byLanguage: Record<string, number>;
  byKind: Record<SymbolKind, number>;
  lastUpdated: number;
}
