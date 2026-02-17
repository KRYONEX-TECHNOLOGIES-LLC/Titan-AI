// Indexing Service
// extensions/titan-core/src/services/indexing-service.ts

import * as vscode from 'vscode';
import * as path from 'path';

export class IndexingService {
  private context: vscode.ExtensionContext;
  private isIndexing = false;
  private indexedFiles: Map<string, FileIndex> = new Map();
  private watcher: vscode.FileSystemWatcher | undefined;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.setupWatcher();
  }

  private setupWatcher(): void {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*');
    
    this.watcher.onDidCreate((uri) => this.indexFile(uri));
    this.watcher.onDidChange((uri) => this.indexFile(uri));
    this.watcher.onDidDelete((uri) => this.removeFromIndex(uri));
  }

  async startIndexing(): Promise<void> {
    if (this.isIndexing) {
      console.log('[Indexing] Already indexing');
      return;
    }

    this.isIndexing = true;
    console.log('[Indexing] Starting workspace indexing...');

    const config = vscode.workspace.getConfiguration('titan');
    const excludePatterns = config.get<string[]>('indexing.excludePatterns') || [];

    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        console.log('[Indexing] No workspace folders found');
        return;
      }

      for (const folder of workspaceFolders) {
        await this.indexFolder(folder.uri, excludePatterns);
      }

      console.log(`[Indexing] Indexed ${this.indexedFiles.size} files`);
    } finally {
      this.isIndexing = false;
    }
  }

  private async indexFolder(folderUri: vscode.Uri, excludePatterns: string[]): Promise<void> {
    const pattern = new vscode.RelativePattern(folderUri, '**/*');
    const files = await vscode.workspace.findFiles(pattern, `{${excludePatterns.join(',')}}`);

    for (const file of files) {
      await this.indexFile(file);
    }
  }

  private async indexFile(uri: vscode.Uri): Promise<void> {
    // Skip non-file URIs
    if (uri.scheme !== 'file') return;

    // Skip binary files
    const ext = path.extname(uri.fsPath).toLowerCase();
    if (this.isBinaryExtension(ext)) return;

    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const content = document.getText();
      const language = document.languageId;

      const index: FileIndex = {
        uri: uri.toString(),
        path: uri.fsPath,
        language,
        lastModified: Date.now(),
        symbols: await this.extractSymbols(document),
        imports: this.extractImports(content, language),
        exports: this.extractExports(content, language),
        lineCount: document.lineCount,
        size: content.length,
      };

      this.indexedFiles.set(uri.toString(), index);
    } catch (error) {
      console.warn(`[Indexing] Failed to index ${uri.fsPath}:`, error);
    }
  }

  private removeFromIndex(uri: vscode.Uri): void {
    this.indexedFiles.delete(uri.toString());
  }

  private async extractSymbols(document: vscode.TextDocument): Promise<SymbolInfo[]> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );

      if (!symbols) return [];

      return this.flattenSymbols(symbols);
    } catch {
      return [];
    }
  }

  private flattenSymbols(symbols: vscode.DocumentSymbol[], parent?: string): SymbolInfo[] {
    const result: SymbolInfo[] = [];

    for (const symbol of symbols) {
      const fullName = parent ? `${parent}.${symbol.name}` : symbol.name;
      
      result.push({
        name: symbol.name,
        fullName,
        kind: vscode.SymbolKind[symbol.kind],
        range: {
          start: { line: symbol.range.start.line, character: symbol.range.start.character },
          end: { line: symbol.range.end.line, character: symbol.range.end.character },
        },
      });

      if (symbol.children.length > 0) {
        result.push(...this.flattenSymbols(symbol.children, fullName));
      }
    }

    return result;
  }

  private extractImports(content: string, language: string): string[] {
    const imports: string[] = [];
    
    const patterns: Record<string, RegExp[]> = {
      typescript: [
        /import\s+(?:[\w{}\s,*]+\s+from\s+)?['"]([^'"]+)['"]/g,
        /require\(['"]([^'"]+)['"]\)/g,
      ],
      javascript: [
        /import\s+(?:[\w{}\s,*]+\s+from\s+)?['"]([^'"]+)['"]/g,
        /require\(['"]([^'"]+)['"]\)/g,
      ],
      python: [
        /^import\s+([\w.]+)/gm,
        /^from\s+([\w.]+)\s+import/gm,
      ],
      rust: [
        /^use\s+([\w:]+)/gm,
      ],
      go: [
        /import\s+["']([^"']+)["']/g,
        /import\s+\(\s*([^)]+)\s*\)/gs,
      ],
    };

    const langPatterns = patterns[language] || [];
    
    for (const pattern of langPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        imports.push(match[1]);
      }
    }

    return imports;
  }

  private extractExports(content: string, language: string): string[] {
    const exports: string[] = [];

    const patterns: Record<string, RegExp[]> = {
      typescript: [
        /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g,
        /export\s+{\s*([^}]+)\s*}/g,
      ],
      javascript: [
        /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g,
        /export\s+{\s*([^}]+)\s*}/g,
        /module\.exports\s*=\s*(\w+)/g,
      ],
      python: [
        /^__all__\s*=\s*\[([^\]]+)\]/gm,
      ],
    };

    const langPatterns = patterns[language] || [];

    for (const pattern of langPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const captured = match[1];
        // Split on commas for multiple exports
        const names = captured.split(',').map(s => s.trim().replace(/['"]/g, ''));
        exports.push(...names.filter(Boolean));
      }
    }

    return exports;
  }

  private isBinaryExtension(ext: string): boolean {
    const binaryExts = new Set([
      '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
      '.mp3', '.mp4', '.wav', '.webm', '.ogg',
      '.zip', '.tar', '.gz', '.rar', '.7z',
      '.exe', '.dll', '.so', '.dylib',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx',
      '.woff', '.woff2', '.ttf', '.eot',
      '.node', '.wasm',
    ]);
    return binaryExts.has(ext);
  }

  getIndex(): Map<string, FileIndex> {
    return this.indexedFiles;
  }

  search(query: string): SearchResult[] {
    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const [uri, index] of this.indexedFiles) {
      // Search in symbols
      for (const symbol of index.symbols) {
        if (symbol.name.toLowerCase().includes(queryLower)) {
          results.push({
            type: 'symbol',
            uri,
            path: index.path,
            name: symbol.name,
            kind: symbol.kind,
            range: symbol.range,
          });
        }
      }

      // Search in file path
      if (index.path.toLowerCase().includes(queryLower)) {
        results.push({
          type: 'file',
          uri,
          path: index.path,
          name: path.basename(index.path),
        });
      }
    }

    return results;
  }

  stopIndexing(): void {
    this.watcher?.dispose();
    this.indexedFiles.clear();
  }
}

interface FileIndex {
  uri: string;
  path: string;
  language: string;
  lastModified: number;
  symbols: SymbolInfo[];
  imports: string[];
  exports: string[];
  lineCount: number;
  size: number;
}

interface SymbolInfo {
  name: string;
  fullName: string;
  kind: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

interface SearchResult {
  type: 'file' | 'symbol';
  uri: string;
  path: string;
  name: string;
  kind?: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}
