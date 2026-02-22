'use client';

import { useCallback, useRef, useState } from 'react';
import { isElectron, electronAPI } from '@/lib/electron';
import { getCapabilities } from '@/lib/agent-capabilities';
import { attemptEditWithRetry } from '@/lib/autonomy/edit-retry';
import { CommandOutputParser } from '@/lib/autonomy/command-output-parser';
import { runDebugLoop } from '@/lib/autonomy/debug-loop';
import { GitOrchestrator } from '@/lib/autonomy/git-orchestrator';
import { MemoryManager } from '@/lib/autonomy/memory-manager';

const sharedParser = new CommandOutputParser();
const sharedGitOrchestrator = new GitOrchestrator();
const sharedMemoryManager = new MemoryManager();

export interface ToolResultMeta {
  runtime: 'web' | 'desktop';
  workspacePath?: string;
  toolName: string;
  durationMs: number;
  pathResolved?: string;
  changed?: boolean;
  bytesWritten?: number;
  beforeHash?: string;
  afterHash?: string;
  retryAttempts?: number;
  corrected?: boolean;
  [key: string]: unknown;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  meta?: ToolResultMeta;
  metadata?: Record<string, unknown>;
}

interface UseAgentToolsOptions {
  onTerminalCommand?: (command: string, output: string, exitCode: number) => void;
  onFileEdited?: (path: string, newContent: string, pathResolved?: string) => void;
  onFileCreated?: (path: string, content: string, absolutePath: string) => void;
  onFileDeleted?: (path: string) => void;
  onToolEvent?: (tool: string, event: { type: string; payload: Record<string, unknown> }) => void;
  workspacePath?: string;
}

function normalizeToolError(e: unknown, context: { runtime: string; workspaceOpen: boolean; toolName: string }): string {
  const msg = e instanceof Error ? e.message : String(e ?? 'Unknown error');
  return `[${context.runtime} workspaceOpen=${context.workspaceOpen} tool=${context.toolName}] ${msg}`;
}

function resolveToWorkspace(filePath: string, wsPath?: string): string {
  if (!wsPath) return filePath;
  if (filePath.startsWith('/') || /^[A-Z]:\\/i.test(filePath)) return filePath;
  const base = wsPath.replace(/[\\/]$/, '');
  const rel = filePath.replace(/^\.[\\/]/, '');
  return base + '/' + rel;
}

