/**
 * Project Midnight - Repository Map Provider
 * Generates global context summaries for Sentinel using @titan/repo-map
 */

import type { RepoMapProvider } from './agent-loop.js';

/**
 * Types from @titan/repo-map
 */
export interface RepoGraph {
  symbols: Map<string, RepoSymbol>;
  references: SymbolReference[];
  files: Map<string, string[]>;
}

export interface RepoSymbol {
  id: string;
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'method' | 'variable';
  filePath: string;
  startLine: number;
  endLine: number;
  signature?: string;
  exported: boolean;
}

export interface RankedSymbol extends RepoSymbol {
  rank: number;
  importance: number;
  relevance?: number;
}

export interface SymbolReference {
  fromSymbol: string;
  toSymbol: string;
  type: 'call' | 'import' | 'extend' | 'implement' | 'use';
}

export interface IRepoMapper {
  map(rootPath: string): Promise<RepoGraph>;
  getStats(): MapStats;
  getGraph(): RepoGraph;
}

export interface ISymbolRanker {
  rank(graph: RepoGraph): RankedSymbol[];
  getTopSymbols(graph: RepoGraph, n: number): RankedSymbol[];
  rankWithRelevance(graph: RepoGraph, query: string, focusSymbols?: string[]): RankedSymbol[];
}

export interface MapStats {
  totalFiles: number;
  totalSymbols: number;
  totalReferences: number;
  byLanguage: Record<string, number>;
  byKind: Record<string, number>;
  lastUpdated: number;
}

export interface RepoMapProviderConfig {
  maxSymbols: number;
  includeSignatures: boolean;
  groupByFile: boolean;
  includeReferences: boolean;
}

/**
 * Repository Map Provider for Sentinel
 * Generates structured context summaries for architectural verification
 */
export class RepoMapProviderImpl implements RepoMapProvider {
  private config: RepoMapProviderConfig;
  private mapper: IRepoMapper | null = null;
  private ranker: ISymbolRanker | null = null;
  private cache: Map<string, { summary: string; timestamp: number }> = new Map();
  private cacheTimeout = 60000; // 1 minute cache

  constructor(config: Partial<RepoMapProviderConfig> = {}) {
    this.config = {
      maxSymbols: 100,
      includeSignatures: true,
      groupByFile: true,
      includeReferences: true,
      ...config,
    };
  }

  /**
   * Initialize the repo mapper (lazy initialization)
   */
  private async initialize(): Promise<void> {
    if (this.mapper && this.ranker) return;

    try {
      // Dynamic import of @titan/repo-map
      const repoMap = await import('@titan/repo-map');
      this.mapper = new repoMap.RepoMapper() as IRepoMapper;
      this.ranker = new repoMap.SymbolRanker() as ISymbolRanker;
    } catch (error) {
      console.warn('RepoMapper not available:', error);
    }
  }

  /**
   * Get repository map as a formatted string for Sentinel
   */
  async getRepoMap(projectPath: string): Promise<string> {
    // Check cache
    const cached = this.cache.get(projectPath);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.summary;
    }

    await this.initialize();

    if (!this.mapper || !this.ranker) {
      // Fallback: return basic file list
      return this.getFallbackRepoMap(projectPath);
    }

