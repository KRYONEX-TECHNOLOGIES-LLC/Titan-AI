/**
 * Repository Map API - Aider-style global context generation
 * Generates a condensed map of the workspace showing key symbols and their relationships.
 * Used to provide LLMs with a "global mental map" without sending all file contents.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface SymbolNode {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'module';
  file: string;
  line: number;
  references: number;
}

interface RepoMapEntry {
  file: string;
  language: string;
  symbols: SymbolNode[];
  imports: string[];
  exports: string[];
  lineCount: number;
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.next', 'dist', 'build', '.cache', 'coverage', '.vscode', '.idea', '.turbo']);
const CODE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'cs', 'rb', 'php', 'swift', 'kt']);

function getLanguage(ext: string): string {
  const map: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp', h: 'c', cs: 'csharp', rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin' };
  return map[ext] || 'unknown';
}

function extractSymbolsFromContent(content: string, language: string, filePath: string): SymbolNode[] {
  const symbols: SymbolNode[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) symbols.push({ name: funcMatch[1], kind: 'function', file: filePath, line: i + 1, references: 0 });

    const classMatch = line.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) symbols.push({ name: classMatch[1], kind: 'class', file: filePath, line: i + 1, references: 0 });

    const intfMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
    if (intfMatch) symbols.push({ name: intfMatch[1], kind: 'interface', file: filePath, line: i + 1, references: 0 });

    const typeMatch = line.match(/(?:export\s+)?type\s+(\w+)\s*=/);
    if (typeMatch) symbols.push({ name: typeMatch[1], kind: 'type', file: filePath, line: i + 1, references: 0 });

    if (language === 'python') {
      const pyFunc = line.match(/^def\s+(\w+)/);
      if (pyFunc) symbols.push({ name: pyFunc[1], kind: 'function', file: filePath, line: i + 1, references: 0 });
      const pyClass = line.match(/^class\s+(\w+)/);
      if (pyClass) symbols.push({ name: pyClass[1], kind: 'class', file: filePath, line: i + 1, references: 0 });
    }

    if (language === 'rust') {
      const rsFn = line.match(/(?:pub\s+)?fn\s+(\w+)/);
      if (rsFn) symbols.push({ name: rsFn[1], kind: 'function', file: filePath, line: i + 1, references: 0 });
      const rsStruct = line.match(/(?:pub\s+)?struct\s+(\w+)/);
      if (rsStruct) symbols.push({ name: rsStruct[1], kind: 'class', file: filePath, line: i + 1, references: 0 });
    }
  }

  return symbols;
}

function buildRepoMap(rootDir: string, maxFiles = 200): RepoMapEntry[] {
  const entries: RepoMapEntry[] = [];
  let fileCount = 0;

  function walk(dir: string, relativePath = '') {
    if (fileCount >= maxFiles) return;

    let items: fs.Dirent[];
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const item of items) {
      if (fileCount >= maxFiles) break;
      if (item.name.startsWith('.') && item.name !== '.env') continue;
      if (SKIP_DIRS.has(item.name)) continue;

      const fullPath = path.join(dir, item.name);
      const relPath = relativePath ? `${relativePath}/${item.name}` : item.name;

      if (item.isDirectory()) {
        walk(fullPath, relPath);
      } else if (item.isFile()) {
        const ext = item.name.split('.').pop()?.toLowerCase() || '';
        if (!CODE_EXTENSIONS.has(ext)) continue;

        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.length > 500_000) continue;

          const language = getLanguage(ext);
          const symbols = extractSymbolsFromContent(content, language, relPath);
          const importLines = content.split('\n').filter(l => l.trim().startsWith('import ') || l.trim().startsWith('from '));
          const exportLines = content.split('\n').filter(l => l.trim().startsWith('export '));

          entries.push({
            file: relPath,
            language,
            symbols,
            imports: importLines.slice(0, 20).map(l => l.trim().slice(0, 100)),
            exports: exportLines.slice(0, 20).map(l => l.trim().slice(0, 100)),
            lineCount: content.split('\n').length,
          });

          fileCount++;
        } catch { /* skip unreadable */ }
      }
    }
  }

  walk(rootDir);

  // Calculate reference counts using PageRank-like approach
  const allSymbolNames = new Set(entries.flatMap(e => e.symbols.map(s => s.name)));
  for (const entry of entries) {
    for (const imp of entry.imports) {
      for (const symName of allSymbolNames) {
        if (imp.includes(symName)) {
          const sym = entries.flatMap(e => e.symbols).find(s => s.name === symName);
          if (sym) sym.references++;
        }
      }
    }
  }

  // Sort entries by importance (reference count)
  entries.sort((a, b) => {
    const aRefs = a.symbols.reduce((sum, s) => sum + s.references, 0);
    const bRefs = b.symbols.reduce((sum, s) => sum + s.references, 0);
    return bRefs - aRefs;
  });

  return entries;
}

function formatRepoMap(entries: RepoMapEntry[]): string {
  const lines: string[] = ['# Repository Map', ''];

  for (const entry of entries.slice(0, 50)) {
    lines.push(`## ${entry.file} (${entry.language}, ${entry.lineCount} lines)`);
    for (const sym of entry.symbols.slice(0, 15)) {
      const refTag = sym.references > 0 ? ` [${sym.references} refs]` : '';
      lines.push(`  ${sym.kind}: ${sym.name} (L${sym.line})${refTag}`);
    }
    if (entry.exports.length > 0) {
      lines.push(`  exports: ${entry.exports.length}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workspaceRoot = body.path || process.cwd();
    const maxFiles = body.maxFiles || 200;

    const entries = buildRepoMap(workspaceRoot, maxFiles);
    const mapText = formatRepoMap(entries);

    return NextResponse.json({
      success: true,
      entries: entries.length,
      totalSymbols: entries.reduce((sum, e) => sum + e.symbols.length, 0),
      map: mapText,
      files: entries.map(e => ({
        file: e.file,
        language: e.language,
        lineCount: e.lineCount,
        symbolCount: e.symbols.length,
        symbols: e.symbols.slice(0, 10).map(s => ({ name: s.name, kind: s.kind, line: s.line, refs: s.references })),
      })),
    });
  } catch (error) {
    console.error('Repo map error:', error);
    return NextResponse.json({ error: 'Failed to generate repo map' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', description: 'POST with { path: "/workspace/root" } to generate repo map' });
}