export function useAgentTools({ onTerminalCommand, onFileEdited, onFileCreated, onFileDeleted, onToolEvent, workspacePath }: UseAgentToolsOptions = {}) {
  const abortRef = useRef(false);
  const lastResultRef = useRef<ToolResult | null>(null);
  const [lastResult, setLastResultState] = useState<ToolResult | null>(null);

  const setLast = useCallback((r: ToolResult) => {
    lastResultRef.current = r;
    setLastResultState(r);
    return r;
  }, []);

  const executeToolCall = useCallback(async (
    tool: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> => {
    const start = Date.now();
    const caps = getCapabilities(workspacePath);
    const baseMeta: ToolResultMeta = {
      runtime: caps.runtime,
      workspacePath: caps.workspacePath,
      toolName: tool,
      durationMs: 0,
    };

    if (abortRef.current) {
      return setLast({ success: false, output: '', error: 'Aborted', meta: { ...baseMeta, durationMs: Date.now() - start } });
    }

    try {
      if (!electronAPI) {
        return setLast({
          success: false,
          output: '',
          error: 'Electron API not available. This app requires the desktop version.',
          meta: { ...baseMeta, durationMs: Date.now() - start },
        });
      }

      const PATH_BASED_TOOLS = new Set([
        'read_file', 'edit_file', 'create_file', 'delete_file',
        'list_directory', 'grep_search', 'glob_search', 'semantic_search',
      ]);
      const WORKSPACE_REQUIRED_TOOLS = new Set([
        ...PATH_BASED_TOOLS,
        'auto_debug', 'git_branch', 'git_commit', 'git_sync', 'memory_read', 'memory_write',
      ]);
      if (WORKSPACE_REQUIRED_TOOLS.has(tool) && !workspacePath) {
        return setLast({
          success: false,
          output: '',
          error: 'ERROR: No folder is open. Go to File > Open Folder and open your project directory before asking me to read, edit, or search files.',
          meta: { ...baseMeta, durationMs: Date.now() - start },
        });
      }

      const api = electronAPI;

      switch (tool) {
        case 'read_file': {
          const rawPath = args.path as string;
          if (!rawPath) return setLast({ success: false, output: '', error: 'path is required', meta: { ...baseMeta, durationMs: Date.now() - start } });
          const COMMON_EXTS = ['.py', '.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml', '.md', '.txt', '.toml', '.cfg', '.env'];
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
          if (!data) return setLast({ success: false, output: '', error: `File not found: ${rawPath}`, meta: { ...baseMeta, durationMs: Date.now() - start } });
          const lines = data.content.split('\n');
          const lineStart = (args.startLine as number) || 1;
          const numbered = lines.map((l, i) => `${String(lineStart + i).padStart(6)}|${l}`).join('\n');
          return setLast({
            success: true,
            output: numbered,
            metadata: { lines: data.lineCount, size: data.content.length, resolvedPath: usedPath },
            meta: { ...baseMeta, durationMs: Date.now() - start, pathResolved: usedPath },
          });
        }

        case 'edit_file': {
          const filePath = resolveToWorkspace(args.path as string, workspacePath);
          const oldStr = args.old_string as string;
          const newStr = args.new_string as string;
          if (!filePath || oldStr === undefined || newStr === undefined) {
            return setLast({ success: false, output: '', error: 'path, old_string, and new_string are required', meta: { ...baseMeta, durationMs: Date.now() - start } });
          }
          const retried = await attemptEditWithRetry(api as any, filePath, oldStr, newStr, 3);
          if (!retried.success || !retried.result) {
            return setLast({
              success: false,
              output: '',
              error: retried.error || 'edit_file failed after retries',
              meta: {
                ...baseMeta,
                durationMs: Date.now() - start,
                retryAttempts: retried.attempts,
                corrected: retried.correctedFromOriginal,
              },
              metadata: {
                retryLog: retried.attemptLog,
              },
            });
          }
          const result = retried.result;
          const pathResolved = result.pathResolved ?? filePath;
          onFileEdited?.(args.path as string, result.newContent, pathResolved);
          return setLast({
            success: true,
            output: `File edited: ${args.path}`,
            metadata: {
              newContent: result.newContent,
              pathResolved,
              changed: result.changed,
              bytesWritten: result.bytesWritten,
              beforeHash: result.beforeHash,
              afterHash: result.afterHash,
              retryAttempts: retried.attempts,
              corrected: retried.correctedFromOriginal,
              retryLog: retried.attemptLog,
            },
            meta: {
              ...baseMeta,
              durationMs: Date.now() - start,
              pathResolved,
              changed: result.changed,
              bytesWritten: result.bytesWritten,
              beforeHash: result.beforeHash,
              afterHash: result.afterHash,
              retryAttempts: retried.attempts,
              corrected: retried.correctedFromOriginal,
            },
          });
        }

        case 'create_file': {
          const filePath = resolveToWorkspace(args.path as string, workspacePath);
          const content = (args.content as string) || '';
          if (!filePath) return setLast({ success: false, output: '', error: 'path is required', meta: { ...baseMeta, durationMs: Date.now() - start } });
          await api.tools.createFile(filePath, content);
          onFileCreated?.(args.path as string, content, filePath);
          return setLast({ success: true, output: `File created: ${args.path}`, metadata: { size: content.length }, meta: { ...baseMeta, durationMs: Date.now() - start, pathResolved: filePath } });
        }

        case 'delete_file': {
          const filePath = resolveToWorkspace(args.path as string, workspacePath);
          if (!filePath) return setLast({ success: false, output: '', error: 'path is required', meta: { ...baseMeta, durationMs: Date.now() - start } });
          await api.tools.deleteFile(filePath);
          onFileDeleted?.(args.path as string);
          return setLast({ success: true, output: `File deleted: ${args.path}`, meta: { ...baseMeta, durationMs: Date.now() - start, pathResolved: filePath } });
        }

        case 'list_directory': {
          const rawDir = (args.path as string) || '';
          const dirPath = rawDir ? resolveToWorkspace(rawDir, workspacePath) : (workspacePath || '.');
          const data = await api.tools.listDir(dirPath);
          const listing = data.entries.map(e => `${e.type === 'directory' ? 'dir ' : 'file'} ${e.name}${e.type === 'directory' ? '/' : ''}`).join('\n');
          return setLast({ success: true, output: listing || '(empty directory)', metadata: { count: data.entries.length }, meta: { ...baseMeta, durationMs: Date.now() - start } });
        }

        case 'grep_search': {
          const query = args.query as string;
          if (!query) return setLast({ success: false, output: '', error: 'query is required', meta: { ...baseMeta, durationMs: Date.now() - start } });
          const rawDir = (args.path as string) || '';
          const dirPath = rawDir ? resolveToWorkspace(rawDir, workspacePath) : (workspacePath || '.');
          const data = await api.tools.grep(query, dirPath, { include: args.glob as string, maxResults: 200 });
          const output = data.matches.map(m => `${m.file}:${m.line}:${m.content}`).join('\n');
          return setLast({ success: true, output: output || 'No results found', metadata: { matchCount: data.matches.length }, meta: { ...baseMeta, durationMs: Date.now() - start } });
        }

        case 'glob_search': {
          const pattern = args.pattern as string;
          if (!pattern) return setLast({ success: false, output: '', error: 'pattern is required', meta: { ...baseMeta, durationMs: Date.now() - start } });
          const rawDir = (args.path as string) || '';
          const dirPath = rawDir ? resolveToWorkspace(rawDir, workspacePath) : (workspacePath || '.');
          const data = await api.tools.glob(pattern, dirPath);
          return setLast({ success: true, output: data.files.join('\n') || 'No files matched', metadata: { count: data.files.length }, meta: { ...baseMeta, durationMs: Date.now() - start } });
        }

        case 'run_command': {
          const command = args.command as string;
          if (!command) return setLast({ success: false, output: '', error: 'command is required', meta: { ...baseMeta, durationMs: Date.now() - start } });
          const cwd = (args.cwd as string) || workspacePath;
          const data = await api.tools.runCommand(command, cwd);
          const combined = data.stderr ? `${data.stdout}\n${data.stderr}`.trim() : data.stdout;
          const parsedOutput = sharedParser.parse(data.stdout || '', data.stderr || '', data.exitCode);
          const primaryError = sharedParser.getPrimaryError(parsedOutput);
          onTerminalCommand?.(command, combined, data.exitCode);
          const output = combined.slice(0, 15000) + (data.exitCode !== 0 ? `\n[exit code: ${data.exitCode}]` : '');
          return setLast({
            // Intentionally keep success=true so the chat loop can inspect output and parsed metadata
            // rather than short-circuiting on run_command non-zero exits.
            success: true,
            output: output || '(no output)',
            metadata: {
              exitCode: data.exitCode,
              parsedOutput: data.exitCode !== 0 || data.stderr ? parsedOutput : undefined,
              primaryError: data.exitCode !== 0 ? primaryError : undefined,
              affectedFiles: data.exitCode !== 0 ? sharedParser.getAffectedFiles(parsedOutput) : [],
            },
            meta: { ...baseMeta, durationMs: Date.now() - start },
          });
        }

        case 'auto_debug': {
          const command = args.command as string;
          if (!command) {
            return setLast({ success: false, output: '', error: 'command is required', meta: { ...baseMeta, durationMs: Date.now() - start } });
          }
          const modelInvoker = async (prompt: string): Promise<string> => {
            const res = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: prompt, model: 'gpt-5.3', stream: false }),
            });
            if (!res.ok) throw new Error(`model invoke failed (${res.status})`);
            const data = await res.json();
            return String(data.content || '');
          };

          const loopResult = await runDebugLoop(
            command,
            executeToolCall,
            modelInvoker,
            (event) => onToolEvent?.('auto_debug', event),
          );
          return setLast({
            success: loopResult.resolved,
            output: loopResult.resolved
              ? `Debug loop resolved in ${loopResult.attempts} attempt(s).`
              : `Debug loop escalated after ${loopResult.attempts} attempt(s).`,
            metadata: { loopResult },
            meta: { ...baseMeta, durationMs: Date.now() - start },
          });
        }

        case 'git_branch': {
          const branchName = String(args.branch || args.new_branch_name || '');
          const baseBranch = String(args.base || args.base_branch || 'main');
          if (!branchName) {
            return setLast({ success: false, output: '', error: 'branch is required', meta: { ...baseMeta, durationMs: Date.now() - start } });
          }
          const res = await sharedGitOrchestrator.branchWorkflow(branchName, baseBranch, executeToolCall);
          return setLast({ success: res.success, output: res.output, metadata: res as unknown as Record<string, unknown>, meta: { ...baseMeta, durationMs: Date.now() - start } });
        }

        case 'git_commit': {
          const message = String(args.message || args.description || 'update project');
          const type = String(args.type || 'feat');
          const scope = args.scope ? String(args.scope) : undefined;
          const res = await sharedGitOrchestrator.commitWorkflow(message, executeToolCall, type, scope);
          return setLast({ success: res.success, output: res.output, metadata: res as unknown as Record<string, unknown>, meta: { ...baseMeta, durationMs: Date.now() - start } });
        }

        case 'git_sync': {
          const branch = String(args.branch || 'main');
          const res = await sharedGitOrchestrator.syncWorkflow(branch, executeToolCall);
          return setLast({ success: res.success, output: res.output, metadata: res as unknown as Record<string, unknown>, meta: { ...baseMeta, durationMs: Date.now() - start } });
        }

        case 'memory_read': {
          const state = await sharedMemoryManager.readMemory(executeToolCall);
          return setLast({
            success: true,
            output: state.raw || 'No memory entries found.',
            metadata: {
              entries: state.entries,
              memoryPath: state.memoryPath,
              count: state.entries.length,
            },
            meta: { ...baseMeta, durationMs: Date.now() - start, pathResolved: state.memoryPath },
          });
        }

        case 'memory_write': {
          const decision = String(args.decision || '');
          const rationale = String(args.rationale || '');
          const taskId = String(args.taskId || args.task_id || 'AUTO');
          const status = String(args.status || 'ACTIVE');
          const date = String(args.date || new Date().toISOString().slice(0, 10));
          if (!decision || !rationale) {
            return setLast({ success: false, output: '', error: 'decision and rationale are required', meta: { ...baseMeta, durationMs: Date.now() - start } });
          }
          const write = await sharedMemoryManager.appendDecision({
            decision,
            rationale,
            date,
            taskId,
            status,
            references: args.references ? String(args.references) : undefined,
          }, {
            executeToolCall,
            directEditApi: api as any,
          });
          return setLast({
            success: write.success,
            output: write.success ? `Memory updated (${write.id}) in ${write.path}` : `Memory update failed: ${write.error || 'unknown error'}`,
            metadata: write as unknown as Record<string, unknown>,
            meta: { ...baseMeta, durationMs: Date.now() - start, pathResolved: write.path },
          });
        }

        case 'web_search': {
          const query = args.query as string;
          if (!query) return setLast({ success: false, output: '', error: 'query is required', meta: { ...baseMeta, durationMs: Date.now() - start } });
          const results = await api.web.search(query);
          const output = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n');
          return setLast({ success: true, output: output || 'No results found', metadata: { count: results.length }, meta: { ...baseMeta, durationMs: Date.now() - start } });
        }

        case 'web_fetch': {
          const url = args.url as string;
          if (!url) return setLast({ success: false, output: '', error: 'url is required', meta: { ...baseMeta, durationMs: Date.now() - start } });
          const data = await api.web.fetch(url);
          return setLast({ success: true, output: data.content.slice(0, 30000), metadata: { title: data.title }, meta: { ...baseMeta, durationMs: Date.now() - start } });
        }

        case 'read_lints': {
          const filePath = resolveToWorkspace(args.path as string, workspacePath);
          if (!filePath) return setLast({ success: false, output: '', error: 'path is required', meta: { ...baseMeta, durationMs: Date.now() - start } });
          const data = await api.tools.readLints(filePath);
          if (data.diagnostics.length === 0) return setLast({ success: true, output: 'No linter errors found.', meta: { ...baseMeta, durationMs: Date.now() - start } });
          const output = data.diagnostics.map(d => `${d.file}:${d.line}:${d.column} ${d.severity}: ${d.message} [${d.source}]`).join('\n');
          return setLast({ success: true, output, metadata: { count: data.diagnostics.length }, meta: { ...baseMeta, durationMs: Date.now() - start } });
        }

        case 'semantic_search': {
          const query = args.query as string;
          if (!query) return setLast({ success: false, output: '', error: 'query is required', meta: { ...baseMeta, durationMs: Date.now() - start } });
          const rawDir = (args.path as string) || '';
          const dirPath = rawDir ? resolveToWorkspace(rawDir, workspacePath) : (workspacePath || '.');
          const data = await api.tools.semanticSearch(query, dirPath);
          if (data.results.length === 0) return setLast({ success: true, output: 'No semantic results. Try grep_search for text-based search.', meta: { ...baseMeta, durationMs: Date.now() - start } });
          const output = data.results.map(r => `${r.file}:${r.line} (score: ${r.score.toFixed(2)})\n  ${r.content}`).join('\n');
          return setLast({ success: true, output, meta: { ...baseMeta, durationMs: Date.now() - start } });
        }

        case 'generate_image': {
          const prompt = args.prompt as string;
          if (!prompt) return setLast({ success: false, output: '', error: 'prompt is required', meta: { ...baseMeta, durationMs: Date.now() - start } });
          const res = await fetch('/api/image/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt,
              size: args.size || '1024x1024',
              quality: args.quality || 'standard',
              style: args.style || 'vivid',
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Failed' }));
            return setLast({ success: false, output: '', error: (err as { error: string }).error || 'Image generation failed', meta: { ...baseMeta, durationMs: Date.now() - start } });
          }
          const imgData = await res.json() as { b64_json: string; revised_prompt: string; size: string };
          return setLast({
            success: true,
            output: `Image generated successfully. Revised prompt: ${imgData.revised_prompt}`,
            metadata: {
              b64_json: imgData.b64_json,
              revised_prompt: imgData.revised_prompt,
              size: imgData.size || args.size || '1024x1024',
              prompt,
            },
            meta: { ...baseMeta, durationMs: Date.now() - start },
          });
        }

        default:
          return setLast({ success: false, output: '', error: `Unknown tool: ${tool}`, meta: { ...baseMeta, durationMs: Date.now() - start } });
      }
    } catch (e) {
      const errMsg = normalizeToolError(e, { runtime: caps.runtime, workspaceOpen: caps.workspaceOpen, toolName: tool });
      return setLast({
        success: false,
        output: '',
        error: errMsg,
        meta: { ...baseMeta, durationMs: Date.now() - start },
      });
    }
  }, [onTerminalCommand, onFileEdited, onFileCreated, onFileDeleted, onToolEvent, workspacePath]);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const reset = useCallback(() => {
    abortRef.current = false;
  }, []);

  const getLastResult = useCallback((): ToolResult | null => lastResultRef.current, []);

  return { executeToolCall, abort, reset, getLastResult, lastResult };
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
    case 'auto_debug':
      return `Auto debug: ${(args.command as string || '').slice(0, 60)}`;
    case 'git_branch':
      return `Git branch ${args.branch || args.new_branch_name}`;
    case 'git_commit':
      return `Git commit ${args.type || 'feat'}: ${(args.message as string || '').slice(0, 40)}`;
    case 'git_sync':
      return `Git sync ${args.branch || 'main'}`;
    case 'memory_read':
      return 'Read architectural memory';
    case 'memory_write':
      return `Write memory: ${(args.decision as string || '').slice(0, 40)}`;
    case 'web_search':
      return `Web search "${args.query}"`;
    case 'web_fetch':
      return `Fetch ${args.url}`;
    case 'read_lints':
      return `Lint check ${args.path}`;
    case 'semantic_search':
      return `Semantic search "${args.query}"`;
    case 'generate_image':
      return `Generate image: "${(args.prompt as string || '').slice(0, 60)}"`;
    default:
      return tool;
  }
}
