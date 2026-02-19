'use client';

/**
 * Tree-sitter Service
 * Provides structural code intelligence: smart selection, symbol extraction, AST traversal.
 * Runs Tree-sitter WASM in a Web Worker to keep the UI thread unblocked.
 */

export interface CodeSymbol {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'interface' | 'type' | 'const' | 'import' | 'export' | 'method' | 'property';
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  language: string;
}

export interface SelectionRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

type MessageHandler = (data: unknown) => void;

class TreeSitterService {
  private worker: Worker | null = null;
  private pendingCallbacks: Map<string, MessageHandler> = new Map();
  private initialized = false;
  private queue: Array<() => void> = [];

  async init(): Promise<void> {
    if (this.initialized || typeof window === 'undefined') return;

    try {
      this.worker = new Worker(
        new URL('../../workers/tree-sitter.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e) => {
        const { id, result, error } = e.data;
        const cb = this.pendingCallbacks.get(id);
        if (cb) {
          this.pendingCallbacks.delete(id);
          if (error) console.error('[TreeSitter] Worker error:', error);
          else cb(result);
        }
      };

      await this.call('init', {});
      this.initialized = true;
      this.queue.forEach((fn) => fn());
      this.queue = [];
    } catch (err) {
      console.warn('[TreeSitter] Worker unavailable, falling back to heuristic parser:', err);
      this.initialized = true;
    }
  }

  private call<T = unknown>(method: string, args: unknown): Promise<T> {
    return new Promise((resolve) => {
      if (!this.initialized) {
        this.queue.push(() => this.call<T>(method, args).then(resolve));
        return;
      }

      if (!this.worker) {
        // Fallback heuristics
        resolve(this.heuristicFallback(method, args) as T);
        return;
      }

      const id = `${method}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.pendingCallbacks.set(id, resolve as MessageHandler);
      this.worker.postMessage({ id, method, args });
    });
  }

  /**
   * Extract symbols from source code using heuristic regex patterns as fallback.
   * When the WASM worker is available, this delegates to it for full CST accuracy.
   */
  private heuristicFallback(method: string, args: unknown): unknown {
    const a = args as Record<string, string>;

    if (method === 'extractSymbols') {
      const { code, language } = a;
      return extractSymbolsHeuristic(code, language);
    }

    if (method === 'getSmartSelection') {
      const { code, line, column } = (args as unknown) as { code: string; line: number; column: number; language: string };
      return getSmartSelectionHeuristic(code, line, column);
    }

    return null;
  }

  async extractSymbols(code: string, language: string, filePath?: string): Promise<CodeSymbol[]> {
    if (!this.initialized) await this.init();
    const result = await this.call<CodeSymbol[]>('extractSymbols', { code, language, filePath });
    return result ?? [];
  }

  async getSmartSelection(
    code: string,
    line: number,
    column: number,
    language: string
  ): Promise<SelectionRange[]> {
    if (!this.initialized) await this.init();
    const result = await this.call<SelectionRange[]>('getSmartSelection', { code, line, column, language });
    return result ?? [];
  }

  async parse(code: string, language: string): Promise<unknown> {
    if (!this.initialized) await this.init();
    return this.call('parse', { code, language });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
  }
}

// ─── Heuristic symbol extractor ──────────────────────────────────────────────
function extractSymbolsHeuristic(code: string, language: string): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  const lines = code.split('\n');

  const patterns: Array<{ regex: RegExp; kind: CodeSymbol['kind'] }> = [
    { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/, kind: 'function' },
    { regex: /^(?:export\s+)?class\s+(\w+)/, kind: 'class' },
    { regex: /^(?:export\s+)?interface\s+(\w+)/, kind: 'interface' },
    { regex: /^(?:export\s+)?type\s+(\w+)\s*=/, kind: 'type' },
    { regex: /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/, kind: 'function' },
    { regex: /^(?:export\s+)?const\s+(\w+)\s*=/, kind: 'const' },
    { regex: /^\s+(?:async\s+)?(\w+)\s*\(/, kind: 'method' },
    { regex: /^import\s+.+\s+from\s+['"](.+)['"]/, kind: 'import' },
  ];

  lines.forEach((line, i) => {
    for (const { regex, kind } of patterns) {
      const match = line.match(regex);
      if (match) {
        symbols.push({
          name: match[1],
          kind,
          startLine: i + 1,
          endLine: i + 1,
          startColumn: 0,
          endColumn: line.length,
          language,
        });
        break;
      }
    }
  });

  return symbols;
}

// ─── Heuristic smart selection ────────────────────────────────────────────────
function getSmartSelectionHeuristic(code: string, line: number, column: number): SelectionRange[] {
  const lines = code.split('\n');
  const currentLine = lines[line - 1] ?? '';
  const ranges: SelectionRange[] = [];

  // Level 1: word at cursor
  const wordMatch = currentLine.slice(0, column).match(/\w+$/);
  const wordEnd = currentLine.slice(column).match(/^\w*/);
  if (wordMatch) {
    const start = column - wordMatch[0].length;
    const end = column + (wordEnd?.[0].length ?? 0);
    ranges.push({ startLine: line, startColumn: start, endLine: line, endColumn: end });
  }

  // Level 2: full line
  ranges.push({ startLine: line, startColumn: 0, endLine: line, endColumn: currentLine.length });

  // Level 3: block (look for matching braces)
  let blockStart = line;
  let blockEnd = line;
  let depth = 0;
  for (let i = line - 1; i >= 0; i--) {
    for (const ch of lines[i]) {
      if (ch === '}') depth++;
      if (ch === '{') {
        if (depth === 0) { blockStart = i + 1; break; }
        depth--;
      }
    }
    if (blockStart !== line) break;
  }
  depth = 0;
  for (let i = line - 1; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      if (ch === '}') {
        if (depth === 0) { blockEnd = i + 1; break; }
        depth--;
      }
    }
    if (blockEnd !== line) break;
  }
  ranges.push({ startLine: blockStart, startColumn: 0, endLine: blockEnd, endColumn: (lines[blockEnd - 1] ?? '').length });

  return ranges;
}

// ─── Singleton ────────────────────────────────────────────────────────────────
export const treeSitterService = new TreeSitterService();

// Auto-init on import (non-blocking)
if (typeof window !== 'undefined') {
  treeSitterService.init().catch(() => {});
}
