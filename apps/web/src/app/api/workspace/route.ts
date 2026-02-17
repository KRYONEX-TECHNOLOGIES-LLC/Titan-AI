/**
 * Workspace Management API
 * Handles folder imports and triggers Tree-sitter/LanceDB indexing
 */

import { NextRequest, NextResponse } from 'next/server';

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
}

// In-memory state (in production, persist to disk)
let workspaceState: WorkspaceState | null = null;
let indexingInterval: ReturnType<typeof setInterval> | null = null;

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
      };

      // Start simulated indexing
      startIndexing(folderPath);

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
      startIndexing(workspaceState.path);

      return NextResponse.json({
        success: true,
        message: 'Re-indexing started',
      });
    }

    case 'close': {
      stopIndexing();
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
      });
    }

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
      );
  }
}

/**
 * Simulate indexing process (in production, call @titan/semantic-index)
 */
function startIndexing(folderPath: string) {
  stopIndexing();

  // Simulate finding files
  const mockFiles = [
    { path: 'src/index.ts', language: 'typescript', symbols: ['main', 'App'] },
    { path: 'src/components/Header.tsx', language: 'typescriptreact', symbols: ['Header', 'NavLink'] },
    { path: 'src/components/Footer.tsx', language: 'typescriptreact', symbols: ['Footer'] },
    { path: 'src/utils/api.ts', language: 'typescript', symbols: ['fetchData', 'postData', 'APIError'] },
    { path: 'src/hooks/useAuth.ts', language: 'typescript', symbols: ['useAuth', 'AuthContext'] },
    { path: 'src/types/index.ts', language: 'typescript', symbols: ['User', 'Session', 'Config'] },
    { path: 'package.json', language: 'json', symbols: [] },
    { path: 'tsconfig.json', language: 'json', symbols: [] },
    { path: 'README.md', language: 'markdown', symbols: [] },
    { path: '.env.example', language: 'env', symbols: [] },
  ];

  if (workspaceState) {
    workspaceState.fileCount = mockFiles.length;
  }

  let fileIndex = 0;

  indexingInterval = setInterval(() => {
    if (!workspaceState || fileIndex >= mockFiles.length) {
      // Indexing complete
      if (workspaceState) {
        workspaceState.indexed = true;
        workspaceState.indexing = false;
        workspaceState.indexProgress = 100;
        workspaceState.lastIndexed = Date.now();
        workspaceState.embeddings = {
          provider: 'voyage',
          model: 'voyage-code-2',
          dimensions: 1536,
          vectorCount: workspaceState.indexedFiles.reduce((sum, f) => sum + f.tokens, 0),
        };
      }
      stopIndexing();
      return;
    }

    const file = mockFiles[fileIndex];
    const tokens = Math.floor(Math.random() * 500) + 100;

    workspaceState?.indexedFiles.push({
      path: file.path,
      language: file.language,
      lastModified: Date.now(),
      tokens,
      symbols: file.symbols,
    });

    if (workspaceState) {
      workspaceState.indexProgress = Math.round(((fileIndex + 1) / mockFiles.length) * 100);
    }

    fileIndex++;
  }, 300);
}

function stopIndexing() {
  if (indexingInterval) {
    clearInterval(indexingInterval);
    indexingInterval = null;
  }
}
