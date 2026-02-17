// Indexer Web Worker
// apps/web/src/workers/indexer.worker.ts

interface IndexerMessage {
  type: 'index' | 'search' | 'clear' | 'status';
  payload?: unknown;
  id: string;
}

interface FileEntry {
  path: string;
  content: string;
  language: string;
}

interface FileIndex {
  path: string;
  language: string;
  symbols: SymbolInfo[];
  imports: string[];
  exports: string[];
  lines: number;
  size: number;
  hash: string;
  indexed: number;
}

interface SymbolInfo {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'variable' | 'type' | 'constant';
  line: number;
}

interface SearchResult {
  path: string;
  score: number;
  matches: Array<{
    type: 'path' | 'symbol' | 'content';
    text: string;
    line?: number;
  }>;
}

// In-memory index
const index: Map<string, FileIndex> = new Map();

self.onmessage = async (event: MessageEvent<IndexerMessage>) => {
  const { type, payload, id } = event.data;

  try {
    let result: unknown;

    switch (type) {
      case 'index':
        result = await indexFiles(payload as FileEntry[]);
        break;
      case 'search':
        result = search(payload as { query: string; limit?: number });
        break;
      case 'clear':
        result = clearIndex();
        break;
      case 'status':
        result = getStatus();
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    self.postMessage({ id, success: true, result });
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

async function indexFiles(files: FileEntry[]): Promise<{ indexed: number }> {
  let indexed = 0;

  for (const file of files) {
    const fileIndex = indexFile(file);
    index.set(file.path, fileIndex);
    indexed++;

    // Report progress
    self.postMessage({
      type: 'progress',
      current: indexed,
      total: files.length,
      path: file.path,
    });
  }

  return { indexed };
}

function indexFile(file: FileEntry): FileIndex {
  const symbols = extractSymbols(file.content, file.language);
  const imports = extractImports(file.content, file.language);
  const exports = extractExports(file.content, file.language);
  const hash = simpleHash(file.content);

  return {
    path: file.path,
    language: file.language,
    symbols,
    imports,
    exports,
    lines: file.content.split('\n').length,
    size: file.content.length,
    hash,
    indexed: Date.now(),
  };
}

function extractSymbols(content: string, language: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const lines = content.split('\n');

  const patterns: Record<string, RegExp[]> = {
    typescript: [
      /(?:export\s+)?function\s+(\w+)/,
      /(?:export\s+)?class\s+(\w+)/,
      /(?:export\s+)?interface\s+(\w+)/,
      /(?:export\s+)?type\s+(\w+)/,
      /(?:export\s+)?const\s+(\w+)/,
    ],
    javascript: [
      /(?:export\s+)?function\s+(\w+)/,
      /(?:export\s+)?class\s+(\w+)/,
      /(?:export\s+)?const\s+(\w+)/,
    ],
    python: [
      /^def\s+(\w+)/,
      /^class\s+(\w+)/,
    ],
    rust: [
      /(?:pub\s+)?fn\s+(\w+)/,
      /(?:pub\s+)?struct\s+(\w+)/,
      /(?:pub\s+)?enum\s+(\w+)/,
      /(?:pub\s+)?trait\s+(\w+)/,
    ],
  };

  const langPatterns = patterns[language] || patterns.typescript;

  lines.forEach((line, lineNum) => {
    for (const pattern of langPatterns) {
      const match = line.match(pattern);
      if (match) {
        symbols.push({
          name: match[1],
          kind: inferKind(pattern.source),
          line: lineNum + 1,
        });
      }
    }
  });

  return symbols;
}

function inferKind(pattern: string): SymbolInfo['kind'] {
  if (pattern.includes('function') || pattern.includes('fn') || pattern.includes('def')) {
    return 'function';
  }
  if (pattern.includes('class') || pattern.includes('struct')) {
    return 'class';
  }
  if (pattern.includes('interface') || pattern.includes('trait')) {
    return 'interface';
  }
  if (pattern.includes('type') || pattern.includes('enum')) {
    return 'type';
  }
  if (pattern.includes('const')) {
    return 'constant';
  }
  return 'variable';
}

function extractImports(content: string, language: string): string[] {
  const imports: string[] = [];
  const patterns: Record<string, RegExp> = {
    typescript: /import\s+.*?from\s+['"]([^'"]+)['"]/g,
    javascript: /(?:import\s+.*?from\s+['"]|require\(['"])([^'"]+)['"]/g,
    python: /(?:from\s+(\S+)\s+import|import\s+(\S+))/g,
    rust: /use\s+([\w:]+)/g,
  };

  const pattern = patterns[language] || patterns.typescript;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    imports.push(match[1] || match[2]);
  }

  return imports;
}

function extractExports(content: string, language: string): string[] {
  const exports: string[] = [];
  const patterns: Record<string, RegExp> = {
    typescript: /export\s+(?:default\s+)?(?:function|class|const|interface|type)\s+(\w+)/g,
    javascript: /export\s+(?:default\s+)?(?:function|class|const)\s+(\w+)/g,
  };

  const pattern = patterns[language];
  if (!pattern) return exports;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    exports.push(match[1]);
  }

  return exports;
}

function search(params: { query: string; limit?: number }): SearchResult[] {
  const { query, limit = 10 } = params;
  const queryLower = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const [path, fileIndex] of index) {
    const matches: SearchResult['matches'] = [];
    let score = 0;

    // Path matching
    if (path.toLowerCase().includes(queryLower)) {
      matches.push({ type: 'path', text: path });
      score += 1;
    }

    // Symbol matching
    for (const symbol of fileIndex.symbols) {
      if (symbol.name.toLowerCase().includes(queryLower)) {
        matches.push({
          type: 'symbol',
          text: `${symbol.kind}: ${symbol.name}`,
          line: symbol.line,
        });
        score += 0.8;
      }
    }

    // Import/export matching
    for (const imp of fileIndex.imports) {
      if (imp.toLowerCase().includes(queryLower)) {
        matches.push({ type: 'content', text: `import: ${imp}` });
        score += 0.5;
      }
    }

    if (matches.length > 0) {
      results.push({ path, score, matches });
    }
  }

  // Sort by score and limit
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

function clearIndex(): { cleared: number } {
  const count = index.size;
  index.clear();
  return { cleared: count };
}

function getStatus(): { files: number; totalSize: number; symbols: number } {
  let totalSize = 0;
  let symbols = 0;

  for (const fileIndex of index.values()) {
    totalSize += fileIndex.size;
    symbols += fileIndex.symbols.length;
  }

  return {
    files: index.size,
    totalSize,
    symbols,
  };
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

export {};
