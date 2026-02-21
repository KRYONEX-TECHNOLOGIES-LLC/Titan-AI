'use client';

import { useCallback, useRef } from 'react';
import { electronAPI } from '@/lib/electron';

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
}

function resolveToWorkspace(filePath: string, wsPath?: string): string {
  if (!wsPath) return filePath;
  if (filePath.startsWith('/') || /^[A-Z]:\\/i.test(filePath)) return filePath;
  const base = wsPath.replace(/[\\/]$/, '');
  const rel = filePath.replace(/^\.[\\/]/, '');
  return base + '/' + rel;
}

export function useAgentTools({ onTerminalCommand, onFileEdited, onFileCreated, workspacePath }: UseAgentToolsOptions = {}) {
  const abortRef = useRef(false);

  const executeToolCall = useCallback(async (
    tool: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> => {
    if (abortRef.current) {
      return { success: false, output: '', error: 'Aborted' };
    }

    try {
      if (!electronAPI) {
        return { success: false, output: '', error: 'Electron API not available. This app requires the desktop version.' };
      }

      const api = electronAPI;

      switch (tool) {
        case 'read_file': {
          const rawPath = args.path as string;
          if (!rawPath) return { success: false, output: '', error: 'path is required' };
          const COMMON_EXTS = ['.py', '.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml', '.md', '.txt', '.toml', '.cfg', '.env'];
          // Try the exact path first, then fallback with common extensions
          const candidatePaths: string[] = [resolveToWorkspace(rawPath, workspacePath)];
          const hasExt = /\.[a-zA-Z0-9]+$/.test(rawPath);
          if (!hasExt) {
            for (const ext of COMMON_EXTS) {
              candidatePaths.push(resolveToWorkspace(rawPath + ext, workspacePath));
            }
          }
          let data: { content: string; lineCount: number } | null = null;
          let usedPath = candidatePaths[0];
          for (const candidate of candidatePaths) {
            try {
              data = await api.tools.readFile(candidate, {
                lineOffset: args.startLine as number | undefined,
                lineLimit: args.endLine ? (args.endLine as number) - ((args.startLine as number) || 1) + 1 : undefined,
              });
              usedPath = candidate;
              break;
            } catch { /* try next */ }
          }
          if (!data) return { success: false, output: '', error: `File not found: ${rawPath}` };
          const lines = data.content.split('\n');
          const start = (args.startLine as number) || 1;
          const numbered = lines.map((l, i) => `${String(start + i).padStart(6)}|${l}`).join('\n');
          return { success: true, output: numbered, metadata: { lines: data.lineCount, size: data.content.length, resolvedPath: usedPath } };
        }

        case 'edit_file': {
          const filePath = resolveToWorkspace(args.path as string, workspacePath);
          const oldStr = args.old_string as string;
          const newStr = args.new_string as string;
          if (!filePath || oldStr === undefined || newStr === undefined) {
            return { success: false, output: '', error: 'path, old_string, and new_string are required' };
          }
          const result = await api.tools.editFile(filePath, oldStr, newStr);
          onFileEdited?.(args.path as string, result.newContent);
          return { success: true, output: `File edited: ${args.path}`, metadata: { newContent: result.newContent } };
        }

        case 'create_file': {
          const filePath = resolveToWorkspace(args.path as string, workspacePath);
          const content = (args.content as string) || '';
          if (!filePath) return { success: false, output: '', error: 'path is required' };
          await api.tools.createFile(filePath, content);
          onFileCreated?.(args.path as string, content);
          return { success: true, output: `File created: ${args.path}`, metadata: { size: content.length } };
        }

        case 'delete_file': {
          const filePath = resolveToWorkspace(args.path as string, workspacePath);
          if (!filePath) return { success: false, output: '', error: 'path is required' };
          await api.tools.deleteFile(filePath);
          return { success: true, output: `File deleted: ${args.path}` };
        }

        case 'list_directory': {
          const rawDir = (args.path as string) || '';
          const dirPath = rawDir ? resolveToWorkspace(rawDir, workspacePath) : (workspacePath || '.');
          const data = await api.tools.listDir(dirPath);
          const listing = data.entries.map(e => `${e.type === 'directory' ? 'dir ' : 'file'} ${e.name}${e.type === 'directory' ? '/' : ''}`).join('\n');
          return { success: true, output: listing || '(empty directory)', metadata: { count: data.entries.length } };
        }

        case 'grep_search': {
          const query = args.query as string;
          if (!query) return { success: false, output: '', error: 'query is required' };
          const rawDir = (args.path as string) || '';
          const dirPath = rawDir ? resolveToWorkspace(rawDir, workspacePath) : (workspacePath || '.');
          const data = await api.tools.grep(query, dirPath, { include: args.glob as string, maxResults: 200 });
          const output = data.matches.map(m => `${m.file}:${m.line}:${m.content}`).join('\n');
          return { success: true, output: output || 'No results found', metadata: { matchCount: data.matches.length } };
        }

        case 'glob_search': {
          const pattern = args.pattern as string;
          if (!pattern) return { success: false, output: '', error: 'pattern is required' };
          const rawDir = (args.path as string) || '';
          const dirPath = rawDir ? resolveToWorkspace(rawDir, workspacePath) : (workspacePath || '.');
          const data = await api.tools.glob(pattern, dirPath);
          return { success: true, output: data.files.join('\n') || 'No files matched', metadata: { count: data.files.length } };
        }

        case 'run_command': {
          const command = args.command as string;
          if (!command) return { success: false, output: '', error: 'command is required' };
          const cwd = (args.cwd as string) || workspacePath;
          const data = await api.tools.runCommand(command, cwd);
          const combined = data.stderr ? `${data.stdout}\n${data.stderr}`.trim() : data.stdout;
          onTerminalCommand?.(command, combined, data.exitCode);
          const output = combined.slice(0, 15000) + (data.exitCode !== 0 ? `\n[exit code: ${data.exitCode}]` : '');
          return {
            success: true,
            output: output || '(no output)',
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
          const filePath = resolveToWorkspace(args.path as string, workspacePath);
          if (!filePath) return { success: false, output: '', error: 'path is required' };
          const data = await api.tools.readLints(filePath);
          if (data.diagnostics.length === 0) return { success: true, output: 'No linter errors found.' };
          const output = data.diagnostics.map(d => `${d.file}:${d.line}:${d.column} ${d.severity}: ${d.message} [${d.source}]`).join('\n');
          return { success: true, output, metadata: { count: data.diagnostics.length } };
        }

        case 'semantic_search': {
          const query = args.query as string;
          if (!query) return { success: false, output: '', error: 'query is required' };
          const rawDir = (args.path as string) || '';
          const dirPath = rawDir ? resolveToWorkspace(rawDir, workspacePath) : (workspacePath || '.');
          const data = await api.tools.semanticSearch(query, dirPath);
          if (data.results.length === 0) return { success: true, output: 'No semantic results. Try grep_search for text-based search.' };
          const output = data.results.map(r => `${r.file}:${r.line} (score: ${r.score.toFixed(2)})\n  ${r.content}`).join('\n');
          return { success: true, output };
        }

        default:
          return { success: false, output: '', error: `Unknown tool: ${tool}` };
      }
    } catch (e) {
      return {
        success: false,
        output: '',
        error: e instanceof Error ? e.message : 'Tool execution failed',
      };
    }
  }, [onTerminalCommand, onFileEdited, onFileCreated, workspacePath]);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const reset = useCallback(() => {
    abortRef.current = false;
  }, []);

  return { executeToolCall, abort, reset };
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
