'use client';

import { useCallback, useRef } from 'react';
import type { ToolCallBlock, CodeDiffBlock } from '@/types/ide';
import { useFileStore, type FileNode } from '@/stores/file-store';
import { isElectron, electronAPI } from '@/lib/electron';

interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface UseAgentToolsOptions {
  onTerminalCommand?: (command: string, output: string, exitCode: number) => void;
  onFileEdited?: (path: string, newContent: string) => void;
  onFileCreated?: (path: string, content: string) => void;
  workspacePath?: string;
  fileContents?: Record<string, string>;
  isBrowserWorkspace?: boolean;
}

/**
 * Checks if the workspace is browser-local (opened via File System Access API)
 * vs. server-side (cloned repo on the server filesystem).
 * Browser workspaces have fileContents in memory but don't exist on the server.
 */
function isBrowserLocal(workspacePath?: string, fileContents?: Record<string, string>): boolean {
  if (!fileContents || Object.keys(fileContents).length === 0) return false;
  if (!workspacePath) return true;
  // Server paths are absolute (start with / or C:\). Browser paths are folder names.
  if (workspacePath.startsWith('/') || /^[A-Z]:\\/i.test(workspacePath)) return false;
  return true;
}

/**
 * Resolve a file path -- handles both "src/index.ts" and just "index.ts"
 * by checking all possible keys in fileContents.
 */
function resolveFilePath(filePath: string, fileContents: Record<string, string>): string | null {
  if (filePath in fileContents) return filePath;
  // Try without leading ./
  const cleaned = filePath.replace(/^\.\//, '');
  if (cleaned in fileContents) return cleaned;
  // Try matching by filename only (for flat-loaded files)
  const baseName = filePath.split('/').pop() || filePath;
  if (baseName in fileContents) return baseName;
  // Try finding a key that ends with the path
  for (const key of Object.keys(fileContents)) {
    if (key.endsWith('/' + filePath) || key.endsWith('\\' + filePath)) return key;
    if (key === filePath) return key;
  }
  return null;
}

/**
 * Client-side list_directory using the file store's tree.
 */
function clientListDirectory(dirPath: string, fileContents: Record<string, string>): ToolResult {
  const isRoot = !dirPath || dirPath === '.' || dirPath === '/';

  const { fileTree } = useFileStore.getState();

  if (fileTree.length > 0) {
    let targetNodes: FileNode[] = fileTree;

    if (!isRoot) {
      // Find the target directory in the tree
      function findDir(nodes: FileNode[], target: string): FileNode[] | null {
        for (const n of nodes) {
          if (n.type === 'folder' && (n.path === target || n.name === target)) {
            return n.children || [];
          }
          if (n.type === 'folder' && n.children) {
            const found = findDir(n.children, target);
            if (found) return found;
          }
        }
        return null;
      }
      const found = findDir(fileTree, dirPath);
      if (found) targetNodes = found;
      else {
        // Fall back to filtering fileContents keys
        return clientListFromKeys(dirPath, fileContents);
      }
    }

    const listing = targetNodes.map(n => {
      return n.type === 'folder' ? `dir  ${n.name}/` : `file  ${n.name}`;
    }).join('\n');

    return { success: true, output: listing || '(empty directory)', metadata: { count: targetNodes.length } };
  }

  return clientListFromKeys(dirPath, fileContents);
}

function clientListFromKeys(dirPath: string, fileContents: Record<string, string>): ToolResult {
  const isRoot = !dirPath || dirPath === '.' || dirPath === '/';
  const prefix = isRoot ? '' : dirPath.replace(/\/$/, '') + '/';
  const seen = new Set<string>();
  const entries: string[] = [];

  for (const key of Object.keys(fileContents)) {
    if (prefix && !key.startsWith(prefix)) continue;
    const rest = prefix ? key.slice(prefix.length) : key;
    const parts = rest.split('/');
    const name = parts[0];
    if (seen.has(name)) continue;
    seen.add(name);
    if (parts.length > 1) {
      entries.push(`dir  ${name}/`);
    } else {
      entries.push(`file  ${name}`);
    }
  }

  entries.sort((a, b) => {
    const aIsDir = a.startsWith('dir');
    const bIsDir = b.startsWith('dir');
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
    return a.localeCompare(b);
  });

  return {
    success: true,
    output: entries.join('\n') || '(empty directory)',
    metadata: { count: entries.length },
  };
}

/**
 * Client-side grep_search through in-memory file contents.
 */
function clientGrepSearch(query: string, searchPath: string | undefined, glob: string | undefined, fileContents: Record<string, string>): ToolResult {
  const results: string[] = [];
  let regex: RegExp;
  try {
    regex = new RegExp(query, 'gi');
  } catch {
    regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  }

  const prefix = searchPath && searchPath !== '.' ? searchPath.replace(/\/$/, '') + '/' : '';
  const globExt = glob ? glob.replace('*.', '.') : '';

  for (const [filePath, content] of Object.entries(fileContents)) {
    if (prefix && !filePath.startsWith(prefix) && !filePath.includes(prefix)) continue;
    if (globExt && !filePath.endsWith(globExt)) continue;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        results.push(`${filePath}:${i + 1}:${lines[i]}`);
        regex.lastIndex = 0;
        if (results.length >= 100) break;
      }
    }
    if (results.length >= 100) break;
  }

  return {
    success: true,
    output: results.join('\n') || 'No results found',
    metadata: { matchCount: results.length },
  };
}

