// AI Status Component
// packages/ui/components/status-bar/src/ai-status.tsx

import React from 'react';
import { clsx } from 'clsx';

export interface AIStatusProps {
  status: 'idle' | 'thinking' | 'generating' | 'error' | 'offline';
  model?: string;
  tokensUsed?: number;
  tokensLimit?: number;
  latency?: number;
  onClick?: () => void;
  className?: string;
}

export function AIStatus({
  status,
  model,
  tokensUsed,
  tokensLimit,
  latency,
  onClick,
  className,
}: AIStatusProps) {
  const statusConfig = {
    idle: {
      icon: <IdleIcon />,
      label: 'Ready',
      color: 'text-ai-status-idle',
    },
    thinking: {
      icon: <ThinkingIcon />,
      label: 'Thinking',
      color: 'text-ai-status-thinking',
    },
    generating: {
      icon: <GeneratingIcon />,
      label: 'Generating',
      color: 'text-ai-status-generating',
    },
    error: {
      icon: <ErrorIcon />,
      label: 'Error',
      color: 'text-ai-status-error',
    },
    offline: {
      icon: <OfflineIcon />,
      label: 'Offline',
      color: 'text-ai-status-offline',
    },
  };

  const config = statusConfig[status];

  return (
    <button
      className={clsx(
        'titan-ai-status',
        'flex items-center gap-1.5 px-2 py-0.5 rounded',
        'hover:bg-status-bar-hover transition-colors',
        'cursor-pointer',
        className
      )}
      onClick={onClick}
      title={`Titan AI: ${config.label}`}
    >
      {/* Status indicator */}
      <span className={clsx('w-4 h-4', config.color)}>
        {config.icon}
      </span>

      {/* Model name */}
      {model && (
        <span className="text-status-bar-foreground truncate max-w-[100px]">
          {model}
        </span>
      )}

      {/* Token usage */}
      {tokensUsed !== undefined && tokensLimit !== undefined && (
        <span className={clsx(
          'text-[10px] px-1 rounded',
          tokensUsed / tokensLimit > 0.9
            ? 'bg-ai-tokens-critical text-ai-tokens-critical-foreground'
            : tokensUsed / tokensLimit > 0.7
            ? 'bg-ai-tokens-warning text-ai-tokens-warning-foreground'
            : 'bg-ai-tokens-normal text-ai-tokens-normal-foreground'
        )}>
          {formatTokens(tokensUsed)}/{formatTokens(tokensLimit)}
        </span>
      )}

      {/* Latency */}
      {latency !== undefined && status !== 'idle' && status !== 'offline' && (
        <span className="text-status-bar-secondary text-[10px]">
          {latency}ms
        </span>
      )}
    </button>
  );
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return String(tokens);
}

export interface AIStatusPanelProps {
  status: AIStatusProps['status'];
  model: string;
  tokensUsed: number;
  tokensLimit: number;
  requestsToday?: number;
  costToday?: number;
  avgLatency?: number;
  errorRate?: number;
  onChangeModel?: () => void;
  onViewUsage?: () => void;
  className?: string;
}

export function AIStatusPanel({
  status,
  model,
  tokensUsed,
  tokensLimit,
  requestsToday,
  costToday,
  avgLatency,
  errorRate,
  onChangeModel,
  onViewUsage,
  className,
}: AIStatusPanelProps) {
  return (
    <div
      className={clsx(
        'titan-ai-status-panel',
        'w-64 p-3 rounded-lg shadow-lg',
        'bg-status-panel-background border border-status-panel-border',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Titan AI</h3>
        <StatusBadge status={status} />
      </div>

      {/* Model */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-status-panel-label">Model</span>
        <button
          className="text-xs text-status-panel-link hover:underline"
          onClick={onChangeModel}
        >
          {model} →
        </button>
      </div>

      {/* Token usage bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-status-panel-label">Tokens</span>
          <span className="text-xs">
            {formatTokens(tokensUsed)} / {formatTokens(tokensLimit)}
          </span>
        </div>
        <div className="h-1.5 bg-status-panel-progress-track rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full transition-all',
              tokensUsed / tokensLimit > 0.9
                ? 'bg-ai-tokens-critical'
                : tokensUsed / tokensLimit > 0.7
                ? 'bg-ai-tokens-warning'
                : 'bg-ai-tokens-normal'
            )}
            style={{ width: `${Math.min(100, (tokensUsed / tokensLimit) * 100)}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {requestsToday !== undefined && (
          <div className="text-center p-1.5 rounded bg-status-panel-stat">
            <div className="text-sm font-medium">{requestsToday}</div>
            <div className="text-[10px] text-status-panel-label">Requests Today</div>
          </div>
        )}
        {costToday !== undefined && (
          <div className="text-center p-1.5 rounded bg-status-panel-stat">
            <div className="text-sm font-medium">${costToday.toFixed(2)}</div>
            <div className="text-[10px] text-status-panel-label">Cost Today</div>
          </div>
        )}
        {avgLatency !== undefined && (
          <div className="text-center p-1.5 rounded bg-status-panel-stat">
            <div className="text-sm font-medium">{avgLatency}ms</div>
            <div className="text-[10px] text-status-panel-label">Avg Latency</div>
          </div>
        )}
        {errorRate !== undefined && (
          <div className="text-center p-1.5 rounded bg-status-panel-stat">
            <div className="text-sm font-medium">{(errorRate * 100).toFixed(1)}%</div>
            <div className="text-[10px] text-status-panel-label">Error Rate</div>
          </div>
        )}
      </div>

      {/* Actions */}
      <button
        className="w-full px-3 py-1.5 text-xs rounded bg-status-panel-button hover:bg-status-panel-button-hover"
        onClick={onViewUsage}
      >
        View Detailed Usage
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: AIStatusProps['status'] }) {
  const statusConfig = {
    idle: { label: 'Ready', class: 'bg-ai-badge-idle' },
    thinking: { label: 'Thinking', class: 'bg-ai-badge-thinking animate-pulse' },
    generating: { label: 'Generating', class: 'bg-ai-badge-generating animate-pulse' },
    error: { label: 'Error', class: 'bg-ai-badge-error' },
    offline: { label: 'Offline', class: 'bg-ai-badge-offline' },
  };

  const config = statusConfig[status];

  return (
    <span className={clsx('px-2 py-0.5 text-[10px] rounded-full text-white', config.class)}>
      {config.label}
    </span>
  );
}

// Icons
function IdleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11z" />
      <path d="M8 4a.5.5 0 0 1 .5.5v3.793l2.354 2.353a.5.5 0 0 1-.708.708l-2.5-2.5A.5.5 0 0 1 7.5 8.5v-4A.5.5 0 0 1 8 4z" />
    </svg>
  );
}

function ThinkingIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="animate-spin">
      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 0 1 5.39 6.55.75.75 0 1 0 1.47.3A7 7 0 1 0 1.5 8a.75.75 0 0 0 1.5 0A5.5 5.5 0 0 1 8 2.5z" />
    </svg>
  );
}

function GeneratingIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0z" />
      <path d="M6.5 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm-6.354 4.854a.5.5 0 0 1 .708-.708c.94.94 2.353 1.354 3.646 1.354s2.707-.414 3.646-1.354a.5.5 0 0 1 .708.708c-1.06 1.06-2.647 1.646-4.354 1.646s-3.293-.586-4.354-1.646z" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM7.5 4.5v4a.5.5 0 0 0 1 0v-4a.5.5 0 0 0-1 0zM8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
    </svg>
  );
}

function OfflineIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11z" />
      <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
    </svg>
  );
}
