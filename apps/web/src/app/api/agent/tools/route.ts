/**
 * Agent Tools API - Real tool implementations for the AI agent
 * Provides: read_file, edit_file, create_file, delete_file, list_directory,
 *           grep_search, glob_search, run_command, web_search, web_fetch, read_lints, write_file
 * These are called by the chat system and all multi-agent protocols when a tool is invoked.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { requireAuth } from '@/lib/api-auth';

interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  workspacePath?: string;
}

interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//, /del\s+\/[fs]/, /format\s+c:/i,
  /mkfs/, /dd\s+if=/, /:(){ :\|:& };:/,
  />\s*\/dev\/sd/, /shutdown/, /reboot/,
];

function isPathSafe(filePath: string, workspace: string): boolean {
  const resolvedWorkspace = path.resolve(workspace);
  const resolved = path.resolve(resolvedWorkspace, filePath);
  return resolved.startsWith(resolvedWorkspace + path.sep) || resolved === resolvedWorkspace;
}

function isCommandSafe(command: string): boolean {
  return !DANGEROUS_PATTERNS.some(p => p.test(command));
}

/**
 * Expand bash-style brace expressions for Windows compatibility.
 * e.g. "mkdir -p src/{components,pages,utils}" →
 *      "mkdir -p src/components src/pages src/utils"
 * Also converts `mkdir -p` to `New-Item -ItemType Directory -Force -Path` on Windows.
 */
function expandBraces(cmd: string): string {
  let result = cmd;

  // Expand brace patterns: prefix{a,b,c}suffix → prefixa suffix prefixb suffix prefixcsuffix
  const braceRegex = /([^\s{]*)\{([^}]+)\}([^\s}]*)/g;
  let match;
  while ((match = braceRegex.exec(result)) !== null) {
    const prefix = match[1];
    const items = match[2].split(',').map(s => s.trim());
    const suffix = match[3];
    const expanded = items.map(item => `${prefix}${item}${suffix}`).join(' ');
    result = result.slice(0, match.index) + expanded + result.slice(match.index + match[0].length);
    braceRegex.lastIndex = 0;
  }

  // Convert `mkdir -p` to PowerShell equivalent
  result = result.replace(
    /mkdir\s+-p\s+(.+)/,
    (_, paths) => {
      const dirs = paths.trim().split(/\s+/);
      return dirs.map((d: string) => `New-Item -ItemType Directory -Force -Path "${d}"`).join('; ');
    }
  );

  // Convert `touch` to PowerShell equivalent
  result = result.replace(
    /\btouch\s+(.+)/,
    (_, files) => {
      const fileList = files.trim().split(/\s+/);
      return fileList.map((f: string) => `New-Item -ItemType File -Force -Path "${f}"`).join('; ');
    }
  );

  // Convert `&&` to `;` for PowerShell
  result = result.replace(/\s*&&\s*/g, '; ');

  // Convert `cat` to `Get-Content`
  result = result.replace(/\bcat\s+/g, 'Get-Content ');

  // Convert `ls` (standalone) to `Get-ChildItem`
  result = result.replace(/\bls\b(?!\s+-)/g, 'Get-ChildItem');

  // Convert `rm -rf` to `Remove-Item -Recurse -Force`
  result = result.replace(/\brm\s+-rf?\s+/g, 'Remove-Item -Recurse -Force ');

  // Convert `cp -r` to `Copy-Item -Recurse`
  result = result.replace(/\bcp\s+-r\s+/g, 'Copy-Item -Recurse ');

  // Convert `mv` to `Move-Item`
  result = result.replace(/\bmv\s+/g, 'Move-Item ');

  return result;
}

