/**
 * Agent tools capability handshake (R1).
 * Explicit capability object for UI, model context, and tool runner.
 */

import { isElectron, electronAPI } from '@/lib/electron';

export type AgentRuntime = 'web' | 'desktop';

export type ToolsDisabledReason =
  | 'WEB_RUNTIME'
  | 'NO_WORKSPACE'
  | 'IPC_UNAVAILABLE'
  | 'PERMISSION_DENIED';

export interface AgentCapabilities {
  runtime: AgentRuntime;
  workspaceOpen: boolean;
  workspacePath?: string;
  toolsEnabled: boolean;
  reasonIfDisabled?: ToolsDisabledReason;
}

/**
 * Compute capabilities from current environment and workspace state.
 * Call from UI, useChat (pre-send), and tool runner.
 */
export function getCapabilities(workspacePath?: string | null): AgentCapabilities {
  const runtime: AgentRuntime = isElectron ? 'desktop' : 'web';
  const hasIpc = Boolean(electronAPI);
  const ws = typeof workspacePath === 'string' ? workspacePath.trim() : '';
  const workspaceOpen = ws.length > 0;

  if (runtime === 'web') {
    return {
      runtime: 'web',
      workspaceOpen: false,
      workspacePath: undefined,
      toolsEnabled: false,
      reasonIfDisabled: 'WEB_RUNTIME',
    };
  }

  if (!hasIpc) {
    return {
      runtime: 'desktop',
      workspaceOpen,
      workspacePath: ws || undefined,
      toolsEnabled: false,
      reasonIfDisabled: 'IPC_UNAVAILABLE',
    };
  }

  if (!workspaceOpen) {
    return {
      runtime: 'desktop',
      workspaceOpen: false,
      workspacePath: undefined,
      toolsEnabled: false,
      reasonIfDisabled: 'NO_WORKSPACE',
    };
  }

  return {
    runtime: 'desktop',
    workspaceOpen: true,
    workspacePath: ws,
    toolsEnabled: true,
  };
}

/** Heuristic: does the user message imply file/terminal operations that need tools? */
export function requiresTools(prompt: string): boolean {
  const t = (prompt || '').toLowerCase();
  const patterns = [
    /\b(edit|create|delete|write|modify|change|add to|remove from)\s+(file|code|script|config|readme|package)/i,
    /\b(edit|create|delete|write)\s+(my\s+)?[\w.-]+\.(py|ts|tsx|js|jsx|json|md|yml|yaml|txt|html|css)\b/i,
    /\b(read|open|show)\s+(file|content of|the file)/i,
    /\brun\s+(command|script|test|build|install|npm|yarn|pnpm|pip)\b/i,
    /\b(install|add)\s+(package|dependency|npm|pip)\b/i,
    /\b(search|find|grep|list)\s+(file|repo|codebase|directory|folder)\b/i,
    /\b(file|folder|directory|workspace|project)\s+(structure|tree|list|explore)\b/i,
    /\bfix\s+(bug|error|line|code)\b/i,
    /\b(refactor|rename|move)\s+(file|code)\b/i,
    /\b(debug|lint|format)\s+(file|code)\b/i,
    /\.(py|ts|tsx|js|jsx|json|md|yaml|yml)\b.*\b(edit|create|change|add)\b/i,
  ];
  return patterns.some((p) => p.test(t));
}
