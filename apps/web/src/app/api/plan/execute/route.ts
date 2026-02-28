import { NextRequest, NextResponse } from 'next/server';
import { callModelWithTools, type ModelToolResponse } from '@/lib/llm-call';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export const maxDuration = 300;

interface ToolCall { tool: string; args: Record<string, unknown>; workspacePath?: string }
interface ToolResult { success: boolean; output: string; error?: string; metadata?: Record<string, unknown> }
interface ExecLog { tool: string; args: Record<string, unknown>; success: boolean; output: string; error?: string }

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//, /del\s+\/[fs]/, /format\s+c:/i,
  /mkfs/, /dd\s+if=/, /:(){ :\|:& };:/,
  />\s*\/dev\/sd/, /shutdown/, /reboot/,
];

function isPathSafe(filePath: string, workspace: string): boolean {
  const resolved = path.resolve(workspace, filePath);
  return resolved.startsWith(path.resolve(workspace) + path.sep) || resolved === path.resolve(workspace);
}

function isCommandSafe(command: string): boolean {
  return !DANGEROUS_PATTERNS.some(p => p.test(command));
}

const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|prisma|json|css|scss|html|md|sql|yaml|yml)$/i;
const MIN_CONTENT_LENGTH = 20;

function isCodeOrConfigFile(filePath: string): boolean {
  return CODE_EXTENSIONS.test(filePath);
}

