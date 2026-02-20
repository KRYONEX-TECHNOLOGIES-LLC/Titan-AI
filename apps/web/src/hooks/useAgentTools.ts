'use client';

import { useCallback, useRef } from 'react';
import type { ToolCallBlock, CodeDiffBlock } from '@/types/ide';

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
}

export function useAgentTools({ onTerminalCommand, onFileEdited, onFileCreated }: UseAgentToolsOptions = {}) {
  const abortRef = useRef(false);

  const executeToolCall = useCallback(async (
    tool: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> => {
    if (abortRef.current) {
      return { success: false, output: '', error: 'Aborted' };
    }

    try {
      if (tool === 'run_command') {
        const res = await fetch('/api/terminal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: args.command,
            cwd: args.cwd || undefined,
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

      const res = await fetch('/api/agent/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, args }),
      });
      const data: ToolResult = await res.json();

      if (tool === 'edit_file' && data.success) {
        onFileEdited?.(args.path as string, args.new_string as string);
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
  }, [onTerminalCommand, onFileEdited, onFileCreated]);

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
    case 'list_directory':
      return `List ${args.path || '.'}`;
    case 'grep_search':
      return `Search "${args.query}"${args.path ? ` in ${args.path}` : ''}`;
    case 'run_command':
      return `$ ${(args.command as string || '').slice(0, 80)}`;
    default:
      return tool;
  }
}
