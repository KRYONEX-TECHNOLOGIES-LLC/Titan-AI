/**
 * Workspace Management API
 * Handles folder imports and triggers real file indexing + semantic vector sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { readdir, readFile, stat } from 'fs/promises';
import { join, extname, relative, basename } from 'path';

async function dynamicImport(moduleName: string): Promise<any> {
  const importer = new Function('m', 'return import(m);') as (m: string) => Promise<any>;
  return importer(moduleName);
}

interface IndexedFile {
  path: string;
  language: string;
  lastModified: number;
  tokens: number;
  symbols: string[];
}

interface WorkspaceState {
  path: string;
  name: string;
  indexed: boolean;
  indexing: boolean;
  indexProgress: number;
  fileCount: number;
  indexedFiles: IndexedFile[];
  lastIndexed: number | null;
  embeddings: {
    provider: 'voyage' | 'openai' | 'local';
    model: string;
    dimensions: number;
    vectorCount: number;
  } | null;
  lastError?: string | null;
}

interface CodeChunkLike {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  type: 'function' | 'class' | 'method' | 'module' | 'comment' | 'import' | 'other';
  language: string;
  symbols: string[];
  metadata: {
    size: number;
    hash: string;
    lastModified: number;
  };
}

let workspaceState: WorkspaceState | null = null;
let activeIndexJob: Promise<void> | null = null;

/**
 * GET /api/workspace - Get current workspace state
 */
export async function GET() {
  return NextResponse.json({
    workspace: workspaceState,
    hasWorkspace: workspaceState !== null,
  });
}