function htmlToMarkdown(html: string): string {
  let text = html;
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
  text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

async function executeTool(call: ToolCall): Promise<ToolResult> {
  const workspace = call.workspacePath || process.cwd();

  switch (call.tool) {
    case 'create_file':
    case 'write_file': {
      const filePath = call.args.path as string;
      const content = (call.args.content as string) || '';
      if (!filePath) return { success: false, output: '', error: 'path is required' };
      if (!isPathSafe(filePath, workspace)) return { success: false, output: '', error: 'Path outside workspace' };
      if (content.length === 0) {
        return { success: false, output: '', error: 'File content must be non-empty. Every create_file must include full, production-ready content.' };
      }
      if (isCodeOrConfigFile(filePath) && content.trim().length < MIN_CONTENT_LENGTH) {
        return { success: false, output: '', error: `File content must be substantive (min ${MIN_CONTENT_LENGTH} chars for code/config files). No placeholders or stubs.` };
      }
      try {
        const fullPath = path.resolve(workspace, filePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
        return { success: true, output: `Created: ${filePath} (${content.length} bytes)` };
      } catch (e) { return { success: false, output: '', error: (e as Error).message }; }
    }

    case 'read_file': {
      const filePath = call.args.path as string;
      if (!filePath) return { success: false, output: '', error: 'path is required' };
      if (!isPathSafe(filePath, workspace)) return { success: false, output: '', error: 'Path outside workspace' };
      try {
        const fullPath = path.resolve(workspace, filePath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        const start = (call.args.startLine as number) || 1;
        const end = (call.args.endLine as number) || lines.length;
        return { success: true, output: lines.slice(start - 1, end).map((l, i) => `${start + i}|${l}`).join('\n') };
      } catch { return { success: false, output: '', error: `File not found: ${filePath}` }; }
    }

    case 'edit_file': {
      const filePath = call.args.path as string;
      const oldStr = call.args.old_string as string;
      const newStr = call.args.new_string as string;
      if (!filePath || oldStr === undefined || newStr === undefined) return { success: false, output: '', error: 'path, old_string, new_string required' };
      if (!isPathSafe(filePath, workspace)) return { success: false, output: '', error: 'Path outside workspace' };
      try {
        const fullPath = path.resolve(workspace, filePath);
        let content = fs.readFileSync(fullPath, 'utf-8');
        if (!content.includes(oldStr)) return { success: false, output: '', error: 'old_string not found in file' };
        content = content.replace(oldStr, newStr);
        fs.writeFileSync(fullPath, content, 'utf-8');
        return { success: true, output: `Edited: ${filePath}` };
      } catch (e) { return { success: false, output: '', error: (e as Error).message }; }
    }

    case 'list_directory': {
      const dirPath = (call.args.path as string) || '.';
      if (!isPathSafe(dirPath, workspace)) return { success: false, output: '', error: 'Path outside workspace' };
      try {
        const fullPath = path.resolve(workspace, dirPath);
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        const lines = entries
          .filter(e => !e.name.startsWith('.') || ['.env', '.gitignore'].includes(e.name))
          .map(e => `${e.isDirectory() ? '[DIR] ' : '      '}${e.name}`)
          .sort();
        return { success: true, output: lines.join('\n') || '(empty directory)' };
      } catch { return { success: false, output: '', error: `Directory not found: ${dirPath}` }; }
    }

    case 'run_command': {
      let command = call.args.command as string;
      if (!command) return { success: false, output: '', error: 'command is required' };
      if (!isCommandSafe(command)) return { success: false, output: '', error: 'Command blocked by safety filter' };
      command = command.replace(/\bmkdir\s+-p\s+/g, 'New-Item -ItemType Directory -Force -Path ');
      command = command.replace(/\btouch\s+/g, 'New-Item -ItemType File -Force -Path ');
      try {
        const cwd = call.args.cwd ? path.resolve(workspace, call.args.cwd as string) : workspace;
        const result = execSync(command, { cwd, encoding: 'utf-8', timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
        return { success: true, output: (result || '').slice(0, 8000) };
      } catch (e: unknown) {
        const err = e as { stdout?: string; stderr?: string; message?: string };
        return { success: false, output: (err.stdout || '').slice(0, 4000), error: (err.stderr || err.message || '').slice(0, 2000) };
      }
    }

    case 'delete_file': {
      const filePath = call.args.path as string;
      if (!filePath) return { success: false, output: '', error: 'path is required' };
      if (!isPathSafe(filePath, workspace)) return { success: false, output: '', error: 'Path outside workspace' };
      try {
        const fullPath = path.resolve(workspace, filePath);
        fs.rmSync(fullPath, { recursive: true, force: true });
        return { success: true, output: `Deleted: ${filePath}` };
      } catch (e) { return { success: false, output: '', error: (e as Error).message }; }
    }

    case 'grep_search': {
      const query = call.args.query as string;
      const searchPath = (call.args.path as string) || '.';
      const glob = (call.args.glob as string) || '';
      if (!query) return { success: false, output: '', error: 'query is required' };
      if (!isPathSafe(searchPath, workspace)) return { success: false, output: '', error: 'Path outside workspace' };
      try {
        const fullPath = path.resolve(workspace, searchPath);
        const isWin = process.platform === 'win32';
        if (isWin) {
          const defaultExts = '*.ts,*.tsx,*.js,*.jsx,*.py,*.json,*.md,*.css,*.html,*.yaml,*.yml';
          const includeExts = (glob || defaultExts).split(',').map(e => `'${e.trim()}'`).join(',');
          const escapedQuery = query.replace(/'/g, "''");
          const cmd = [
            `Get-ChildItem -Path '${fullPath}' -Recurse -Include ${includeExts} -File`,
            `Where-Object { $_.FullName -notmatch '[\\\\/](node_modules|\.git|dist|\.next|\.turbo|coverage)[\\\\/]' }`,
            `Select-String -Pattern '${escapedQuery}' -CaseSensitive:$false`,
            `Select-Object -First 60`,
            `ForEach-Object { "$($_.Path | Resolve-Path -Relative):$($_.LineNumber): $($_.Line.TrimStart())" }`,
          ].join(' | ');
          const result = execSync(cmd, { cwd: fullPath, encoding: 'utf-8', timeout: 30000, maxBuffer: 2 * 1024 * 1024, shell: 'powershell.exe' });
          return { success: true, output: result.slice(0, 10000) || 'No results found' };
        } else {
          const includeFlag = glob ? `--include="${glob}"` : '--include="*.{ts,tsx,js,jsx,py,json,md,css,html,yaml,yml}"';
          const cmd = `grep -rn "${query}" "${fullPath}" ${includeFlag} --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next 2>/dev/null | head -60`;
          const result = execSync(cmd, { encoding: 'utf-8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
          return { success: true, output: result.slice(0, 10000) || 'No results found' };
        }
      } catch {
        return { success: true, output: 'No results found' };
      }
    }

    case 'glob_search': {
      const pattern = call.args.pattern as string;
      const basePath = (call.args.path as string) || '.';
      if (!pattern) return { success: false, output: '', error: 'pattern is required' };
      if (!isPathSafe(basePath, workspace)) return { success: false, output: '', error: 'Path outside workspace' };
      try {
        const fullPath = path.resolve(workspace, basePath);
        const isWin = process.platform === 'win32';
        const cmd = isWin
          ? `Get-ChildItem -Path '${fullPath}' -Recurse -Filter '${pattern}' -File | Where-Object { $_.FullName -notmatch '[\\\\/](node_modules|\.git|dist|\.next)[\\\\/]' } | Select-Object -First 80 | ForEach-Object { $_.FullName | Resolve-Path -Relative }`
          : `find "${fullPath}" -name "${pattern}" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" 2>/dev/null | head -80`;
        const result = execSync(cmd, { cwd: workspace, encoding: 'utf-8', timeout: 15000, maxBuffer: 1024 * 1024, ...(isWin ? { shell: 'powershell.exe' } : {}) });
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
        const braveKey = process.env.BRAVE_SEARCH_API_KEY;
        if (braveKey) {
          const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encoded}&count=8`, {
            headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': braveKey },
          });
          if (res.ok) {
            const data = await res.json();
            const results = (data.web?.results || []).slice(0, 8).map((r: { title: string; url: string; description: string }) =>
              `${r.title}\n  ${r.url}\n  ${r.description || ''}`
            );
            return { success: true, output: results.join('\n\n') || `No results for: ${query}` };
          }
        }
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
          try { results.push(`${title}\n  ${decodeURIComponent(url)}`); } catch { results.push(`${title}\n  ${url}`); }
        }
        return { success: true, output: results.length > 0 ? results.join('\n\n') : `No results for: ${query}` };
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
        const cleaned = htmlToMarkdown(text);
        return { success: true, output: cleaned.slice(0, 15000) };
      } catch (e) {
        return { success: false, output: '', error: `Fetch failed: ${(e as Error).message}` };
      }
    }

    case 'read_lints': {
      const filePath = call.args.path as string;
      if (!filePath) return { success: false, output: '', error: 'path is required' };
      if (!isPathSafe(filePath, workspace)) return { success: false, output: '', error: 'Path outside workspace' };
      try {
        const fullPath = path.resolve(workspace, filePath);
        const cmd = `npx eslint "${fullPath}" --format json --no-error-on-unmatched-pattern 2>/dev/null || true`;
        const result = execSync(cmd, { cwd: workspace, encoding: 'utf-8', timeout: 20000, maxBuffer: 1024 * 1024 });
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

const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'create_file',
      description: 'Create a new file with content. Parent directories are created automatically.',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'Relative file path' }, content: { type: 'string', description: 'Full file content' } }, required: ['path', 'content'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing an exact string match.',
      parameters: { type: 'object', properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['path', 'old_string', 'new_string'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read file contents.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_directory',
      description: 'List files and directories.',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'Directory path (default: .)' } }, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: 'Run a shell command. Use for npm install, git init, etc.',
      parameters: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string', description: 'Working directory (optional)' } }, required: ['command'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_file',
      description: 'Delete a file or directory.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'grep_search',
      description: 'Search for text/patterns across the codebase. Use BEFORE creating files to find existing patterns and conventions.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Text or regex pattern to search for' }, path: { type: 'string', description: 'Directory to search in (default: .)' }, glob: { type: 'string', description: 'File type filter (e.g. *.tsx,*.ts)' } }, required: ['query'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'glob_search',
      description: 'Find files matching a name pattern across the workspace.',
      parameters: { type: 'object', properties: { pattern: { type: 'string', description: 'Filename pattern (e.g. *.test.ts, layout.tsx)' }, path: { type: 'string', description: 'Base directory (default: .)' } }, required: ['pattern'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: 'Search the internet for documentation, APIs, or current best practices. Use when unsure about library APIs or need 2026 docs.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_fetch',
      description: 'Fetch and read a web page as markdown. Use for reading documentation pages.',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'URL to fetch' } }, required: ['url'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_lints',
      description: 'Check a file for lint/type errors after editing. Use after creating or editing TypeScript files.',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'File path to lint check' } }, required: ['path'] },
    },
  },
];

const MAX_ROUNDS = 15;
const MAX_REWORK_ATTEMPTS = 2;

function buildSystemPrompt(workspacePath: string, designDirective?: string, previousFiles?: string[], systemContext?: string): string {
  return `You are executing a task under the ULTIMATE EXECUTION PROTOCOL. Your job is to complete every requirement with zero shortcuts and zero missed items. The user must not be able to point at anything and say "this is missing."

WORKSPACE: ${workspacePath}
${designDirective ? `\nDESIGN SYSTEM:\n${designDirective}\nApply these exact colors, fonts, and styles to ALL UI components. Use modern CSS/Tailwind. Create visually polished, production-quality interfaces.\n` : ''}
${previousFiles?.length ? `\nFILES ALREADY CREATED BY PREVIOUS TASKS:\n${previousFiles.join('\n')}\nBuild on top of these. Import from them. Do not recreate them.\n` : ''}
${systemContext || ''}

ULTIMATE PROTOCOL — MANDATORY:

PHASE 1 — RESEARCH (do this BEFORE writing any code):
1. Call list_directory first to see project structure. Do not skip.
2. Use grep_search to find existing patterns, conventions, imports, and related code. Understand how the codebase works BEFORE adding to it.
3. Use glob_search to find existing files with similar names or purposes. Never duplicate existing functionality.
4. If the task involves an API, library, or framework you're unsure about, use web_search to look up current docs.

PHASE 2 — IMPLEMENT (only after research is done):
5. For every subtask in the user message: produce at least one create_file or edit_file. No subtask left without a deliverable.
6. Every create_file must contain FULL content (min 20+ chars for code files). Empty files or placeholder-only files are forbidden and will be rejected by the system.
7. If modifying existing code: read_file first, then edit_file with exact old_string and new_string.
8. Match existing code conventions (naming, imports, patterns, styling) found during research phase.
9. Use run_command for package installs when the task requires new dependencies.

PHASE 3 — VERIFY (do this AFTER writing code):
10. After writing files: read_file each created path to verify. Fix any empty or incorrect file before finishing.
11. Do not stop until: (a) every subtask has a file create/edit, (b) every created file has been read back and verified, (c) no TODOs or placeholders remain.

RULES:
- You MUST use tools. Do NOT describe code without writing it. create_file and edit_file are required for every change.
- RESEARCH FIRST: Always grep_search for existing code before creating new files. Mirror existing patterns.
- Write COMPLETE, production-quality code. No "implement later", no empty stubs.
- Every component: real styling, real logic, real content. Modern best practices (TypeScript, error handling, etc.).
- Never call create_file or write_file with empty or placeholder content. Every file must be complete and usable.
- If a tool fails, try a different approach. Do not give up after one attempt.

AVAILABLE TOOLS: create_file, edit_file, read_file, list_directory, run_command, delete_file, grep_search, glob_search, web_search, web_fetch, read_lints`;
}

async function runToolLoop(
  messages: Array<{ role: string; content: string | null; tool_call_id?: string; tool_calls?: unknown[] }>,
  llmModel: string,
  workspacePath: string,
  logs: ExecLog[],
  filesCreated: string[],
): Promise<{ success: boolean; error?: string }> {
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let response: ModelToolResponse;
    try {
      response = await callModelWithTools(llmModel, messages, TOOL_DEFINITIONS, { temperature: 0.1, maxTokens: 16000 });
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }

    if (response.toolCalls.length === 0) {
      messages.push({ role: 'assistant', content: response.content });
      break;
    }

    messages.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    for (const tc of response.toolCalls) {
      const result = await executeTool({ tool: tc.name, args: tc.arguments, workspacePath });
      logs.push({ tool: tc.name, args: tc.arguments, success: result.success, output: result.output.slice(0, 1000), error: result.error });

      if ((tc.name === 'create_file' || tc.name === 'write_file') && result.success) {
        filesCreated.push(tc.arguments.path as string);
      }

      messages.push({
        role: 'tool',
        content: JSON.stringify({ success: result.success, output: result.output.slice(0, 4000), error: result.error }),
        tool_call_id: tc.id,
      });
    }
  }
  return { success: true };
}

async function verifyTask(
  taskPrompt: string,
  filesCreated: string[],
  workspacePath: string,
  llmModel: string,
): Promise<{ passed: boolean; feedback: string }> {
  if (filesCreated.length === 0) {
    return { passed: false, feedback: 'No files were created. The task requires file creation.' };
  }

  const subtaskMatch = taskPrompt.match(/expect at least (\d+) file|Total subtasks: (\d+)/i);
  const requiredFiles = subtaskMatch ? Math.max(1, parseInt(subtaskMatch[1] || subtaskMatch[2] || '1', 10)) : 0;
  if (requiredFiles > 0 && filesCreated.length < requiredFiles) {
    return { passed: false, feedback: `Task required at least ${requiredFiles} file(s) (one per subtask). Only ${filesCreated.length} file(s) were created. Create or edit the missing deliverable(s).` };
  }

  const fileContents: string[] = [];
  for (const fp of filesCreated.slice(0, 10)) {
    try {
      const fullPath = path.resolve(workspacePath, fp);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const len = content.length;
        const trimmed = content.trim().length;
        if (len === 0) {
          return { passed: false, feedback: `File "${fp}" is empty. All created files must contain real code or content.` };
        }
        if (isCodeOrConfigFile(fp) && trimmed < MIN_CONTENT_LENGTH) {
          return { passed: false, feedback: `File "${fp}" is too short (${trimmed} chars). Code/config files must be substantive (min ${MIN_CONTENT_LENGTH} chars).` };
        }
        fileContents.push(`--- ${fp} ---\n${content.slice(0, 2000)}`);
      } else {
        fileContents.push(`--- ${fp} --- FILE MISSING`);
      }
    } catch {
      fileContents.push(`--- ${fp} --- READ ERROR`);
    }
  }

  try {
    const verifyResponse = await callModelWithTools(
      llmModel,
      [
        {
          role: 'system',
          content: `You are a code reviewer verifying that a task was completed correctly. Review the created files and determine if the task requirements were met.

Respond with ONLY a JSON object:
{ "passed": true/false, "feedback": "explanation of what passed or what needs to be fixed" }

Check for:
- Every subtask in the task requirements has a corresponding created or edited file (no subtask left without a deliverable).
- All required files exist and have substantive content (no empty or stub files).
- Code is complete (no TODOs, no placeholders, no "implement later").
- Imports are correct; no obvious syntax errors; component/function structure is correct.
- If anything in the task or subtasks is not fully implemented, or if the user could point at something and say "this is missing", return passed: false.`,
        },
        {
          role: 'user',
          content: `TASK REQUIREMENTS:\n${taskPrompt}\n\nCREATED FILES:\n${fileContents.join('\n\n')}\n\nDoes this implementation satisfy the task requirements? Return JSON.`,
        },
      ],
      [],
      { temperature: 0.1, maxTokens: 2000 },
    );

    const text = (verifyResponse.content || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    try {
      const result = JSON.parse(text);
      return { passed: !!result.passed, feedback: result.feedback || '' };
    } catch {
      return { passed: text.toLowerCase().includes('"passed": true') || text.toLowerCase().includes('"passed":true'), feedback: text.slice(0, 500) };
    }
  } catch {
    return { passed: true, feedback: 'Verification skipped (LLM call failed)' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskPrompt, model, workspacePath, designDirective, previousFiles, systemContext } = body as {
      taskPrompt: string;
      model?: string;
      workspacePath: string;
      designDirective?: string;
      previousFiles?: string[];
      systemContext?: string;
    };

    if (!taskPrompt || !workspacePath) {
      return NextResponse.json({ error: 'taskPrompt and workspacePath are required' }, { status: 400 });
    }

    const sysPrompt = buildSystemPrompt(workspacePath, designDirective, previousFiles, systemContext);
    const llmModel = model || 'google/gemini-2.0-flash-001';
    const logs: ExecLog[] = [];
    const filesCreated: string[] = [];
    const verificationResults: Array<{ attempt: number; passed: boolean; feedback: string }> = [];

    for (let attempt = 0; attempt <= MAX_REWORK_ATTEMPTS; attempt++) {
      if (attempt > 0) filesCreated.length = 0;
      const messages: Array<{ role: string; content: string | null; tool_call_id?: string; tool_calls?: unknown[] }> = [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: attempt === 0
          ? taskPrompt
          : `${taskPrompt}\n\nPREVIOUS ATTEMPT FAILED VERIFICATION:\n${verificationResults[attempt - 1]?.feedback || 'Unknown failure'}\n\nFix the issues above. Read back the files that need fixing, then use edit_file or create_file to correct them.` },
      ];

      const loopResult = await runToolLoop(messages, llmModel, workspacePath, logs, filesCreated);
      if (!loopResult.success) {
        return NextResponse.json({ success: false, error: loopResult.error, logs, filesCreated, verificationResults }, { status: 500 });
      }

      const verification = await verifyTask(taskPrompt, filesCreated, workspacePath, llmModel);
      verificationResults.push({ attempt, passed: verification.passed, feedback: verification.feedback });

      if (verification.passed) {
        break;
      }

      logs.push({
        tool: 'sentinel_verify',
        args: { attempt },
        success: false,
        output: verification.feedback.slice(0, 500),
        error: `Verification failed (attempt ${attempt + 1}/${MAX_REWORK_ATTEMPTS + 1})`,
      });
    }

    const finalPassed = verificationResults.length > 0 && verificationResults[verificationResults.length - 1].passed;

    return NextResponse.json({ success: true, logs, filesCreated, verificationResults, verified: finalPassed });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