async function executeTool(call: ToolCall): Promise<ToolResult> {
  const workspace = call.workspacePath || process.cwd();

  switch (call.tool) {
    case 'read_file': {
      const filePath = call.args.path as string;
      if (!filePath) return { success: false, output: '', error: 'path is required' };
      if (!isPathSafe(filePath, workspace)) return { success: false, output: '', error: 'Path traversal detected' };

      try {
        const fullPath = path.resolve(workspace, filePath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        const startLine = (call.args.startLine as number) || 1;
        const endLine = (call.args.endLine as number) || lines.length;
        const slice = lines.slice(startLine - 1, endLine);
        const numbered = slice.map((line, i) => `${startLine + i}|${line}`).join('\n');

        return {
          success: true,
          output: numbered,
          metadata: { lines: lines.length, size: content.length, language: path.extname(filePath).slice(1) },
        };
      } catch (e) {
        return { success: false, output: '', error: `File not found: ${filePath}` };
      }
    }

    case 'edit_file': {
      const filePath = call.args.path as string;
      const oldStr = call.args.old_string as string;
      const newStr = call.args.new_string as string;

      if (!filePath || oldStr === undefined || newStr === undefined) {
        return { success: false, output: '', error: 'path, old_string, and new_string are required' };
      }
      if (!isPathSafe(filePath, workspace)) return { success: false, output: '', error: 'Path traversal detected' };

      try {
        const fullPath = path.resolve(workspace, filePath);
        let content = fs.readFileSync(fullPath, 'utf-8');

        if (!content.includes(oldStr)) {
          return { success: false, output: '', error: 'old_string not found in file. Content may have changed.' };
        }

        content = content.replace(oldStr, newStr);
        fs.writeFileSync(fullPath, content, 'utf-8');

        return { success: true, output: `File edited: ${filePath}`, metadata: { linesChanged: newStr.split('\n').length, newContent: content } };
      } catch (e) {
        return { success: false, output: '', error: `Edit failed: ${(e as Error).message}` };
      }
    }

    case 'create_file': {
      const filePath = call.args.path as string;
      const content = (call.args.content as string) || '';

      if (!filePath) return { success: false, output: '', error: 'path is required' };
      if (!isPathSafe(filePath, workspace)) return { success: false, output: '', error: 'Path traversal detected' };

      try {
        const fullPath = path.resolve(workspace, filePath);
        const dir = path.dirname(fullPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');

        return { success: true, output: `File created: ${filePath}`, metadata: { size: content.length } };
      } catch (e) {
        return { success: false, output: '', error: `Create failed: ${(e as Error).message}` };
      }
    }

    case 'list_directory': {
      const dirPath = (call.args.path as string) || '.';
      if (!isPathSafe(dirPath, workspace)) return { success: false, output: '', error: 'Path traversal detected' };

      try {
        const fullPath = path.resolve(workspace, dirPath);
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        const listing = entries
          .filter(e => !e.name.startsWith('.') || e.name === '.env' || e.name === '.gitignore')
          .map(e => {
            const type = e.isDirectory() ? 'dir' : 'file';
            if (e.isFile()) {
              const stats = fs.statSync(path.join(fullPath, e.name));
              return `${type}  ${e.name}  (${stats.size} bytes)`;
            }
            return `${type}  ${e.name}/`;
          })
          .join('\n');

        return { success: true, output: listing || '(empty directory)', metadata: { count: entries.length } };
      } catch (e) {
        return { success: false, output: '', error: `Directory not found: ${dirPath}` };
      }
    }

    case 'grep_search': {
      const query = call.args.query as string;
      const searchPath = (call.args.path as string) || '.';
      const glob = (call.args.glob as string) || '';

      if (!query) return { success: false, output: '', error: 'query is required' };
      if (!isPathSafe(searchPath, workspace)) return { success: false, output: '', error: 'Path traversal detected' };

      try {
        const fullPath = path.resolve(workspace, searchPath);
        const isWin = process.platform === 'win32';

        if (isWin) {
          const defaultExts = '*.ts,*.tsx,*.js,*.jsx,*.py,*.json,*.md,*.css,*.html,*.yaml,*.yml,*.rs,*.go,*.java,*.c,*.cpp,*.h';
          const includeExts = (glob || defaultExts).split(',').map(e => `'${e.trim()}'`).join(',');
          const escapedQuery = query.replace(/'/g, "''");
          const cmd = [
            `Get-ChildItem -Path '${fullPath}' -Recurse -Include ${includeExts} -File`,
            `Where-Object { $_.FullName -notmatch '[\\\\/](node_modules|\.git|dist|\.next|\.turbo|coverage|\.cache)[\\\\/]' }`,
            `Select-String -Pattern '${escapedQuery}' -CaseSensitive:$false`,
            `Select-Object -First 80`,
            `ForEach-Object { "$($_.Path | Resolve-Path -Relative):$($_.LineNumber): $($_.Line.TrimStart())" }`,
          ].join(' | ');
          const result = execSync(cmd, { cwd: fullPath, encoding: 'utf-8', timeout: 30000, maxBuffer: 2 * 1024 * 1024, shell: 'powershell.exe' });
          return { success: true, output: result.slice(0, 12000) || 'No results found' };
        } else {
          const includeFlag = glob ? `--include="${glob}"` : '--include="*.{ts,tsx,js,jsx,py,rs,go,java,c,cpp,h,md,json,yaml,yml,css,html}"';
          const cmd = `grep -rn "${query}" "${fullPath}" ${includeFlag} --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next --exclude-dir=.turbo --exclude-dir=coverage 2>/dev/null | head -100`;
          const result = execSync(cmd, { encoding: 'utf-8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
          return { success: true, output: result.slice(0, 12000) || 'No results found' };
        }
      } catch {
        return { success: true, output: 'No results found' };
      }
    }

    case 'run_command': {
      let command = call.args.command as string;
      const cwd = call.args.cwd as string;

      if (!command) return { success: false, output: '', error: 'command is required' };
      if (!isCommandSafe(command)) return { success: false, output: '', error: 'Command blocked by safety filter' };

      const execDir = cwd ? path.resolve(workspace, cwd) : workspace;
      if (!execDir.startsWith(workspace) && execDir !== workspace) {
        return { success: false, output: '', error: 'Working directory must be within workspace' };
      }

      const isWin = process.platform === 'win32';

      // Expand bash-style brace expansion on Windows (e.g. mkdir -p src/{a,b,c})
      if (isWin) {
        command = expandBraces(command);
      }

      try {
        const timeout = (call.args.timeout as number) || 120000;
        const shellOpts: Record<string, unknown> = {
          cwd: execDir,
          encoding: 'utf-8',
          timeout,
          maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, FORCE_COLOR: '0' },
        };

        if (isWin) {
          shellOpts.shell = 'powershell.exe';
          command = `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force; ${command}`;
        }

        const result = execSync(command, shellOpts as Parameters<typeof execSync>[1]);
        return { success: true, output: (result as string).slice(0, 15000) };
      } catch (e: any) {
        const stdout = e.stdout?.toString() || '';
        const stderr = e.stderr?.toString() || '';
        return {
          success: false,
          output: `${stdout}\n${stderr}`.slice(0, 15000),
          error: `Exit code: ${e.status}`,
          metadata: { exitCode: e.status },
        };
      }
    }

    case 'delete_file': {
      const filePath = call.args.path as string;
      if (!filePath) return { success: false, output: '', error: 'path is required' };
      if (!isPathSafe(filePath, workspace)) return { success: false, output: '', error: 'Path traversal detected' };

      try {
        const fullPath = path.resolve(workspace, filePath);
        fs.unlinkSync(fullPath);
        return { success: true, output: `File deleted: ${filePath}` };
      } catch (e) {
        return { success: false, output: '', error: `Delete failed: ${(e as Error).message}` };
      }
    }

    case 'write_file': {
      const filePath = call.args.path as string;
      const content = (call.args.content as string) || '';
      if (!filePath) return { success: false, output: '', error: 'path is required' };
      if (!isPathSafe(filePath, workspace)) return { success: false, output: '', error: 'Path traversal detected' };

      try {
        const fullPath = path.resolve(workspace, filePath);
        const dir = path.dirname(fullPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
        return { success: true, output: `File written: ${filePath}`, metadata: { size: content.length } };
      } catch (e) {
        return { success: false, output: '', error: `Write failed: ${(e as Error).message}` };
      }
    }

    case 'glob_search': {
      const pattern = call.args.pattern as string;
      const basePath = (call.args.path as string) || '.';
      if (!pattern) return { success: false, output: '', error: 'pattern is required' };
      if (!isPathSafe(basePath, workspace)) return { success: false, output: '', error: 'Path traversal detected' };

      try {
        const fullPath = path.resolve(workspace, basePath);
        const isWin = process.platform === 'win32';
        if (isWin) {
          const cmd = `Get-ChildItem -Path '${fullPath}' -Recurse -Filter '${pattern}' -File | Where-Object { $_.FullName -notmatch '[\\\\/](node_modules|\.git|dist|\.next|\.turbo)[\\\\/]' } | Select-Object -First 100 | ForEach-Object { $_.FullName | Resolve-Path -Relative }`;
          const result = execSync(cmd, { cwd: fullPath, encoding: 'utf-8', timeout: 15000, maxBuffer: 1024 * 1024, shell: 'powershell.exe' });
          const files = result.trim().split('\n').filter(Boolean);
          return { success: true, output: files.join('\n') || 'No files found' };
        } else {
          const cmd = `find "${fullPath}" -name "${pattern}" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" 2>/dev/null | head -100`;
          const result = execSync(cmd, { encoding: 'utf-8', timeout: 15000, maxBuffer: 1024 * 1024 });
          const files = result.trim().split('\n').filter(Boolean).map(f => path.relative(workspace, f));
          return { success: true, output: files.join('\n') || 'No files found' };
        }
      } catch {
        return { success: true, output: 'No files found' };
      }
    }

    case 'web_search': {
      const query = call.args.query as string;
      if (!query) return { success: false, output: '', error: 'query is required' };

      try {
        const encoded = encodeURIComponent(query);

        const braveKey = process.env.BRAVE_SEARCH_API_KEY;
        if (braveKey) {
          try {
            const braveRes = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encoded}&count=8`, {
              headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': braveKey },
            });
            if (braveRes.ok) {
              const data = await braveRes.json();
              const results = (data.web?.results || []).slice(0, 8).map((r: { title: string; url: string; description: string }) =>
                `${r.title}\n  ${r.url}\n  ${r.description || ''}`
              );
              if (results.length > 0) {
                return { success: true, output: results.join('\n\n') };
              }
            }
          } catch { /* fall through to DDG */ }
        }

        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
          headers: { 'User-Agent': 'Titan AI Agent/1.0' },
        });
        const html = await res.text();
        const results: string[] = [];
        const linkPattern = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
        const snippetBodyPattern = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        let linkMatch;
        const snippets: string[] = [];
        let snippetMatch;
        while ((snippetMatch = snippetBodyPattern.exec(html)) !== null) {
          snippets.push(snippetMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim());
        }
        let idx = 0;
        while ((linkMatch = linkPattern.exec(html)) !== null && results.length < 8) {
          const rawUrl = linkMatch[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, '').split('&')[0];
          const title = linkMatch[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").trim();
          let decodedUrl = rawUrl;
          try { decodedUrl = decodeURIComponent(rawUrl); } catch { /* keep raw */ }
          const snippet = snippets[idx] || '';
          results.push(`${title}\n  ${decodedUrl}${snippet ? `\n  ${snippet}` : ''}`);
          idx++;
        }
        return { success: true, output: results.length > 0 ? results.join('\n\n') : `No results found for: ${query}` };
      } catch (e) {
        return { success: false, output: '', error: `Web search failed: ${(e as Error).message}` };
      }
    }

    case 'web_fetch': {
      const url = call.args.url as string;
      if (!url) return { success: false, output: '', error: 'url is required' };

      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Titan AI Agent/1.0', 'Accept': 'text/html,application/json,text/plain' },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return { success: false, output: '', error: `HTTP ${res.status}` };
        const raw = await res.text();
        let text = raw;
        text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
        text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
        text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
        text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
        text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
        text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
        text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
        text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
        text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
        text = text.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');
        text = text.replace(/<pre[^>]*><code[^>]*(?:class="[^"]*language-(\w+)[^"]*")?[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
          (_, lang, code) => `\n\`\`\`${lang || ''}\n${code.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')}\n\`\`\`\n`);
        text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
        text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
        text = text.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
        text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
        text = text.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
        text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
        text = text.replace(/<br\s*\/?>/gi, '\n');
        text = text.replace(/<\/p>/gi, '\n\n');
        text = text.replace(/<[^>]+>/g, '');
        text = text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
        text = text.replace(/\n{3,}/g, '\n\n').trim();
        return { success: true, output: text.slice(0, 15000) };
      } catch (e) {
        return { success: false, output: '', error: `Fetch failed: ${(e as Error).message}` };
      }
    }

    case 'read_lints': {
      const filePath = call.args.path as string;
      if (!filePath) return { success: false, output: '', error: 'path is required' };
      if (!isPathSafe(filePath, workspace)) return { success: false, output: '', error: 'Path traversal detected' };

      try {
        const fullPath = path.resolve(workspace, filePath);
        const cmd = `npx eslint "${fullPath}" --format json --no-error-on-unmatched-pattern 2>/dev/null || true`;
        const result = execSync(cmd, {
          cwd: workspace,
          encoding: 'utf-8',
          timeout: 20000,
          maxBuffer: 1024 * 1024,
        });
        try {
          const parsed = JSON.parse(result);
          const messages = (parsed[0]?.messages || []).map((m: { line: number; column: number; severity: number; message: string; ruleId: string }) =>
            `Line ${m.line}:${m.column} [${m.severity === 2 ? 'error' : 'warning'}] ${m.message} (${m.ruleId})`
          );
          return { success: true, output: messages.length > 0 ? messages.join('\n') : 'No lint errors found' };
        } catch {
          return { success: true, output: result.slice(0, 5000) || 'No lint errors found' };
        }
      } catch {
        return { success: true, output: 'Linter not available or no errors found' };
      }
    }

    case 'auto_debug': {
      const results: string[] = [];
      const isWin = process.platform === 'win32';
      const tscCmd = isWin
        ? `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force; npx tsc --noEmit --pretty 2>&1`
        : `npx tsc --noEmit --pretty 2>&1 || true`;
      try {
        const tscResult = execSync(tscCmd, {
          cwd: workspace,
          encoding: 'utf-8',
          timeout: 120000,
          maxBuffer: 2 * 1024 * 1024,
          ...(isWin ? { shell: 'powershell.exe' } : {}),
        });
        const errors = (tscResult || '').trim();
        if (errors && errors.includes('error TS')) {
          const lines = errors.split('\n').filter(l => l.includes('error TS') || l.trim().startsWith('~'));
          results.push(`TypeScript errors (${lines.length} issues):\n${lines.slice(0, 40).join('\n')}`);
        } else {
          results.push('TypeScript: No errors found');
        }
      } catch (e: unknown) {
        const err = e as { stdout?: string; stderr?: string };
        const output = (err.stdout || err.stderr || '').trim();
        if (output.includes('error TS')) {
          const lines = output.split('\n').filter(l => l.includes('error TS'));
          results.push(`TypeScript errors (${lines.length} issues):\n${lines.slice(0, 40).join('\n')}`);
        } else {
          results.push(`TypeScript check failed: ${output.slice(0, 2000)}`);
        }
      }

      const changedFilePath = call.args.path as string;
      if (changedFilePath) {
        try {
          const fullPath = path.resolve(workspace, changedFilePath);
          const lintCmd = `npx eslint "${fullPath}" --format json --no-error-on-unmatched-pattern 2>/dev/null || true`;
          const lintResult = execSync(lintCmd, { cwd: workspace, encoding: 'utf-8', timeout: 20000, maxBuffer: 1024 * 1024 });
          try {
            const parsed = JSON.parse(lintResult);
            const messages = (parsed[0]?.messages || []).filter((m: { severity: number }) => m.severity === 2)
              .map((m: { line: number; column: number; message: string; ruleId: string }) => `Line ${m.line}:${m.column} ${m.message} (${m.ruleId})`);
            results.push(messages.length > 0 ? `ESLint errors in ${changedFilePath}:\n${messages.join('\n')}` : `ESLint: ${changedFilePath} is clean`);
          } catch {
            results.push(`ESLint: ${changedFilePath} - parse error or no issues`);
          }
        } catch {
          results.push('ESLint: not available');
        }
      }

      return { success: true, output: results.join('\n\n') };
    }

    default:
      return { success: false, output: '', error: `Unknown tool: ${call.tool}` };
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body: ToolCall | { calls: ToolCall[] } = await request.json();

    // Support batch tool calls
    if ('calls' in body && Array.isArray(body.calls)) {
      const results = await Promise.all(body.calls.map(call => executeTool(call)));
      return NextResponse.json({ success: true, results });
    }

    const result = await executeTool(body as ToolCall);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Agent tools error:', error);
    return NextResponse.json({ success: false, output: '', error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    tools: [
      { name: 'read_file', description: 'Read file contents', args: ['path', 'startLine?', 'endLine?'] },
      { name: 'edit_file', description: 'Replace text in a file', args: ['path', 'old_string', 'new_string'] },
      { name: 'create_file', description: 'Create a new file', args: ['path', 'content'] },
      { name: 'delete_file', description: 'Delete a file', args: ['path'] },
      { name: 'write_file', description: 'Write/overwrite a file', args: ['path', 'content'] },
      { name: 'list_directory', description: 'List directory contents', args: ['path?'] },
      { name: 'grep_search', description: 'Search for text in files', args: ['query', 'path?', 'glob?'] },
      { name: 'glob_search', description: 'Find files matching a pattern', args: ['pattern', 'path?'] },
      { name: 'run_command', description: 'Execute a shell command', args: ['command', 'cwd?', 'timeout?'] },
      { name: 'web_search', description: 'Search the web', args: ['query'] },
      { name: 'web_fetch', description: 'Fetch a URL and extract text', args: ['url'] },
      { name: 'read_lints', description: 'Check file for linter errors', args: ['path'] },
    ],
  });
}
