// Terminal Toolbar Component
// packages/ui/components/terminal/src/terminal-toolbar.tsx

import React from 'react';
import { clsx } from 'clsx';

export interface TerminalToolbarProps {
  onClear?: () => void;
  onKill?: () => void;
  onMaximize?: () => void;
  onMinimize?: () => void;
  onToggleLock?: () => void;
  isLocked?: boolean;
  isMaximized?: boolean;
  className?: string;
}

export function TerminalToolbar({
  onClear,
  onKill,
  onMaximize,
  onMinimize,
  onToggleLock,
  isLocked,
  isMaximized,
  className,
}: TerminalToolbarProps) {
  return (
    <div
      className={clsx(
        'titan-terminal-toolbar',
        'flex items-center gap-1 px-2',
        className
      )}
    >
      <ToolbarButton
        icon={<ClearIcon />}
        onClick={onClear}
        title="Clear Terminal"
      />
      <ToolbarButton
        icon={<KillIcon />}
        onClick={onKill}
        title="Kill Terminal Process"
      />
      <ToolbarDivider />
      <ToolbarButton
        icon={isLocked ? <LockIcon /> : <UnlockIcon />}
        onClick={onToggleLock}
        title={isLocked ? "Unlock Scrolling" : "Lock Scrolling"}
        isActive={isLocked}
      />
      <ToolbarDivider />
      <ToolbarButton
        icon={isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        onClick={isMaximized ? onMinimize : onMaximize}
        title={isMaximized ? "Restore Panel" : "Maximize Panel"}
      />
    </div>
  );
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  onClick?: () => void;
  title?: string;
  isActive?: boolean;
  disabled?: boolean;
}

function ToolbarButton({
  icon,
  onClick,
  title,
  isActive,
  disabled,
}: ToolbarButtonProps) {
  return (
    <button
      className={clsx(
        'titan-toolbar-button',
        'p-1.5 rounded',
        'hover:bg-toolbar-button-hover transition-colors',
        isActive && 'bg-toolbar-button-active',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      <span className="w-4 h-4 block">{icon}</span>
    </button>
  );
}

function ToolbarDivider() {
  return (
    <div className="w-px h-4 bg-toolbar-divider mx-1" />
  );
}

// Icons
function ClearIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 3l10 10M13 3L3 13" />
    </svg>
  );
}

function KillIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1a4 4 0 0 0-4 4v3H3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-1V5a4 4 0 0 0-4-4zm3 7H5V5a3 3 0 0 1 6 0v3z" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M11 1a4 4 0 0 0-4 4v3H3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H8V5a3 3 0 0 1 5.905-.75.5.5 0 0 0 .935-.35A4 4 0 0 0 11 1z" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <path d="M6 2v3H2" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="4" width="10" height="10" rx="1" />
      <path d="M4 10H2V4a2 2 0 0 1 2-2h6v2" />
    </svg>
  );
}