    try {
      // Map the repository
      const graph = await this.mapper.map(projectPath);
      
      // Rank symbols
      const rankedSymbols = this.ranker.getTopSymbols(graph, this.config.maxSymbols);
      
      // Generate summary
      const summary = this.generateSummary(graph, rankedSymbols);

      // Cache result
      this.cache.set(projectPath, { summary, timestamp: Date.now() });

      return summary;
    } catch (error) {
      console.error('Failed to generate repo map:', error);
      return this.getFallbackRepoMap(projectPath);
    }
  }

  /**
   * Generate a structured summary for Sentinel
   */
  private generateSummary(graph: RepoGraph, rankedSymbols: RankedSymbol[]): string {
    const lines: string[] = [];

    lines.push('# Repository Architecture Summary');
    lines.push('');

    // Statistics
    const stats = this.mapper?.getStats();
    if (stats) {
      lines.push('## Statistics');
      lines.push(`- Total Files: ${stats.totalFiles}`);
      lines.push(`- Total Symbols: ${stats.totalSymbols}`);
      lines.push(`- Total References: ${stats.totalReferences}`);
      lines.push('');
    }

    // Group symbols by kind
    const byKind: Record<string, RankedSymbol[]> = {};
    for (const symbol of rankedSymbols) {
      if (!byKind[symbol.kind]) {
        byKind[symbol.kind] = [];
      }
      byKind[symbol.kind].push(symbol);
    }

    // Classes (most important for architecture)
    if (byKind['class']?.length) {
      lines.push('## Classes');
      for (const symbol of byKind['class'].slice(0, 20)) {
        lines.push(this.formatSymbol(symbol));
      }
      lines.push('');
    }

    // Interfaces
    if (byKind['interface']?.length) {
      lines.push('## Interfaces');
      for (const symbol of byKind['interface'].slice(0, 15)) {
        lines.push(this.formatSymbol(symbol));
      }
      lines.push('');
    }

    // Types
    if (byKind['type']?.length) {
      lines.push('## Types');
      for (const symbol of byKind['type'].slice(0, 15)) {
        lines.push(this.formatSymbol(symbol));
      }
      lines.push('');
    }

    // Key Functions (exported only)
    const exportedFunctions = (byKind['function'] ?? [])
      .filter(s => s.exported)
      .slice(0, 25);
    
    if (exportedFunctions.length) {
      lines.push('## Key Functions');
      for (const symbol of exportedFunctions) {
        lines.push(this.formatSymbol(symbol));
      }
      lines.push('');
    }

    // File structure summary
    if (this.config.groupByFile) {
      lines.push('## File Structure');
      const fileGroups = this.groupByFile(rankedSymbols);
      for (const [file, symbols] of Object.entries(fileGroups).slice(0, 20)) {
        lines.push(`- \`${file}\`: ${symbols.map(s => s.name).join(', ')}`);
      }
      lines.push('');
    }

    // Key dependencies (references)
    if (this.config.includeReferences && graph.references.length > 0) {
      lines.push('## Key Dependencies');
      const dependencies = this.summarizeDependencies(graph, rankedSymbols);
      for (const dep of dependencies.slice(0, 20)) {
        lines.push(`- ${dep}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format a single symbol
   */
  private formatSymbol(symbol: RankedSymbol): string {
    const location = `${symbol.filePath}:${symbol.startLine}`;
    const exportMark = symbol.exported ? '(exported)' : '';
    
    if (this.config.includeSignatures && symbol.signature) {
      return `- \`${symbol.signature}\` ${exportMark} @ ${location}`;
    }
    
    return `- \`${symbol.name}\` [${symbol.kind}] ${exportMark} @ ${location}`;
  }

  /**
   * Group symbols by file
   */
  private groupByFile(symbols: RankedSymbol[]): Record<string, RankedSymbol[]> {
    const groups: Record<string, RankedSymbol[]> = {};
    
    for (const symbol of symbols) {
      if (!groups[symbol.filePath]) {
        groups[symbol.filePath] = [];
      }
      groups[symbol.filePath].push(symbol);
    }
    
    return groups;
  }

  /**
   * Summarize dependencies
   */
  private summarizeDependencies(graph: RepoGraph, rankedSymbols: RankedSymbol[]): string[] {
    const topSymbolIds = new Set(rankedSymbols.slice(0, 30).map(s => s.id));
    const dependencies: string[] = [];

    for (const ref of graph.references) {
      if (topSymbolIds.has(ref.fromSymbol) || topSymbolIds.has(ref.toSymbol)) {
        const from = graph.symbols.get(ref.fromSymbol);
        const to = graph.symbols.get(ref.toSymbol);
        
        if (from && to) {
          dependencies.push(
            `${from.name} --[${ref.type}]--> ${to.name}`
          );
        }
      }
    }

    // Dedupe and limit
    return [...new Set(dependencies)].slice(0, 20);
  }

  /**
   * Fallback when @titan/repo-map is not available
   */
  private async getFallbackRepoMap(projectPath: string): Promise<string> {
    try {
      const { readdir, stat } = await import('fs/promises');
      const { join, relative } = await import('path');

      const files: string[] = [];
      
      const walk = async (dir: string) => {
        const entries = await readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          const relPath = relative(projectPath, fullPath);
          
          // Skip common non-source directories
          if (entry.name.startsWith('.') || 
              entry.name === 'node_modules' ||
              entry.name === 'dist' ||
              entry.name === 'build') {
            continue;
          }
          
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.isFile()) {
            const ext = entry.name.split('.').pop();
            if (['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go'].includes(ext ?? '')) {
              files.push(relPath);
            }
          }
        }
      };

      await walk(projectPath);

      return [
        '# Repository Structure',
        '',
        '## Source Files',
        ...files.slice(0, 100).map(f => `- ${f}`),
        '',
        `_Total: ${files.length} source files_`,
      ].join('\n');
    } catch {
      return '# Repository Structure\n\n_Unable to scan repository_';
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cached entry
   */
  getCachedMap(projectPath: string): string | null {
    const cached = this.cache.get(projectPath);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.summary;
    }
    return null;
  }
}

/**
 * Create a RepoMapProvider
 */
export function createRepoMapProvider(
  config: Partial<RepoMapProviderConfig> = {}
): RepoMapProvider {
  return new RepoMapProviderImpl(config);
}