export function useAgentTools({ onTerminalCommand, onFileEdited, onFileCreated, workspacePath, fileContents, isBrowserWorkspace }: UseAgentToolsOptions = {}) {
  const abortRef = useRef(false);

  const executeToolCall = useCallback(async (
    tool: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> => {
    if (abortRef.current) {
      return { success: false, output: '', error: 'Aborted' };
    }

    const useBrowser = isBrowserWorkspace ?? isBrowserLocal(workspacePath, fileContents);
    const contents = fileContents || {};

    try {
      // ── Electron native execution (highest priority) ──
      if (isElectron && electronAPI) {
        return await executeElectronTool(tool, args, {
          onTerminalCommand,
          onFileEdited,
          onFileCreated,
          workspacePath,
        });
      }

      // ── run_command always goes to server ──
      if (tool === 'run_command') {
        const res = await fetch('/api/terminal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: args.command,
            cwd: args.cwd || (useBrowser ? undefined : workspacePath) || undefined,
            timeout: args.timeout || 30000,
          }),
        });
        const data = await res.json();
        const output = data.stdout || data.output || '';
        const stderr = data.stderr || '';
        const exitCode = data.exitCode ?? (data.success ? 0 : 1);
        const combinedOutput = stderr ? `${output}\n${stderr}`.trim() : output;

        onTerminalCommand?.(args.command as string, combinedOutput, exitCode);

        return {
          success: exitCode === 0,
          output: combinedOutput.slice(0, 15000),
          error: exitCode !== 0 ? `Exit code: ${exitCode}` : undefined,
          metadata: { exitCode },
        };
      }

      // ── Client-side execution for browser workspaces ──
      if (useBrowser) {
        switch (tool) {
          case 'read_file': {
            const filePath = args.path as string;
            if (!filePath) return { success: false, output: '', error: 'path is required' };

            const resolved = resolveFilePath(filePath, contents);
            if (!resolved) {
              return { success: false, output: '', error: `File not found: ${filePath}. Available files: ${Object.keys(contents).slice(0, 20).join(', ')}` };
            }

            const content = contents[resolved];
            const lines = content.split('\n');
            const startLine = (args.startLine as number) || 1;
            const endLine = (args.endLine as number) || lines.length;
            const slice = lines.slice(startLine - 1, endLine);
            const numbered = slice.map((line, i) => `${String(startLine + i).padStart(6)}|${line}`).join('\n');

            return {
              success: true,
              output: numbered,
              metadata: { lines: lines.length, size: content.length },
            };
          }

          case 'edit_file': {
            const filePath = args.path as string;
            const oldStr = args.old_string as string;
            const newStr = args.new_string as string;

            if (!filePath || oldStr === undefined || newStr === undefined) {
              return { success: false, output: '', error: 'path, old_string, and new_string are required' };
            }

            const resolved = resolveFilePath(filePath, contents);
            if (!resolved) {
              return { success: false, output: '', error: `File not found: ${filePath}` };
            }

            let content = contents[resolved];
            if (!content.includes(oldStr)) {
              return { success: false, output: '', error: 'old_string not found in file. Content may have changed. Re-read the file.' };
            }

            content = content.replace(oldStr, newStr);
            onFileEdited?.(resolved, content);

            return {
              success: true,
              output: `File edited: ${resolved}`,
              metadata: { linesChanged: newStr.split('\n').length, newContent: content },
            };
          }

          case 'create_file': {
            const filePath = args.path as string;
            const content = (args.content as string) || '';
            if (!filePath) return { success: false, output: '', error: 'path is required' };

            onFileCreated?.(filePath, content);

            return {
              success: true,
              output: `File created: ${filePath}`,
              metadata: { size: content.length },
            };
          }

          case 'list_directory': {
            const dirPath = (args.path as string) || '.';
            return clientListDirectory(dirPath, contents);
          }

          case 'grep_search': {
            const query = args.query as string;
            if (!query) return { success: false, output: '', error: 'query is required' };
            return clientGrepSearch(query, args.path as string, args.glob as string, contents);
          }

          default:
            return { success: false, output: '', error: `Unknown tool: ${tool}` };
        }
      }

      // ── Server-side execution for server workspaces ──
      const res = await fetch('/api/agent/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, args, workspacePath: workspacePath || undefined }),
      });
      const data = await res.json();

      if (tool === 'edit_file' && data.success) {
        const fullContent = data.metadata?.newContent as string || args.new_string as string;
        onFileEdited?.(args.path as string, fullContent);
      } else if (tool === 'create_file' && data.success) {
        onFileCreated?.(args.path as string, args.content as string);
      }

      return data;
    } catch (e) {
      return {
        success: false,
        output: '',
        error: e instanceof Error ? e.message : 'Tool execution failed',
      };
    }
  }, [onTerminalCommand, onFileEdited, onFileCreated, workspacePath, fileContents, isBrowserWorkspace]);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const reset = useCallback(() => {
    abortRef.current = false;
  }, []);

  return { executeToolCall, abort, reset };
}

