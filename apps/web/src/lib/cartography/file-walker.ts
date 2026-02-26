import fs from 'fs';
import path from 'path';
import type { CartographyFileNode, FileKind } from './types';

const SKIP_DIRS = new Set([
  '.git', 'node_modules', '__pycache__', '.next', 'dist', 'build',
  '.cache', 'coverage', '.vscode', '.idea', '.turbo', '.vercel',
  '.svn', 'vendor', 'tmp', '.output',
]);

const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java',
  'c', 'cpp', 'h', 'cs', 'rb', 'php', 'swift', 'kt', 'vue', 'svelte',
]);

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
  h: 'c', cs: 'csharp', rb: 'ruby', php: 'php', swift: 'swift',
  kt: 'kotlin', vue: 'vue', svelte: 'svelte',
};

function classifyFile(filePath: string): FileKind {
  const lower = filePath.toLowerCase();
  const name = path.basename(lower);

  if (name.includes('.test.') || name.includes('.spec.') || lower.includes('__tests__')) return 'test';
  if (name.endsWith('.css') || name.endsWith('.scss') || name.endsWith('.less')) return 'style';
  if (lower.includes('/api/') && name === 'route.ts') return 'api-route';
  if (lower.includes('/api/') && name === 'route.js') return 'api-route';
  if (name.startsWith('use') && (name.endsWith('.ts') || name.endsWith('.tsx'))) return 'hook';
  if (lower.includes('/stores/') || lower.includes('/store/') || name.includes('.store.')) return 'store';
  if (lower.includes('/types/') || name.endsWith('.d.ts') || name.includes('.types.')) return 'type';
  if (name.includes('config') || name === 'tsconfig.json' || name === 'package.json') return 'config';
  if (lower.includes('/components/') || name.endsWith('.tsx') || name.endsWith('.jsx')) return 'component';
  if (lower.includes('/lib/') || lower.includes('/utils/') || lower.includes('/helpers/')) return 'util';
  return 'unknown';
}

const STATIC_IMPORT_RE = /(?:import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const EXPORT_RE = /export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface|enum|abstract)\s+(\w+)/g;
const FUNCTION_RE = /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_$]\w*)\s*=>|(?:async\s+)?(?:function\s*\*?\s*\w+)|\w+\s*\([^)]*\)\s*\{)/g;

function resolveImportPath(importSpec: string, fileDir: string, rootDir: string): string {
  if (importSpec.startsWith('.')) {
    let resolved = path.posix.normalize(path.posix.join(fileDir, importSpec));
    if (!path.extname(resolved)) {
      for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
        const full = path.join(rootDir, resolved + ext);
        if (fs.existsSync(full)) return resolved + ext;
      }
      const indexCheck = path.join(rootDir, resolved, 'index.ts');
      if (fs.existsSync(indexCheck)) return path.posix.join(resolved, 'index.ts');
      const indexTsx = path.join(rootDir, resolved, 'index.tsx');
      if (fs.existsSync(indexTsx)) return path.posix.join(resolved, 'index.tsx');
    }
    return resolved;
  }

  if (importSpec.startsWith('@/')) {
    return 'src/' + importSpec.slice(2);
  }

  return importSpec;
}

export function walkFiles(rootDir: string, maxFiles = 500): CartographyFileNode[] {
  const nodes: CartographyFileNode[] = [];
  let count = 0;

  function walk(dir: string, relDir: string) {
    if (count >= maxFiles) return;

    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (count >= maxFiles) break;
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;
      if (SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        const ext = entry.name.split('.').pop()?.toLowerCase() || '';
        if (!CODE_EXTENSIONS.has(ext)) continue;

        let content: string;
        try {
          content = fs.readFileSync(fullPath, 'utf-8');
          if (content.length > 500_000) continue;
        } catch { continue; }

        const language = LANG_MAP[ext] || 'unknown';
        const lines = content.split('\n');
        const lineCount = lines.length;
        const fileDir = path.posix.dirname(relPath);

        const imports: string[] = [];
        const dynamicImports: string[] = [];
        const exports: string[] = [];

        let match: RegExpExecArray | null;

        STATIC_IMPORT_RE.lastIndex = 0;
        while ((match = STATIC_IMPORT_RE.exec(content)) !== null) {
          const spec = match[1] || match[2] || match[3];
          if (spec) imports.push(resolveImportPath(spec, fileDir, rootDir));
        }

        DYNAMIC_IMPORT_RE.lastIndex = 0;
        while ((match = DYNAMIC_IMPORT_RE.exec(content)) !== null) {
          if (match[1]) dynamicImports.push(resolveImportPath(match[1], fileDir, rootDir));
        }

        EXPORT_RE.lastIndex = 0;
        while ((match = EXPORT_RE.exec(content)) !== null) {
          if (match[1]) exports.push(match[1]);
        }

        let functionCount = 0;
        FUNCTION_RE.lastIndex = 0;
        while (FUNCTION_RE.exec(content) !== null) functionCount++;

        nodes.push({
          path: relPath,
          name: entry.name,
          kind: classifyFile(relPath),
          language,
          lineCount,
          functionCount,
          imports,
          exports,
          dynamicImports,
        });

        count++;
      }
    }
  }

  walk(rootDir, '');
  return nodes;
}
