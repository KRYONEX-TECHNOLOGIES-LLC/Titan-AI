// Terminal Panel Component
// packages/ui/components/terminal/src/terminal-panel.tsx

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { clsx } from 'clsx';

export interface TerminalPanelProps {
  terminals: TerminalInstance[];
  activeTerminalId?: string;
  onTerminalSelect?: (id: string) => void;
  onTerminalCreate?: () => void;
  onTerminalClose?: (id: string) => void;
  onTerminalRename?: (id: string, name: string) => void;
  onResize?: (height: number) => void;
  className?: string;
}

export interface TerminalInstance {
  id: string;
  name: string;
  type: 'bash' | 'zsh' | 'powershell' | 'cmd' | 'custom';
  status: 'running' | 'exited' | 'error';
  exitCode?: number;
  cwd?: string;
}

export function TerminalPanel({
  terminals,
  activeTerminalId,
  onTerminalSelect,
  onTerminalCreate,
  onTerminalClose,
  onTerminalRename,
  onResize,
  className,
}: TerminalPanelProps) {
  const [height, setHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !panelRef.current) return;

    const panelRect = panelRef.current.parentElement?.getBoundingClientRect();
    if (!panelRect) return;

    const newHeight = panelRect.bottom - e.clientY;
    const clampedHeight = Math.max(100, Math.min(600, newHeight));
    setHeight(clampedHeight);
    onResize?.(clampedHeight);
  }, [isResizing, onResize]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  const activeTerminal = terminals.find(t => t.id === activeTerminalId);

  return (
    <div
      ref={panelRef}
      className={clsx(
        'titan-terminal-panel',
        'flex flex-col',
        'bg-terminal-background text-terminal-foreground',
        'border-t border-terminal-border',
        className
      )}
      style={{ height }}
    >
      {/* Resize handle */}
      <div
        className={clsx(
          'titan-terminal-resize-handle',
          'h-1 cursor-ns-resize',
          'hover:bg-terminal-resize-hover transition-colors',
          isResizing && 'bg-terminal-resize-active'
        )}
        onMouseDown={handleResizeStart}
      />

      {/* Header */}
      <div className="titan-terminal-header flex items-center h-9 px-2 border-b border-terminal-border">
        <TerminalTabs
          terminals={terminals}
          activeTerminalId={activeTerminalId}
          onSelect={onTerminalSelect}
          onClose={onTerminalClose}
          onRename={onTerminalRename}
        />
        <div className="flex-1" />
        <TerminalActions
          onNew={onTerminalCreate}
          onSplit={() => {}}
          onKill={() => activeTerminalId && onTerminalClose?.(activeTerminalId)}
        />
      </div>

      {/* Terminal content area */}
      <div className="titan-terminal-content flex-1 overflow-hidden">
        {activeTerminal ? (
          <TerminalView terminal={activeTerminal} />
        ) : (
          <div className="flex items-center justify-center h-full text-terminal-placeholder">
            No terminal open. Click + to create one.
          </div>
        )}
      </div>

      {/* Status bar */}
      {activeTerminal && (
        <div className="titan-terminal-status flex items-center gap-2 px-2 py-1 text-xs border-t border-terminal-border bg-terminal-status-background">
          <span className={clsx(
            'w-2 h-2 rounded-full',
            activeTerminal.status === 'running' && 'bg-terminal-status-running',
            activeTerminal.status === 'exited' && 'bg-terminal-status-exited',
            activeTerminal.status === 'error' && 'bg-terminal-status-error'
          )} />
          <span>{activeTerminal.type}</span>
          {activeTerminal.cwd && (
            <>
              <span className="text-terminal-status-separator">•</span>
              <span className="truncate">{activeTerminal.cwd}</span>
            </>
          )}
          {activeTerminal.exitCode !== undefined && (
            <>
              <span className="text-terminal-status-separator">•</span>
              <span className={activeTerminal.exitCode === 0 ? 'text-terminal-exit-success' : 'text-terminal-exit-error'}>
                Exit: {activeTerminal.exitCode}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface TerminalTabsProps {
  terminals: TerminalInstance[];
  activeTerminalId?: string;
  onSelect?: (id: string) => void;
  onClose?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
}

function TerminalTabs({
  terminals,
  activeTerminalId,
  onSelect,
  onClose,
  onRename,
}: TerminalTabsProps) {
  return (
    <div className="titan-terminal-tabs flex items-center gap-1 overflow-x-auto">
      {terminals.map((terminal) => (
        <TerminalTab
          key={terminal.id}
          terminal={terminal}
          isActive={terminal.id === activeTerminalId}
          onSelect={() => onSelect?.(terminal.id)}
          onClose={() => onClose?.(terminal.id)}
          onRename={(name) => onRename?.(terminal.id, name)}
        />
      ))}
    </div>
  );
}

interface TerminalTabProps {
  terminal: TerminalInstance;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onRename: (name: string) => void;
}

function TerminalTab({
  terminal,
  isActive,
  onSelect,
  onClose,
  onRename,
}: TerminalTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(terminal.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = () => {
    setIsEditing(true);
    setEditName(terminal.name);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (editName.trim() && editName !== terminal.name) {
      onRename(editName.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditName(terminal.name);
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const typeIcons: Record<TerminalInstance['type'], string> = {
    bash: '$',
    zsh: '%',
    powershell: 'PS',
    cmd: '>',
    custom: '#',
  };

  return (
    <div
      className={clsx(
        'titan-terminal-tab',
        'group flex items-center gap-1.5 px-2 py-1 rounded-t',
        'cursor-pointer select-none',
        isActive
          ? 'bg-terminal-tab-active text-terminal-tab-active-foreground'
          : 'bg-terminal-tab-inactive text-terminal-tab-inactive-foreground hover:bg-terminal-tab-hover'
      )}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
    >
      <span className="text-xs font-mono text-terminal-tab-icon">
        {typeIcons[terminal.type]}
      </span>

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-20 px-1 text-xs bg-transparent border border-terminal-tab-input-border rounded outline-none"
        />
      ) : (
        <span className="text-xs truncate max-w-[100px]">{terminal.name}</span>
      )}

      <button
        className={clsx(
          'w-4 h-4 flex items-center justify-center rounded',
          'opacity-0 group-hover:opacity-100 hover:bg-terminal-tab-close-hover',
          isActive && 'opacity-100'
        )}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 2L10 10M10 2L2 10" />
        </svg>
      </button>
    </div>
  );
}

interface TerminalActionsProps {
  onNew?: () => void;
  onSplit?: () => void;
  onKill?: () => void;
}

function TerminalActions({ onNew, onSplit, onKill }: TerminalActionsProps) {
  return (
    <div className="titan-terminal-actions flex items-center gap-1">
      <button
        className="p-1 rounded hover:bg-terminal-action-hover"
        onClick={onNew}
        title="New Terminal"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 3v10M3 8h10" />
        </svg>
      </button>
      <button
        className="p-1 rounded hover:bg-terminal-action-hover"
        onClick={onSplit}
        title="Split Terminal"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="2" width="12" height="12" rx="1" />
          <path d="M8 2v12" />
        </svg>
      </button>
      <button
        className="p-1 rounded hover:bg-terminal-action-hover"
        onClick={onKill}
        title="Kill Terminal"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4zm3.5 6.5v3a.5.5 0 0 1-1 0v-3a.5.5 0 0 1 1 0zm3 0v3a.5.5 0 0 1-1 0v-3a.5.5 0 0 1 1 0z" />
        </svg>
      </button>
    </div>
  );
}

interface TerminalViewProps {
  terminal: TerminalInstance;
}

function TerminalView({ terminal }: TerminalViewProps) {
  return (
    <div className="titan-terminal-view h-full w-full p-2 overflow-auto font-mono text-sm">
      {/* Terminal content would be rendered here by xterm.js or similar */}
      <div className="text-terminal-prompt">
        {terminal.cwd && <span>{terminal.cwd}</span>}
        <span className="ml-1">$</span>
        <span className="ml-2 animate-pulse">▌</span>
      </div>
    </div>
  );
}
