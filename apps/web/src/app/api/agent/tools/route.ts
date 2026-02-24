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
        const includeFlag = glob ? `--include="${glob}"` : '--include="*.{ts,tsx,js,jsx,py,rs,go,java,c,cpp,h,md,json,yaml,yml}"';
        const cmd = process.platform === 'win32'
          ? `findstr /S /N /C:"${query}" ${fullPath}\\*.*`
          : `grep -rn "${query}" "${fullPath}" ${includeFlag} 2>/dev/null | head -100`;

        const result = execSync(cmd, { encoding: 'utf-8', timeout: 15000, maxBuffer: 1024 * 1024 });
        return { success: true, output: result.slice(0, 8000) || 'No results found' };
      } catch {
        return { success: true, output: 'No results found' };
      }
    }

    case 'run_command': {
      const command = call.args.command as string;
      const cwd = call.args.cwd as string;

      if (!command) return { success: false, output: '', error: 'command is required' };
      if (!isCommandSafe(command)) return { success: false, output: '', error: 'Command blocked by safety filter' };

      const execDir = cwd ? path.resolve(workspace, cwd) : workspace;
      if (!execDir.startsWith(workspace) && execDir !== workspace) {
        return { success: false, output: '', error: 'Working directory must be within workspace' };
      }

      try {
        const timeout = (call.args.timeout as number) || 30000;
        const result = execSync(command, {
          cwd: execDir,
          encoding: 'utf-8',
          timeout,
          maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, FORCE_COLOR: '0' },
        });
        return { success: true, output: result.slice(0, 15000) };
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
        const cmd = process.platform === 'win32'
          ? `dir /S /B "${fullPath}\\${pattern}" 2>nul`
          : `find "${fullPath}" -name "${pattern}" -type f 2>/dev/null | head -100`;
        const result = execSync(cmd, { encoding: 'utf-8', timeout: 10000, maxBuffer: 512 * 1024 });
        const files = result.trim().split('\n').filter(Boolean).map(f => path.relative(workspace, f));
        return { success: true, output: files.join('\n') || 'No files found' };
      } catch {
        return { success: true, output: 'No files found' };
      }
    }

    case 'web_search': {
      const query = call.args.query as string;
      if (!query) return { success: false, output: '', error: 'query is required' };

      try {
        const encoded = encodeURIComponent(query);
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
          headers: { 'User-Agent': 'Titan AI Agent/1.0' },
        });
        const html = await res.text();
        const results: string[] = [];
        const snippetPattern = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
        let match;
        while ((match = snippetPattern.exec(html)) !== null && results.length < 8) {
          const url = match[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, '').split('&')[0];
          const title = match[2].replace(/&amp;/g, '&').replace(/&#x27;/g, "'");
          try {
            results.push(`${title}\n  ${decodeURIComponent(url)}`);
          } catch {
            results.push(`${title}\n  ${url}`);
          }
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
        const text = await res.text();
        const cleaned = text
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        return { success: true, output: cleaned.slice(0, 12000) };
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
