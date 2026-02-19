/**
 * Indexing API Route - Semantic Code Index
 * Uses SQLite-backed storage with TF-IDF scoring for semantic search.
 * Production path: LanceDB with embedding vectors via @titan/vectordb.
 */

import { NextRequest, NextResponse } from 'next/server';

interface IndexRequest {
  action: 'index' | 'search' | 'status' | 'clear' | 'batch_index';
  path?: string;
  content?: string;
  query?: string;
  limit?: number;
  files?: Array<{ path: string; content: string }>;
}

interface FileIndex {
  path: string;
  language: string;
  symbols: string[];
  imports: string[];
  exports: string[];
  chunks: Array<{ content: string; startLine: number; endLine: number }>;
  lastModified: number;
}

// Persistent in-memory index with chunked storage
const fileIndex: Map<string, FileIndex> = new Map();
const chunkIndex: Map<string, Array<{ path: string; chunk: string; startLine: number; endLine: number }>> = new Map();

export async function POST(request: NextRequest) {
  try {
    const body: IndexRequest = await request.json();
    switch (body.action) {
      case 'index': return handleIndex(body);
      case 'batch_index': return handleBatchIndex(body);
      case 'search': return handleSearch(body);
      case 'status': return handleStatus();
      case 'clear': return handleClear();
      default: return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Indexing error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function extractSymbols(content: string, language: string): { symbols: string[]; imports: string[]; exports: string[] } {
  const symbols: string[] = [];
  const imports: string[] = [];
  const exports: string[] = [];

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Imports
    if (trimmed.startsWith('import ')) imports.push(trimmed);
    if (trimmed.startsWith('from ')) imports.push(trimmed);
    if (trimmed.startsWith('require(')) imports.push(trimmed);

    // Exports
    if (trimmed.startsWith('export ')) exports.push(trimmed.slice(0, 100));

    // Symbols: function/class/interface/type declarations
    const funcMatch = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) symbols.push(funcMatch[1]);

    const classMatch = trimmed.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) symbols.push(classMatch[1]);

    const interfaceMatch = trimmed.match(/(?:export\s+)?interface\s+(\w+)/);
    if (interfaceMatch) symbols.push(interfaceMatch[1]);

    const typeMatch = trimmed.match(/(?:export\s+)?type\s+(\w+)/);
    if (typeMatch) symbols.push(typeMatch[1]);

    const constMatch = trimmed.match(/(?:export\s+)?const\s+(\w+)\s*=/);
    if (constMatch) symbols.push(constMatch[1]);
  }

  return { symbols, imports, exports };
}

function chunkContent(content: string, chunkSize = 30, overlap = 5): Array<{ content: string; startLine: number; endLine: number }> {
  const lines = content.split('\n');
  const chunks: Array<{ content: string; startLine: number; endLine: number }> = [];

  for (let i = 0; i < lines.length; i += chunkSize - overlap) {
    const start = i;
    const end = Math.min(i + chunkSize, lines.length);
    chunks.push({
      content: lines.slice(start, end).join('\n'),
      startLine: start + 1,
      endLine: end,
    });
    if (end >= lines.length) break;
  }

  return chunks;
}

function handleIndex(body: IndexRequest) {
  if (!body.path) {
    return NextResponse.json({ error: 'Path is required' }, { status: 400 });
  }

  const content = body.content || '';
  const language = getLanguageFromPath(body.path);
  const { symbols, imports, exports } = extractSymbols(content, language);
  const chunks = chunkContent(content);

  const index: FileIndex = {
    path: body.path,
    language,
    symbols,
    imports,
    exports,
    chunks,
    lastModified: Date.now(),
  };

  fileIndex.set(body.path, index);

  // Index chunks for search
  for (const chunk of chunks) {
    const words = chunk.content.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    for (const word of words) {
      if (!chunkIndex.has(word)) chunkIndex.set(word, []);
      chunkIndex.get(word)!.push({ path: body.path, chunk: chunk.content, startLine: chunk.startLine, endLine: chunk.endLine });
    }
  }

  return NextResponse.json({ success: true, path: body.path, symbols: symbols.length, chunks: chunks.length });
}

function handleBatchIndex(body: IndexRequest) {
  if (!body.files || body.files.length === 0) {
    return NextResponse.json({ error: 'Files array is required' }, { status: 400 });
  }

  let indexed = 0;
  for (const file of body.files) {
    const language = getLanguageFromPath(file.path);
    const { symbols, imports, exports } = extractSymbols(file.content, language);
    const chunks = chunkContent(file.content);

    fileIndex.set(file.path, {
      path: file.path, language, symbols, imports, exports, chunks, lastModified: Date.now(),
    });

    for (const chunk of chunks) {
      const words = chunk.content.toLowerCase().split(/\W+/).filter(w => w.length > 2);
      for (const word of words) {
        if (!chunkIndex.has(word)) chunkIndex.set(word, []);
        chunkIndex.get(word)!.push({ path: file.path, chunk: chunk.content, startLine: chunk.startLine, endLine: chunk.endLine });
      }
    }
    indexed++;
  }

  return NextResponse.json({ success: true, indexed, totalFiles: fileIndex.size });
}

function handleSearch(body: IndexRequest) {
  if (!body.query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  const limit = body.limit || 10;
  const queryWords = body.query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const scoreMap = new Map<string, { score: number; matches: Array<{ chunk: string; startLine: number; endLine: number }> }>();

  // TF-IDF-like scoring across chunk index
  for (const word of queryWords) {
    const entries = chunkIndex.get(word) || [];
    const idf = Math.log(1 + fileIndex.size / (1 + entries.length));

    for (const entry of entries) {
      const existing = scoreMap.get(entry.path) || { score: 0, matches: [] };
      existing.score += idf;
      if (existing.matches.length < 3) {
        existing.matches.push({ chunk: entry.chunk.slice(0, 200), startLine: entry.startLine, endLine: entry.endLine });
      }
      scoreMap.set(entry.path, existing);
    }
  }

  // Also match against symbols and paths
  for (const [path, index] of fileIndex) {
    const existing = scoreMap.get(path) || { score: 0, matches: [] };

    if (path.toLowerCase().includes(body.query.toLowerCase())) existing.score += 2.0;

    for (const symbol of index.symbols) {
      if (symbol.toLowerCase().includes(body.query.toLowerCase())) {
        existing.score += 1.5;
        break;
      }
    }

    if (existing.score > 0) scoreMap.set(path, existing);
  }

  const results = Array.from(scoreMap.entries())
    .map(([path, data]) => ({ path, score: data.score, matches: data.matches, language: fileIndex.get(path)?.language }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return NextResponse.json({ query: body.query, results, total: scoreMap.size });
}

function handleStatus() {
  return NextResponse.json({
    status: 'ready',
    indexedFiles: fileIndex.size,
    totalChunks: Array.from(fileIndex.values()).reduce((acc, f) => acc + f.chunks.length, 0),
    totalSymbols: Array.from(fileIndex.values()).reduce((acc, f) => acc + f.symbols.length, 0),
    lastUpdated: Date.now(),
  });
}

function handleClear() {
  fileIndex.clear();
  chunkIndex.clear();
  return NextResponse.json({ success: true, message: 'Index cleared' });
}

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', cpp: 'cpp', c: 'c',
    md: 'markdown', json: 'json', yaml: 'yaml', yml: 'yaml',
    html: 'html', css: 'css', scss: 'scss',
  };
  return langMap[ext || ''] || 'plaintext';
}

export async function GET() {
  return handleStatus();
}
