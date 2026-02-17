/**
 * Context provider implementations
 */

import type { ContextItem, ContextRequest, ContextProvider, ContextType } from './types';

/**
 * Base context provider class
 */
export abstract class BaseContextProvider implements ContextProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly types: ContextType[];
  readonly priority: number;

  constructor(priority: number = 5) {
    this.priority = priority;
  }

  abstract getContext(request: ContextRequest): Promise<ContextItem[]>;

  protected createItem(
    type: ContextType,
    content: string,
    source: string,
    metadata: Record<string, unknown> = {}
  ): ContextItem {
    return {
      id: `${this.id}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type,
      content,
      source,
      tokens: Math.ceil(content.length / 4),
      relevance: 0.5,
      timestamp: new Date(),
      metadata,
    };
  }
}

/**
 * File context provider
 */
export class FileContextProvider extends BaseContextProvider {
  readonly id = 'file-provider';
  readonly name = 'File Context Provider';
  readonly types: ContextType[] = ['file'];

  private fileReader: (path: string) => Promise<string>;

  constructor(fileReader: (path: string) => Promise<string>, priority: number = 5) {
    super(priority);
    this.fileReader = fileReader;
  }

  async getContext(request: ContextRequest): Promise<ContextItem[]> {
    const items: ContextItem[] = [];

    if (request.currentFile) {
      try {
        const content = await this.fileReader(request.currentFile);
        items.push(this.createItem('file', content, request.currentFile, {
          isCurrent: true,
        }));
      } catch {
        // File read failed, skip
      }
    }

    return items;
  }
}

/**
 * Selection context provider
 */
export class SelectionContextProvider extends BaseContextProvider {
  readonly id = 'selection-provider';
  readonly name = 'Selection Context Provider';
  readonly types: ContextType[] = ['selection'];

  async getContext(request: ContextRequest): Promise<ContextItem[]> {
    if (!request.selection) return [];

    return [
      this.createItem('selection', request.selection, request.currentFile ?? 'unknown', {
        isSelection: true,
      }),
    ];
  }
}

/**
 * Conversation history context provider
 */
export class ConversationContextProvider extends BaseContextProvider {
  readonly id = 'conversation-provider';
  readonly name = 'Conversation Context Provider';
  readonly types: ContextType[] = ['conversation'];

  private maxHistory: number;

  constructor(maxHistory: number = 10, priority: number = 4) {
    super(priority);
    this.maxHistory = maxHistory;
  }

  async getContext(request: ContextRequest): Promise<ContextItem[]> {
    if (!request.conversationHistory || request.conversationHistory.length === 0) {
      return [];
    }

    const recentHistory = request.conversationHistory.slice(-this.maxHistory);
    const content = recentHistory.join('\n\n---\n\n');

    return [
      this.createItem('conversation', content, 'conversation', {
        messageCount: recentHistory.length,
      }),
    ];
  }
}

/**
 * Search results context provider
 */
export class SearchContextProvider extends BaseContextProvider {
  readonly id = 'search-provider';
  readonly name = 'Search Context Provider';
  readonly types: ContextType[] = ['search'];

  private searcher: (query: string) => Promise<SearchResult[]>;

  constructor(searcher: (query: string) => Promise<SearchResult[]>, priority: number = 6) {
    super(priority);
    this.searcher = searcher;
  }

  async getContext(request: ContextRequest): Promise<ContextItem[]> {
    if (!request.query) return [];

    try {
      const results = await this.searcher(request.query);
      
      return results.map(result => 
        this.createItem('search', result.content, result.source, {
          score: result.score,
          matchCount: result.matchCount,
        })
      );
    } catch {
      return [];
    }
  }
}

export interface SearchResult {
  content: string;
  source: string;
  score: number;
  matchCount?: number;
}

/**
 * Diagnostic context provider
 */
export class DiagnosticContextProvider extends BaseContextProvider {
  readonly id = 'diagnostic-provider';
  readonly name = 'Diagnostic Context Provider';
  readonly types: ContextType[] = ['diagnostic'];

  private getDiagnostics: (file?: string) => Promise<Diagnostic[]>;

  constructor(getDiagnostics: (file?: string) => Promise<Diagnostic[]>, priority: number = 8) {
    super(priority);
    this.getDiagnostics = getDiagnostics;
  }

  async getContext(request: ContextRequest): Promise<ContextItem[]> {
    try {
      const diagnostics = await this.getDiagnostics(request.currentFile);
      
      if (diagnostics.length === 0) return [];

      const content = diagnostics
        .map(d => `[${d.severity}] ${d.file}:${d.line}: ${d.message}`)
        .join('\n');

      return [
        this.createItem('diagnostic', content, request.currentFile ?? 'workspace', {
          count: diagnostics.length,
          severities: [...new Set(diagnostics.map(d => d.severity))],
        }),
      ];
    } catch {
      return [];
    }
  }
}

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  code?: string;
}

/**
 * Creates a file context provider
 */
export function createFileProvider(
  fileReader: (path: string) => Promise<string>,
  priority?: number
): FileContextProvider {
  return new FileContextProvider(fileReader, priority);
}

/**
 * Creates a selection context provider
 */
export function createSelectionProvider(priority?: number): SelectionContextProvider {
  return new SelectionContextProvider(priority);
}

/**
 * Creates a conversation context provider
 */
export function createConversationProvider(maxHistory?: number, priority?: number): ConversationContextProvider {
  return new ConversationContextProvider(maxHistory, priority);
}

/**
 * Creates a search context provider
 */
export function createSearchProvider(
  searcher: (query: string) => Promise<SearchResult[]>,
  priority?: number
): SearchContextProvider {
  return new SearchContextProvider(searcher, priority);
}

/**
 * Creates a diagnostic context provider
 */
export function createDiagnosticProvider(
  getDiagnostics: (file?: string) => Promise<Diagnostic[]>,
  priority?: number
): DiagnosticContextProvider {
  return new DiagnosticContextProvider(getDiagnostics, priority);
}