/**
 * POST /api/workspace - Import/open a folder
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, path: folderPath } = body;

  switch (action) {
    case 'import': {
      if (!folderPath) {
        return NextResponse.json(
          { error: 'Folder path is required' },
          { status: 400 }
        );
      }

      // Initialize workspace
      workspaceState = {
        path: folderPath,
        name: folderPath.split(/[/\\]/).pop() || 'Unknown',
        indexed: false,
        indexing: true,
        indexProgress: 0,
        fileCount: 0,
        indexedFiles: [],
        lastIndexed: null,
        embeddings: null,
        lastError: null,
      };

      activeIndexJob = runRealIndexing(folderPath).catch(error => {
        if (workspaceState) {
          workspaceState.indexed = false;
          workspaceState.indexing = false;
          workspaceState.lastError = String(error);
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Workspace import started',
        workspace: workspaceState,
      });
    }

    case 'reindex': {
      if (!workspaceState) {
        return NextResponse.json(
          { error: 'No workspace open' },
          { status: 400 }
        );
      }

      workspaceState.indexing = true;
      workspaceState.indexProgress = 0;
      workspaceState.indexed = false;
      workspaceState.indexedFiles = [];
      workspaceState.embeddings = null;
      workspaceState.lastError = null;

      activeIndexJob = runRealIndexing(workspaceState.path).catch(error => {
        if (workspaceState) {
          workspaceState.indexed = false;
          workspaceState.indexing = false;
          workspaceState.lastError = String(error);
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Re-indexing started',
      });
    }

    case 'close': {
      activeIndexJob = null;
      workspaceState = null;

      return NextResponse.json({
        success: true,
        message: 'Workspace closed',
      });
    }

    case 'getIndexStatus': {
      return NextResponse.json({
        indexing: workspaceState?.indexing || false,
        progress: workspaceState?.indexProgress || 0,
        fileCount: workspaceState?.fileCount || 0,
        indexed: workspaceState?.indexed || false,
        error: workspaceState?.lastError || null,
      });
    }

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
      );
  }
}

async function runRealIndexing(folderPath: string): Promise<void> {
  const stateAtStart = workspaceState;
  if (!stateAtStart) return;

  stateAtStart.indexing = true;
  stateAtStart.indexed = false;
  stateAtStart.indexProgress = 0;
  stateAtStart.lastError = null;
  stateAtStart.indexedFiles = [];

  const sourceFiles = await collectSourceFiles(folderPath);
  stateAtStart.fileCount = sourceFiles.length;

  const parser = await initializeTreeSitter();
  const vectorStore = await initializeVectorStore(folderPath);
  let totalVectors = 0;

  for (let i = 0; i < sourceFiles.length; i++) {
    if (!workspaceState || workspaceState.path !== folderPath) return;

    const filePath = sourceFiles[i];
    const content = await readFile(filePath, 'utf-8');
    const fileStats = await stat(filePath);
    const relPath = relative(folderPath, filePath);
    const language = detectLanguage(filePath);
    const symbols = parser
      ? extractSymbolsWithTreeSitter(parser, language, content)
      : extractSymbolsFallback(language, content);

    const tokens = estimateTokenCount(content);

    workspaceState.indexedFiles.push({
      path: relPath,
      language,
      lastModified: fileStats.mtimeMs,
      tokens,
      symbols,
    });

    if (vectorStore) {
      const chunks = buildChunks(relPath, language, content, symbols, fileStats.mtimeMs);
      if (chunks.length) {
        await vectorStore.addChunks(chunks as any);
        totalVectors += chunks.length;
      }
    }

    workspaceState.indexProgress = Math.round(((i + 1) / Math.max(sourceFiles.length, 1)) * 100);
  }

  if (!workspaceState || workspaceState.path !== folderPath) return;

  workspaceState.indexed = true;
  workspaceState.indexing = false;
  workspaceState.lastIndexed = Date.now();
  workspaceState.indexProgress = 100;
  workspaceState.embeddings = {
    provider: (process.env.TITAN_EMBEDDING_PROVIDER as 'voyage' | 'openai' | 'local') || 'openai',
    model: process.env.TITAN_EMBEDDING_MODEL || 'text-embedding-3-small',
    dimensions: Number(process.env.TITAN_EMBEDDING_DIMENSIONS || 1536),
    vectorCount: totalVectors,
  };
}

async function collectSourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const ignored = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.turbo']);
  const allowed = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.json', '.md',
  ]);

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (allowed.has(ext)) files.push(full);
      }
    }
  }

  await walk(root);
  return files;
}

async function initializeTreeSitter(): Promise<{
  Parser: any;
  tsLanguage?: any;
  tsxLanguage?: any;
  jsLanguage?: any;
} | null> {
  try {
    const parserMod = await dynamicImport('tree-sitter');
    const tsMod = await dynamicImport('tree-sitter-typescript');
    const jsMod = await dynamicImport('tree-sitter-javascript');
    return {
      Parser: parserMod.default || parserMod,
      tsLanguage: tsMod.typescript,
      tsxLanguage: tsMod.tsx,
      jsLanguage: jsMod.default || jsMod,
    };
  } catch {
    return null;
  }
}

function extractSymbolsWithTreeSitter(
  treeSitter: { Parser: any; tsLanguage?: any; tsxLanguage?: any; jsLanguage?: any },
  language: string,
  content: string
): string[] {
  const parser = new treeSitter.Parser();
  if (language === 'typescript' && treeSitter.tsLanguage) parser.setLanguage(treeSitter.tsLanguage);
  else if (language === 'typescriptreact' && treeSitter.tsxLanguage) parser.setLanguage(treeSitter.tsxLanguage);
  else if (language === 'javascript' && treeSitter.jsLanguage) parser.setLanguage(treeSitter.jsLanguage);
  else return extractSymbolsFallback(language, content);

  const tree = parser.parse(content);
  const symbols: string[] = [];

  const visit = (node: any) => {
    if (
      node.type === 'function_declaration' ||
      node.type === 'class_declaration' ||
      node.type === 'method_definition' ||
      node.type === 'interface_declaration' ||
      node.type === 'type_alias_declaration'
    ) {
      const nameNode = node.childForFieldName?.('name');
      const symbolName = nameNode?.text || node.text?.split(/\s+/)[1];
      if (symbolName) symbols.push(symbolName.replace(/[^a-zA-Z0-9_$]/g, ''));
    }
    for (let i = 0; i < node.namedChildCount; i++) {
      visit(node.namedChild(i));
    }
  };

  visit(tree.rootNode);
  return Array.from(new Set(symbols)).filter(Boolean);
}

function extractSymbolsFallback(language: string, content: string): string[] {
  const symbols: string[] = [];
  const regexes =
    language === 'python'
      ? [/^\s*def\s+([a-zA-Z0-9_]+)/gm, /^\s*class\s+([a-zA-Z0-9_]+)/gm]
      : [/^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)/gm, /^\s*(?:export\s+)?class\s+([a-zA-Z0-9_]+)/gm];

  for (const regex of regexes) {
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(content))) {
      symbols.push(match[1]);
    }
  }
  return Array.from(new Set(symbols));
}

async function initializeVectorStore(folderPath: string): Promise<{ addChunks: (chunks: unknown[]) => Promise<void> } | null> {
  try {
    const vectordb = await dynamicImport('../../../../../../packages/vectordb/src/client');
    const dbPath = join(folderPath, '.titan', 'lancedb');
    const client = vectordb.createVectorDB({
      path: dbPath,
      embedding: {
        provider: (process.env.TITAN_EMBEDDING_PROVIDER as 'openai' | 'voyage' | 'local') || 'openai',
        model: process.env.TITAN_EMBEDDING_MODEL || 'text-embedding-3-small',
        apiKey: process.env.TITAN_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || process.env.VOYAGE_API_KEY,
        dimensions: Number(process.env.TITAN_EMBEDDING_DIMENSIONS || 1536),
      },
    });
    await client.initialize();
    return client;
  } catch {
    return null;
  }
}

function buildChunks(
  relativePath: string,
  language: string,
  content: string,
  symbols: string[],
  lastModified: number
): CodeChunkLike[] {
  const lines = content.split('\n');
  const maxLinesPerChunk = 120;
  const chunks: CodeChunkLike[] = [];

  for (let i = 0; i < lines.length; i += maxLinesPerChunk) {
    const startLine = i + 1;
    const endLine = Math.min(lines.length, i + maxLinesPerChunk);
    const chunkText = lines.slice(i, endLine).join('\n');
    const hash = createHash('sha256').update(`${relativePath}:${startLine}:${chunkText}`).digest('hex');
    chunks.push({
      id: `${relativePath}:${startLine}-${endLine}`,
      filePath: relativePath,
      content: chunkText,
      startLine,
      endLine,
      type: 'module',
      language,
      symbols: i === 0 ? symbols : [],
      metadata: {
        size: chunkText.length,
        hash,
        lastModified,
      },
    });
  }

  return chunks;
}

function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.ts') return 'typescript';
  if (ext === '.tsx') return 'typescriptreact';
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'javascript';
  if (ext === '.jsx') return 'javascriptreact';
  if (ext === '.py') return 'python';
  if (ext === '.go') return 'go';
  if (ext === '.rs') return 'rust';
  if (ext === '.java') return 'java';
  if (ext === '.json') return 'json';
  if (ext === '.md') return 'markdown';
  return basename(filePath).startsWith('.') ? 'config' : 'plaintext';
}

function estimateTokenCount(content: string): number {
  return Math.ceil(content.length / 4);
}