async function executeElectronTool(
  tool: string,
  args: Record<string, unknown>,
  ctx: {
    onTerminalCommand?: (command: string, output: string, exitCode: number) => void;
    onFileEdited?: (path: string, newContent: string) => void;
    onFileCreated?: (path: string, content: string) => void;
    workspacePath?: string;
  },
): Promise<ToolResult> {
  const api = electronAPI!;

  switch (tool) {
    case 'read_file': {
      const filePath = args.path as string;
      if (!filePath) return { success: false, output: '', error: 'path is required' };
      const data = await api.tools.readFile(filePath, {
        lineOffset: args.startLine as number | undefined,
        lineLimit: args.endLine ? (args.endLine as number) - ((args.startLine as number) || 1) + 1 : undefined,
      });
      const lines = data.content.split('\n');
      const start = (args.startLine as number) || 1;
      const numbered = lines.map((l, i) => `${String(start + i).padStart(6)}|${l}`).join('\n');
      return { success: true, output: numbered, metadata: { lines: data.lineCount, size: data.content.length } };
    }

    case 'edit_file': {
      const filePath = args.path as string;
      const oldStr = args.old_string as string;
      const newStr = args.new_string as string;
      if (!filePath || oldStr === undefined || newStr === undefined) {
        return { success: false, output: '', error: 'path, old_string, and new_string are required' };
      }
      const result = await api.tools.editFile(filePath, oldStr, newStr);
      ctx.onFileEdited?.(filePath, result.newContent);
      return { success: true, output: `File edited: ${filePath}`, metadata: { newContent: result.newContent } };
    }

    case 'create_file': {
      const filePath = args.path as string;
      const content = (args.content as string) || '';
      if (!filePath) return { success: false, output: '', error: 'path is required' };
      await api.tools.createFile(filePath, content);
      ctx.onFileCreated?.(filePath, content);
      return { success: true, output: `File created: ${filePath}`, metadata: { size: content.length } };
    }

    case 'delete_file': {
      const filePath = args.path as string;
      if (!filePath) return { success: false, output: '', error: 'path is required' };
      await api.tools.deleteFile(filePath);
      return { success: true, output: `File deleted: ${filePath}` };
    }

    case 'list_directory': {
      const dirPath = (args.path as string) || ctx.workspacePath || '.';
      const data = await api.tools.listDir(dirPath);
      const listing = data.entries.map(e => `${e.type === 'directory' ? 'dir ' : 'file'} ${e.name}${e.type === 'directory' ? '/' : ''}`).join('\n');
      return { success: true, output: listing || '(empty directory)', metadata: { count: data.entries.length } };
    }

    case 'grep_search': {
      const query = args.query as string;
      if (!query) return { success: false, output: '', error: 'query is required' };
      const dirPath = (args.path as string) || ctx.workspacePath || '.';
      const data = await api.tools.grep(query, dirPath, { include: args.glob as string, maxResults: 200 });
      const output = data.matches.map(m => `${m.file}:${m.line}:${m.content}`).join('\n');
      return { success: true, output: output || 'No results found', metadata: { matchCount: data.matches.length } };
    }

    case 'glob_search': {
      const pattern = args.pattern as string;
      if (!pattern) return { success: false, output: '', error: 'pattern is required' };
      const dirPath = (args.path as string) || ctx.workspacePath || '.';
      const data = await api.tools.glob(pattern, dirPath);
      return { success: true, output: data.files.join('\n') || 'No files matched', metadata: { count: data.files.length } };
    }

    case 'run_command': {
      const command = args.command as string;
      if (!command) return { success: false, output: '', error: 'command is required' };
      const cwd = (args.cwd as string) || ctx.workspacePath;
      const data = await api.tools.runCommand(command, cwd);
      const combined = data.stderr ? `${data.stdout}\n${data.stderr}`.trim() : data.stdout;
      ctx.onTerminalCommand?.(command, combined, data.exitCode);
      return {
        success: data.exitCode === 0,
        output: combined.slice(0, 15000),
        error: data.exitCode !== 0 ? `Exit code: ${data.exitCode}` : undefined,
        metadata: { exitCode: data.exitCode },
      };
    }

    case 'web_search': {
      const query = args.query as string;
      if (!query) return { success: false, output: '', error: 'query is required' };
      const results = await api.web.search(query);
      const output = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n');
      return { success: true, output: output || 'No results found', metadata: { count: results.length } };
    }

    case 'web_fetch': {
      const url = args.url as string;
      if (!url) return { success: false, output: '', error: 'url is required' };
      const data = await api.web.fetch(url);
      return { success: true, output: data.content.slice(0, 30000), metadata: { title: data.title } };
    }

    case 'read_lints': {
      const filePath = args.path as string;
      if (!filePath) return { success: false, output: '', error: 'path is required' };
      const data = await api.tools.readLints(filePath);
      if (data.diagnostics.length === 0) return { success: true, output: 'No linter errors found.' };
      const output = data.diagnostics.map(d => `${d.file}:${d.line}:${d.column} ${d.severity}: ${d.message} [${d.source}]`).join('\n');
      return { success: true, output, metadata: { count: data.diagnostics.length } };
    }

    case 'semantic_search': {
      const query = args.query as string;
      if (!query) return { success: false, output: '', error: 'query is required' };
      const dirPath = (args.path as string) || ctx.workspacePath || '.';
      const data = await api.tools.semanticSearch(query, dirPath);
      if (data.results.length === 0) return { success: true, output: 'No semantic results. Try grep_search for text-based search.' };
      const output = data.results.map(r => `${r.file}:${r.line} (score: ${r.score.toFixed(2)})\n  ${r.content}`).join('\n');
      return { success: true, output };
    }

    default:
      return { success: false, output: '', error: `Unknown tool: ${tool}` };
  }
}

export function toolCallSummary(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'read_file':
      return `Read ${args.path}`;
    case 'edit_file':
      return `Edit ${args.path}`;
    case 'create_file':
      return `Create ${args.path}`;
    case 'delete_file':
      return `Delete ${args.path}`;
    case 'list_directory':
      return `List ${args.path || '.'}`;
    case 'grep_search':
      return `Search "${args.query}"${args.path ? ` in ${args.path}` : ''}`;
    case 'glob_search':
      return `Glob "${args.pattern}"${args.path ? ` in ${args.path}` : ''}`;
    case 'run_command':
      return `$ ${(args.command as string || '').slice(0, 80)}`;
    case 'web_search':
      return `Web search "${args.query}"`;
    case 'web_fetch':
      return `Fetch ${args.url}`;
    case 'read_lints':
      return `Lint check ${args.path}`;
    case 'semantic_search':
      return `Semantic search "${args.query}"`;
    default:
      return tool;
  }
}
