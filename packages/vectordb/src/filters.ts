/**
 * Titan AI VectorDB - Filter Builders
 * SQL-like filtering for vector search
 */

import type { SearchFilters, ChunkType } from './types.js';

/**
 * Filter builder for constructing complex queries
 */
export class FilterBuilder {
  private conditions: string[] = [];

  /**
   * Filter by file path (exact or pattern)
   */
  filePath(path: string | string[]): this {
    const paths = Array.isArray(path) ? path : [path];
    const conditions = paths.map(p => {
      if (p.includes('*')) {
        return `filePath LIKE '${p.replace(/\*/g, '%')}'`;
      }
      return `filePath = '${p}'`;
    });
    this.conditions.push(`(${conditions.join(' OR ')})`);
    return this;
  }

  /**
   * Filter by file extension
   */
  fileExtension(ext: string | string[]): this {
    const exts = Array.isArray(ext) ? ext : [ext];
    const conditions = exts.map(e => `filePath LIKE '%.${e}'`);
    this.conditions.push(`(${conditions.join(' OR ')})`);
    return this;
  }

  /**
   * Filter by language
   */
  language(lang: string | string[]): this {
    const langs = Array.isArray(lang) ? lang : [lang];
    const conditions = langs.map(l => `language = '${l}'`);
    this.conditions.push(`(${conditions.join(' OR ')})`);
    return this;
  }

  /**
   * Filter by chunk type
   */
  chunkType(type: ChunkType | ChunkType[]): this {
    const types = Array.isArray(type) ? type : [type];
    const conditions = types.map(t => `type = '${t}'`);
    this.conditions.push(`(${conditions.join(' OR ')})`);
    return this;
  }

  /**
   * Filter by symbol name
   */
  hasSymbol(symbol: string): this {
    this.conditions.push(`array_contains(symbols, '${symbol}')`);
    return this;
  }

  /**
   * Filter by line range
   */
  lineRange(startLine: number, endLine: number): this {
    this.conditions.push(`startLine >= ${startLine} AND endLine <= ${endLine}`);
    return this;
  }

  /**
   * Filter by content containing text
   */
  contentContains(text: string): this {
    this.conditions.push(`content LIKE '%${text}%'`);
    return this;
  }

  /**
   * Exclude paths matching pattern
   */
  excludePath(pattern: string | string[]): this {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    const conditions = patterns.map(p => `filePath NOT LIKE '${p.replace(/\*/g, '%')}'`);
    this.conditions.push(conditions.join(' AND '));
    return this;
  }

  /**
   * Exclude common non-code directories
   */
  excludeNonCode(): this {
    return this.excludePath([
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
    ]);
  }

  /**
   * Build the filter string
   */
  build(): string | undefined {
    if (this.conditions.length === 0) return undefined;
    return this.conditions.join(' AND ');
  }

  /**
   * Reset the builder
   */
  reset(): this {
    this.conditions = [];
    return this;
  }
}

/**
 * Create a new filter builder
 */
export function filter(): FilterBuilder {
  return new FilterBuilder();
}

/**
 * Convert SearchFilters to filter string
 */
export function filtersToString(filters: SearchFilters): string | undefined {
  const builder = new FilterBuilder();

  if (filters.filePath) {
    builder.filePath(filters.filePath);
  }

  if (filters.language) {
    builder.language(filters.language);
  }

  if (filters.chunkType) {
    builder.chunkType(filters.chunkType);
  }

  if (filters.fileType) {
    builder.fileExtension(filters.fileType);
  }

  return builder.build();
}
