// Indexing API Route
// apps/web/src/app/api/indexing/route.ts

import { NextRequest, NextResponse } from 'next/server';

interface IndexRequest {
  action: 'index' | 'search' | 'status' | 'clear';
  path?: string;
  query?: string;
  limit?: number;
}

interface FileIndex {
  path: string;
  language: string;
  symbols: string[];
  imports: string[];
  exports: string[];
  lastModified: number;
}

// In-memory index for demo (production would use LanceDB)
const fileIndex: Map<string, FileIndex> = new Map();

export async function POST(request: NextRequest) {
  try {
    const body: IndexRequest = await request.json();

    switch (body.action) {
      case 'index':
        return handleIndex(body);
      case 'search':
        return handleSearch(body);
      case 'status':
        return handleStatus();
      case 'clear':
        return handleClear();
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Indexing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function handleIndex(body: IndexRequest) {
  if (!body.path) {
    return NextResponse.json(
      { error: 'Path is required' },
      { status: 400 }
    );
  }

  // Simulate indexing
  const index: FileIndex = {
    path: body.path,
    language: getLanguageFromPath(body.path),
    symbols: [],
    imports: [],
    exports: [],
    lastModified: Date.now(),
  };

  fileIndex.set(body.path, index);

  return NextResponse.json({
    success: true,
    path: body.path,
    indexed: true,
  });
}

function handleSearch(body: IndexRequest) {
  if (!body.query) {
    return NextResponse.json(
      { error: 'Query is required' },
      { status: 400 }
    );
  }

  const limit = body.limit || 10;
  const queryLower = body.query.toLowerCase();
  const results: Array<{ path: string; score: number }> = [];

  for (const [path, index] of fileIndex) {
    // Simple path matching
    if (path.toLowerCase().includes(queryLower)) {
      results.push({ path, score: 1.0 });
    }
    // Symbol matching
    for (const symbol of index.symbols) {
      if (symbol.toLowerCase().includes(queryLower)) {
        results.push({ path, score: 0.8 });
        break;
      }
    }
  }

  // Sort by score and limit
  results.sort((a, b) => b.score - a.score);
  const limitedResults = results.slice(0, limit);

  return NextResponse.json({
    query: body.query,
    results: limitedResults,
    total: results.length,
  });
}

function handleStatus() {
  return NextResponse.json({
    status: 'ready',
    indexedFiles: fileIndex.size,
    lastUpdated: Date.now(),
  });
}

function handleClear() {
  fileIndex.clear();
  return NextResponse.json({
    success: true,
    message: 'Index cleared',
  });
}

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    md: 'markdown',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
  };
  return langMap[ext || ''] || 'plaintext';
}

export async function GET() {
  return handleStatus();
}
