// Git Panel Component
// packages/ui/components/sidebar/src/git-panel.tsx

import React, { useState } from 'react';
import { clsx } from 'clsx';

export interface GitPanelProps {
  changes: GitChange[];
  stagedChanges: GitChange[];
  branch?: string;
  remoteBranch?: string;
  ahead?: number;
  behind?: number;
  onStage?: (paths: string[]) => void;
  onUnstage?: (paths: string[]) => void;
  onDiscard?: (paths: string[]) => void;
  onCommit?: (message: string) => void;
  onPush?: () => void;
  onPull?: () => void;
  onRefresh?: () => void;
  className?: string;
}

export interface GitChange {
  path: string;
  fileName: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
  oldPath?: string;
}

export function GitPanel({
  changes,
  stagedChanges,
  branch,
  remoteBranch,
  ahead = 0,
  behind = 0,
  onStage,
  onUnstage,
  onDiscard,
  onCommit,
  onPush,
  onPull,
  onRefresh,
  className,
}: GitPanelProps) {
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const handleCommit = () => {
    if (commitMessage.trim() && stagedChanges.length > 0) {
      onCommit?.(commitMessage);
      setCommitMessage('');
    }
  };

  const handleStageAll = () => {
    onStage?.(changes.map(c => c.path));
  };

  const handleUnstageAll = () => {
    onUnstage?.(stagedChanges.map(c => c.path));
  };

  return (
    <div
      className={clsx(
        'titan-git-panel',
        'flex flex-col h-full',
        className
      )}
    >
      {/* Branch info */}
      <div className="titan-git-branch flex items-center gap-2 px-3 py-2 border-b border-git-border">
        <BranchIcon />
        <span className="text-sm font-medium">{branch || 'No branch'}</span>
        {remoteBranch && (
          <>
            <span className="text-xs text-git-remote opacity-60">→ {remoteBranch}</span>
            {(ahead > 0 || behind > 0) && (
              <span className="text-xs">
                {ahead > 0 && <span className="text-git-ahead">↑{ahead}</span>}
                {behind > 0 && <span className="text-git-behind ml-1">↓{behind}</span>}
              </span>
            )}
          </>
        )}
        <div className="flex-1" />
        <button
          className="p-1 rounded hover:bg-git-action-hover"
          onClick={onRefresh}
          title="Refresh"
        >
          <RefreshIcon />
        </button>
      </div>

      {/* Commit message */}
      <div className="titan-git-commit p-2 border-b border-git-border">
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message"
          className={clsx(
            'w-full px-2 py-1.5 text-sm rounded resize-none',
            'bg-git-input-background text-git-input-foreground',
            'border border-git-input-border',
            'focus:outline-none focus:border-git-input-focus-border',
            'placeholder:text-git-input-placeholder'
          )}
          rows={3}
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            className={clsx(
              'flex-1 px-3 py-1.5 text-sm font-medium rounded',
              'bg-git-commit-button text-git-commit-button-foreground',
              'hover:bg-git-commit-button-hover',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            onClick={handleCommit}
            disabled={!commitMessage.trim() || stagedChanges.length === 0}
          >
            Commit
          </button>
          <button
            className="p-1.5 rounded hover:bg-git-action-hover"
            onClick={onPull}
            title="Pull"
          >
            <PullIcon />
          </button>
          <button
            className="p-1.5 rounded hover:bg-git-action-hover"
            onClick={onPush}
            title="Push"
          >
            <PushIcon />
          </button>
        </div>
      </div>

      {/* Changes */}
      <div className="flex-1 overflow-auto">
        {/* Staged changes */}
        <GitChangeSection
          title="Staged Changes"
          changes={stagedChanges}
          onAction={(paths) => onUnstage?.(paths)}
          actionLabel="Unstage"
          onActionAll={handleUnstageAll}
        />

        {/* Unstaged changes */}
        <GitChangeSection
          title="Changes"
          changes={changes}
          onAction={(paths) => onStage?.(paths)}
          actionLabel="Stage"
          onActionAll={handleStageAll}
          onDiscard={onDiscard}
        />
      </div>
    </div>
  );
}

interface GitChangeSectionProps {
  title: string;
  changes: GitChange[];
  onAction?: (paths: string[]) => void;
  actionLabel: string;
  onActionAll?: () => void;
  onDiscard?: (paths: string[]) => void;
}

function GitChangeSection({
  title,
  changes,
  onAction,
  actionLabel,
  onActionAll,
  onDiscard,
}: GitChangeSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (changes.length === 0) return null;

  return (
    <div className="titan-git-change-section">
      <button
        className={clsx(
          'w-full flex items-center gap-1 px-2 py-1.5',
          'hover:bg-git-section-hover text-left group'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <svg
          className={clsx('w-3 h-3 transition-transform', isExpanded && 'rotate-90')}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M4 2L8 6L4 10" />
        </svg>
        <span className="flex-1 text-xs font-medium uppercase tracking-wider">
          {title}
        </span>
        <span className="text-xs text-git-count">{changes.length}</span>
        {onActionAll && (
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-git-action-hover"
            onClick={(e) => {
              e.stopPropagation();
              onActionAll();
            }}
            title={`${actionLabel} All`}
          >
            {actionLabel === 'Stage' ? <PlusIcon /> : <MinusIcon />}
          </button>
        )}
      </button>

      {isExpanded && (
        <div className="pl-3">
          {changes.map((change) => (
            <GitChangeItem
              key={change.path}
              change={change}
              onAction={() => onAction?.([change.path])}
              actionLabel={actionLabel}
              onDiscard={onDiscard ? () => onDiscard([change.path]) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface GitChangeItemProps {
  change: GitChange;
  onAction?: () => void;
  actionLabel: string;
  onDiscard?: () => void;
}

function GitChangeItem({ change, onAction, actionLabel, onDiscard }: GitChangeItemProps) {
  const statusColors: Record<GitChange['status'], string> = {
    modified: 'text-git-modified',
    added: 'text-git-added',
    deleted: 'text-git-deleted',
    renamed: 'text-git-renamed',
    untracked: 'text-git-untracked',
    conflicted: 'text-git-conflicted',
  };

  const statusLabels: Record<GitChange['status'], string> = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    renamed: 'R',
    untracked: 'U',
    conflicted: '!',
  };

  return (
    <div
      className={clsx(
        'titan-git-change-item',
        'flex items-center gap-1 px-2 py-0.5 group',
        'hover:bg-git-item-hover cursor-pointer'
      )}
    >
      <span className={clsx('w-4 text-center text-xs font-bold', statusColors[change.status])}>
        {statusLabels[change.status]}
      </span>
      <span className="flex-1 truncate text-xs">{change.fileName}</span>
      
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
        {onDiscard && (
          <button
            className="p-0.5 rounded hover:bg-git-action-hover"
            onClick={onDiscard}
            title="Discard Changes"
          >
            <DiscardIcon />
          </button>
        )}
        <button
          className="p-0.5 rounded hover:bg-git-action-hover"
          onClick={onAction}
          title={actionLabel}
        >
          {actionLabel === 'Stage' ? <PlusIcon /> : <MinusIcon />}
        </button>
      </div>
    </div>
  );
}

// Icons
function BranchIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 4.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0zM5.5 2a2.5 2.5 0 1 0 .001 5 2.5 2.5 0 0 0-.001-5zM9 11.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0zm1.5-2.5a2.5 2.5 0 1 0 .001 5 2.5 2.5 0 0 0-.001-5zm-7 2a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5zm1.854-2.646a.5.5 0 0 1 0 .707L4.207 9.707a.5.5 0 0 1-.707-.707l1.146-1.147a.5.5 0 0 1 .707 0zM6 7.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-1a.5.5 0 0 1-.5-.5z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
      <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
    </svg>
  );
}

function PullIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 12.5a.5.5 0 0 1-.5-.5V3.707L5.354 5.854a.5.5 0 1 1-.708-.708l3-3a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 3.707V12a.5.5 0 0 1-.5.5z" />
    </svg>
  );
}

function PushIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3.5a.5.5 0 0 1 .5.5v8.293l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 .708-.708L7.5 12.293V4a.5.5 0 0 1 .5-.5z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 2v8M2 6h8" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 6h8" />
    </svg>
  );
}

function DiscardIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 9L9 3M3 3l6 6" />
    </svg>
  );
}
