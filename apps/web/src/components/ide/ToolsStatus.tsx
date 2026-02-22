'use client';

import type { AgentCapabilities } from '@/lib/agent-capabilities';
import type { ToolResult } from '@/hooks/useAgentTools';

export interface ToolsStatusProps {
  capabilities: AgentCapabilities;
  lastResult?: ToolResult | null;
  onOpenFolder?: () => void;
  showTelemetry?: boolean;
}

function reasonMessage(reason: AgentCapabilities['reasonIfDisabled']): string {
  switch (reason) {
    case 'WEB_RUNTIME':
      return 'File editing and terminal tools require Titan Desktop.';
    case 'NO_WORKSPACE':
      return 'No folder open. Open a folder to enable file editing.';
    case 'IPC_UNAVAILABLE':
      return 'Tools unavailable (IPC not connected).';
    case 'PERMISSION_DENIED':
      return 'Permission denied.';
    default:
      return '';
  }
}

export function ToolsStatus({ capabilities, lastResult, onOpenFolder, showTelemetry = false }: ToolsStatusProps) {
  const { runtime, workspaceOpen, toolsEnabled, reasonIfDisabled } = capabilities;

  if (runtime === 'web') {
    return (
      <div className="tools-status tools-status-web" role="status" aria-live="polite">
        <span className="tools-status-badge tools-status-badge-web">Web</span>
        <span className="tools-status-text">
          Web mode: File editing and terminal tools require Titan Desktop.
        </span>
      </div>
    );
  }

  if (!workspaceOpen && reasonIfDisabled === 'NO_WORKSPACE') {
    return (
      <div className="tools-status tools-status-no-workspace" role="status" aria-live="polite">
        <span className="tools-status-badge tools-status-badge-warning">No folder</span>
        <span className="tools-status-text">
          No folder open. Open a folder to enable file editing.
        </span>
        {onOpenFolder && (
          <button
            type="button"
            className="tools-status-cta"
            onClick={onOpenFolder}
          >
            Open folder
          </button>
        )}
      </div>
    );
  }

  if (toolsEnabled) {
    return (
      <div className="tools-status tools-status-ready" role="status">
        {showTelemetry && lastResult ? (
          <div className="tools-status-telemetry">
            <span className="tools-status-badge tools-status-badge-ok">Tools ready</span>
            <span className="tools-status-last">
              Last: {lastResult.meta?.toolName ?? '—'} ({lastResult.meta?.durationMs ?? 0}ms)
              {lastResult.success ? '' : ` — ${lastResult.error ?? 'failed'}`}
            </span>
          </div>
        ) : (
          <span className="tools-status-badge tools-status-badge-ok">Tools ready</span>
        )}
      </div>
    );
  }

  return (
    <div className="tools-status tools-status-disabled" role="status" aria-live="polite">
      <span className="tools-status-badge tools-status-badge-warning">Tools disabled</span>
      <span className="tools-status-text">{reasonMessage(reasonIfDisabled)}</span>
    </div>
  );
}
