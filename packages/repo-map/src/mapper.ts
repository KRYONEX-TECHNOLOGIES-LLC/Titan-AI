/**
 * Titan AI Repo Map - Repository Mapper
 * Build a map of all symbols in a repository
 */

import { readdir, stat, readFile } from 'fs/promises';
import { join, extname, relative } from 'path';
import type {
  RepoMapConfig,
  RepoGraph,
  RepoSymbol,
  SymbolReference,
  FileInfo,
  MapStats,
} from './types.js';
import { RepoGraphBuilder } from './graph.js';

export class RepoMapper {
  private config: RepoMapConfig;
  private graph: RepoGraph;
  private graphBuilder: RepoGraphBuilder;

  constructor(config: Partial<RepoMapConfig> = {}) {
    this.config = {
      includePaths: ['**/*'],
      excludePaths: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
      languages: ['typescript', 'javascript', 'python', 'rust', 'go'],
      maxFileSize: 1024 * 1024, // 1MB
      cacheEnabled: true,
      ...config,
    };

    this.graph = {
      symbols: new Map(),
      references: [],
      files: new Map(),
    };

    this.graphBuilder = new RepoGraphBuilder();
  }

  /**
   * Map a repository
   */
  async map(rootPath: string): Promise<RepoGraph> {
    // Find all files
    const files = await this.findFiles(rootPath);

    // Parse each file
    for (const filePath of files) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const relativePath = relative(rootPath, filePath);
        const fileInfo = await this.parseFile(relativePath, content);

        // Add symbols to graph
        for (const symbol of fileInfo.symbols) {
          this.graph.symbols.set(symbol.id, symbol);
        }

        // Track symbols per file
        this.graph.files.set(relativePath, fileInfo.symbols.map(s => s.id));
      } catch (error) {
        // Skip files that can't be parsed
      }
    }

    // Build references
    this.graph.references = await this.graphBuilder.buildReferences(this.graph);

    return this.graph;
  }

  /**
   * Find all source files in repository
   */
  private async findFiles(rootPath: string): Promise<string[]> {
    const files: string[] = [];
    const languageExtensions: Record<string, string[]> = {
      typescript: ['.ts', '.tsx'],
      javascript: ['.js', '.jsx', '.mjs'],
      python: ['.py'],
      rust: ['.rs'],
      go: ['.go'],
    };

    const allowedExtensions = this.config.languages.flatMap(
      lang => languageExtensions[lang] ?? []
    );

    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relativePath = relative(rootPath, fullPath);

        // Check exclusions
        if (this.shouldExclude(relativePath)) continue;

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name);
          if (allowedExtensions.includes(ext)) {
            // Check file size
            const stats = await stat(fullPath);
            if (stats.size <= this.config.maxFileSize) {
              files.push(fullPath);
            }
          }
        }
      }
    };

    await walk(rootPath);
    return files;
  }

  /**
   * Check if path should be excluded
   */
  private shouldExclude(path: string): boolean {
    for (const pattern of this.config.excludePaths) {
      if (this.matchGlob(path, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Simple glob matching
   */
  private matchGlob(path: string, pattern: string): boolean {
    const regex = pattern
      .replace(/\*\*/g, '<<<GLOBSTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<GLOBSTAR>>>/g, '.*');
    return new RegExp(`^${regex}$`).test(path);
  }

  /**
   * Parse a file for symbols
   */
  private async parseFile(filePath: string, content: string): Promise<FileInfo> {
    const ext = extname(filePath);
    const language = this.getLanguage(ext);
    const symbols: RepoSymbol[] = [];

    // Extract symbols based on language
    const extractedSymbols = this.extractSymbols(content, language, filePath);
    symbols.push(...extractedSymbols);

    return {
      path: filePath,
      language,
      size: content.length,
      lastModified: Date.now(),
      symbols,
    };
  }

  /**
   * Get language from extension
   */
  private getLanguage(ext: string): string {
    const map: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.py': 'python',
      '.rs': 'rust',
      '.go': 'go',
    };
    return map[ext] ?? 'unknown';
  }

  /**
   * Extract symbols from content
   */
  private extractSymbols(
    content: string,
    language: string,
    filePath: string
  ): RepoSymbol[] {
    const symbols: RepoSymbol[] = [];
    const lines = content.split('\n');

    // Language-specific extraction
    switch (language) {
      case 'typescript':
      case 'javascript':
        symbols.push(...this.extractTSSymbols(content, filePath, lines));
        break;
      case 'python':
        symbols.push(...this.extractPythonSymbols(content, filePath, lines));
        break;
      case 'rust':
        symbols.push(...this.extractRustSymbols(content, filePath, lines));
        break;
      case 'go':
        symbols.push(...this.extractGoSymbols(content, filePath, lines));
        break;
    }

    return symbols;
  }

  /**
   * Extract TypeScript/JavaScript symbols
   */
  private extractTSSymbols(
    content: string,
    filePath: string,
    lines: string[]
  ): RepoSymbol[] {
    const symbols: RepoSymbol[] = [];

    // Function/const declarations
    const funcRegex = /^(?:export\s+)?(?:async\s+)?(?:function|const|let|var)\s+(\w+)/gm;
    // Class declarations
    const classRegex = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm;
    // Interface/type declarations
    const interfaceRegex = /^(?:export\s+)?(?:interface|type)\s+(\w+)/gm;

    let match;

    while ((match = funcRegex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      symbols.push({
        id: `${filePath}:${match[1]}`,
        name: match[1],
        kind: 'function',
        filePath,
        startLine: line,
        endLine: line,
        signature: match[0],
        exported: match[0].includes('export'),
      });
    }

    while ((match = classRegex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      symbols.push({
        id: `${filePath}:${match[1]}`,
        name: match[1],
        kind: 'class',
        filePath,
        startLine: line,
        endLine: line,
        signature: match[0],
        exported: match[0].includes('export'),
      });
    }

    while ((match = interfaceRegex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      symbols.push({
        id: `${filePath}:${match[1]}`,
        name: match[1],
        kind: match[0].includes('interface') ? 'interface' : 'type',
        filePath,
        startLine: line,
        endLine: line,
        signature: match[0],
        exported: match[0].includes('export'),
      });
    }

    return symbols;
  }

  /**
   * Extract Python symbols
   */
  private extractPythonSymbols(
    content: string,
    filePath: string,
    lines: string[]
  ): RepoSymbol[] {
    const symbols: RepoSymbol[] = [];

    const funcRegex = /^(?:async\s+)?def\s+(\w+)/gm;
    const classRegex = /^class\s+(\w+)/gm;

    let match;

    while ((match = funcRegex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      symbols.push({
        id: `${filePath}:${match[1]}`,
        name: match[1],
        kind: 'function',
        filePath,
        startLine: line,
        endLine: line,
        signature: match[0],
        exported: !match[1].startsWith('_'),
      });
    }

    while ((match = classRegex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      symbols.push({
        id: `${filePath}:${match[1]}`,
        name: match[1],
        kind: 'class',
        filePath,
        startLine: line,
        endLine: line,
        signature: match[0],
        exported: !match[1].startsWith('_'),
      });
    }

    return symbols;
  }

  /**
   * Extract Rust symbols
   */
  private extractRustSymbols(
    content: string,
    filePath: string,
    lines: string[]
  ): RepoSymbol[] {
    const symbols: RepoSymbol[] = [];

    const funcRegex = /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm;
    const structRegex = /^(?:pub\s+)?struct\s+(\w+)/gm;
    const implRegex = /^impl(?:<[^>]+>)?\s+(\w+)/gm;

    let match;

    while ((match = funcRegex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      symbols.push({
        id: `${filePath}:${match[1]}`,
        name: match[1],
        kind: 'function',
        filePath,
        startLine: line,
        endLine: line,
        signature: match[0],
        exported: match[0].includes('pub'),
      });
    }

    while ((match = structRegex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      symbols.push({
        id: `${filePath}:${match[1]}`,
        name: match[1],
        kind: 'class',
        filePath,
        startLine: line,
        endLine: line,
        signature: match[0],
        exported: match[0].includes('pub'),
      });
    }

    return symbols;
  }

  /**
   * Extract Go symbols
   */
  private extractGoSymbols(
    content: string,
    filePath: string,
    lines: string[]
  ): RepoSymbol[] {
    const symbols: RepoSymbol[] = [];

    const funcRegex = /^func\s+(?:\([^)]+\)\s+)?(\w+)/gm;
    const typeRegex = /^type\s+(\w+)\s+(?:struct|interface)/gm;

    let match;

    while ((match = funcRegex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      const name = match[1];
      symbols.push({
        id: `${filePath}:${name}`,
        name,
        kind: 'function',
        filePath,
        startLine: line,
        endLine: line,
        signature: match[0],
        exported: name[0] === name[0].toUpperCase(),
      });
    }

    while ((match = typeRegex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      const name = match[1];
      symbols.push({
        id: `${filePath}:${name}`,
        name,
        kind: 'class',
        filePath,
        startLine: line,
        endLine: line,
        signature: match[0],
        exported: name[0] === name[0].toUpperCase(),
      });
    }

    return symbols;
  }

  /**
   * Get line number from index
   */
  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  /**
   * Get statistics
   */
  getStats(): MapStats {
    const byKind: Record<string, number> = {};
    const byLanguage: Record<string, number> = {};

    for (const symbol of this.graph.symbols.values()) {
      byKind[symbol.kind] = (byKind[symbol.kind] ?? 0) + 1;
    }

    for (const [file] of this.graph.files) {
      const ext = extname(file);
      const lang = this.getLanguage(ext);
      byLanguage[lang] = (byLanguage[lang] ?? 0) + 1;
    }

    return {
      totalFiles: this.graph.files.size,
      totalSymbols: this.graph.symbols.size,
      totalReferences: this.graph.references.length,
      byLanguage,
      byKind: byKind as Record<RepoSymbol['kind'], number>,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Get the graph
   */
  getGraph(): RepoGraph {
    return this.graph;
  }
}
