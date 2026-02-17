/**
 * Titan AI Repo Map - Context Selector
 * Select relevant context for LLM prompts
 */

import { readFile } from 'fs/promises';
import type {
  RepoGraph,
  ContextSelectionOptions,
  SelectedContext,
  RankedSymbol,
  RepoSymbol,
} from './types.js';
import { SymbolRanker } from './ranker.js';

export class ContextSelector {
  private ranker: SymbolRanker;

  constructor() {
    this.ranker = new SymbolRanker();
  }

  /**
   * Select context for an LLM prompt
   */
  async select(
    graph: RepoGraph,
    query: string,
    rootPath: string,
    options: Partial<ContextSelectionOptions> = {}
  ): Promise<SelectedContext> {
    const config: ContextSelectionOptions = {
      maxTokens: 50000,
      maxFiles: 20,
      includeImports: true,
      includeTests: false,
      prioritizeRecent: true,
      ...options,
    };

    // Rank symbols with relevance to query
    const ranked = this.ranker.rankWithRelevance(
      graph,
      query,
      config.focusSymbols
    );

    // Filter symbols
    const filtered = this.filterSymbols(ranked, config);

    // Group by file
    const fileGroups = this.groupByFile(filtered);

    // Select files up to token limit
    const selected = await this.selectFiles(
      fileGroups,
      rootPath,
      config
    );

    return selected;
  }

  /**
   * Filter symbols based on options
   */
  private filterSymbols(
    symbols: RankedSymbol[],
    options: ContextSelectionOptions
  ): RankedSymbol[] {
    return symbols.filter(s => {
      // Filter test files
      if (!options.includeTests) {
        if (
          s.filePath.includes('.test.') ||
          s.filePath.includes('.spec.') ||
          s.filePath.includes('__tests__')
        ) {
          return false;
        }
      }

      // Focus on specific files
      if (options.focusFiles && options.focusFiles.length > 0) {
        if (!options.focusFiles.some(f => s.filePath.includes(f))) {
          // Reduce importance for non-focus files
          s.importance *= 0.5;
        }
      }

      return true;
    });
  }

  /**
   * Group symbols by file
   */
  private groupByFile(
    symbols: RankedSymbol[]
  ): Map<string, { symbols: RankedSymbol[]; totalImportance: number }> {
    const groups = new Map<string, { symbols: RankedSymbol[]; totalImportance: number }>();

    for (const symbol of symbols) {
      const existing = groups.get(symbol.filePath);
      if (existing) {
        existing.symbols.push(symbol);
        existing.totalImportance += symbol.importance;
      } else {
        groups.set(symbol.filePath, {
          symbols: [symbol],
          totalImportance: symbol.importance,
        });
      }
    }

    return groups;
  }

  /**
   * Select files up to token limit
   */
  private async selectFiles(
    fileGroups: Map<string, { symbols: RankedSymbol[]; totalImportance: number }>,
    rootPath: string,
    options: ContextSelectionOptions
  ): Promise<SelectedContext> {
    const context: SelectedContext = {
      files: [],
      totalTokens: 0,
      truncated: false,
    };

    // Sort files by total importance
    const sortedFiles = Array.from(fileGroups.entries())
      .sort((a, b) => b[1].totalImportance - a[1].totalImportance)
      .slice(0, options.maxFiles);

    for (const [filePath, { symbols, totalImportance }] of sortedFiles) {
      try {
        const fullPath = `${rootPath}/${filePath}`;
        const content = await readFile(fullPath, 'utf-8');

        // Estimate tokens (rough: 1 token ~= 4 chars)
        const estimatedTokens = Math.ceil(content.length / 4);

        // Check if we'd exceed the limit
        if (context.totalTokens + estimatedTokens > options.maxTokens) {
          // Try to truncate this file
          const availableTokens = options.maxTokens - context.totalTokens;
          if (availableTokens > 1000) {
            const truncatedContent = this.truncateContent(
              content,
              symbols,
              availableTokens
            );
            context.files.push({
              path: filePath,
              content: truncatedContent,
              symbols,
              rank: totalImportance,
            });
            context.totalTokens += Math.ceil(truncatedContent.length / 4);
            context.truncated = true;
          }
          break;
        }

        context.files.push({
          path: filePath,
          content,
          symbols,
          rank: totalImportance,
        });
        context.totalTokens += estimatedTokens;
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return context;
  }

  /**
   * Truncate content while preserving important symbols
   */
  private truncateContent(
    content: string,
    symbols: RankedSymbol[],
    maxTokens: number
  ): string {
    const maxChars = maxTokens * 4;
    const lines = content.split('\n');

    // Find lines containing important symbols
    const importantLines = new Set<number>();
    for (const symbol of symbols.slice(0, 5)) {
      // Add symbol lines plus some context
      for (let i = symbol.startLine - 3; i <= symbol.endLine + 3; i++) {
        if (i >= 1 && i <= lines.length) {
          importantLines.add(i);
        }
      }
    }

    // Build truncated content
    const result: string[] = [];
    let currentChars = 0;
    let inImportant = false;
    let skippedCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const isImportant = importantLines.has(lineNum);

      if (isImportant) {
        if (skippedCount > 0) {
          result.push(`// ... ${skippedCount} lines omitted ...`);
          currentChars += 30;
          skippedCount = 0;
        }
        result.push(lines[i]);
        currentChars += lines[i].length + 1;
        inImportant = true;
      } else {
        skippedCount++;
        inImportant = false;
      }

      if (currentChars >= maxChars) {
        if (skippedCount > 0) {
          result.push(`// ... ${skippedCount} more lines omitted ...`);
        }
        break;
      }
    }

    return result.join('\n');
  }

  /**
   * Format context for LLM prompt
   */
  formatForPrompt(context: SelectedContext): string {
    const parts: string[] = [];

    parts.push('# Relevant Code Context\n');

    for (const file of context.files) {
      parts.push(`## ${file.path}\n`);
      parts.push('```');
      parts.push(file.content);
      parts.push('```\n');
    }

    if (context.truncated) {
      parts.push('\n*Note: Some content was truncated to fit context limits.*\n');
    }

    return parts.join('\n');
  }
}
