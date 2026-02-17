// Terminal Tabs Component
// packages/ui/components/terminal/src/terminal-tabs.tsx

import React, { useState } from 'react';
import { clsx } from 'clsx';

export interface TerminalTabInfo {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  hasActivity: boolean;
  exitCode?: number;
}

export interface TerminalTabsContainerProps {
  tabs: TerminalTabInfo[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onSplitTerminal?: () => void;
  className?: string;
}

export function TerminalTabsContainer({
  tabs,
  onSelect,
  onClose,
  onNew,
  onSplitTerminal,
  className,
}: TerminalTabsContainerProps) {
  const [contextMenuTab, setContextMenuTab] = useState<string | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenuTab(tabId);
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => {
    setContextMenuTab(null);
  };

  return (
    <div
      className={clsx(
        'titan-terminal-tabs-container',
        'flex items-center h-9 bg-terminal-tabs-background',
        className
      )}
    >
      {/* Tab list */}
      <div className="flex-1 flex items-center overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <TerminalTabButton
            key={tab.id}
            tab={tab}
            onSelect={() => onSelect(tab.id)}
            onClose={() => onClose(tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 px-1 border-l border-terminal-tabs-border">
        <button
          className="p-1.5 rounded hover:bg-terminal-tabs-action-hover"
          onClick={onNew}
          title="New Terminal (Ctrl+Shift+`)"
        >
          <PlusIcon />
        </button>
        {onSplitTerminal && (
          <button
            className="p-1.5 rounded hover:bg-terminal-tabs-action-hover"
            onClick={onSplitTerminal}
            title="Split Terminal"
          >
            <SplitIcon />
          </button>
        )}
      </div>

      {/* Context menu */}
      {contextMenuTab && (
        <TerminalTabContextMenu
          tabId={contextMenuTab}
          position={contextMenuPosition}
          onClose={closeContextMenu}
          onRename={() => {
            closeContextMenu();
            // Handle rename
          }}
          onCloseTab={() => {
            onClose(contextMenuTab);
            closeContextMenu();
          }}
          onCloseOthers={() => {
            tabs.forEach(t => {
              if (t.id !== contextMenuTab) onClose(t.id);
            });
            closeContextMenu();
          }}
        />
      )}
    </div>
  );
}

interface TerminalTabButtonProps {
  tab: TerminalTabInfo;
  onSelect: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function TerminalTabButton({
  tab,
  onSelect,
  onClose,
  onContextMenu,
}: TerminalTabButtonProps) {
  const handleMiddleClick = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className={clsx(
        'titan-terminal-tab-button',
        'group relative flex items-center gap-1.5 px-3 h-full min-w-[80px]',
        'border-r border-terminal-tabs-border cursor-pointer',
        tab.isActive
          ? 'bg-terminal-tab-active text-terminal-tab-active-foreground'
          : 'bg-terminal-tab-inactive text-terminal-tab-inactive-foreground hover:bg-terminal-tab-hover'
      )}
      onClick={onSelect}
      onMouseDown={handleMiddleClick}
      onContextMenu={onContextMenu}
    >
      {/* Activity indicator */}
      {tab.hasActivity && !tab.isActive && (
        <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-terminal-tab-activity animate-pulse" />
      )}

      {/* Icon */}
      <TerminalTypeIcon type={tab.type} />

      {/* Name */}
      <span className="text-xs truncate max-w-[100px]">{tab.name}</span>

      {/* Exit code badge */}
      {tab.exitCode !== undefined && (
        <span className={clsx(
          'text-[10px] px-1 rounded',
          tab.exitCode === 0
            ? 'bg-terminal-exit-success-bg text-terminal-exit-success'
            : 'bg-terminal-exit-error-bg text-terminal-exit-error'
        )}>
          {tab.exitCode}
        </span>
      )}

      {/* Close button */}
      <button
        className={clsx(
          'w-4 h-4 flex items-center justify-center rounded ml-auto',
          'opacity-0 group-hover:opacity-100 hover:bg-terminal-tab-close-hover',
          tab.isActive && 'opacity-100'
        )}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

interface TerminalTypeIconProps {
  type: string;
}

function TerminalTypeIcon({ type }: TerminalTypeIconProps) {
  const iconMap: Record<string, React.ReactNode> = {
    bash: <span className="font-mono text-xs">$</span>,
    zsh: <span className="font-mono text-xs">%</span>,
    powershell: <span className="font-mono text-[10px]">PS</span>,
    cmd: <span className="font-mono text-xs">&gt;</span>,
    node: <NodeIcon />,
    python: <PythonIcon />,
  };

  return (
    <span className="w-4 h-4 flex items-center justify-center text-terminal-tab-icon">
      {iconMap[type] || <span className="font-mono text-xs">#</span>}
    </span>
  );
}

interface TerminalTabContextMenuProps {
  tabId: string;
  position: { x: number; y: number };
  onClose: () => void;
  onRename: () => void;
  onCloseTab: () => void;
  onCloseOthers: () => void;
}

function TerminalTabContextMenu({
  tabId,
  position,
  onClose,
  onRename,
  onCloseTab,
  onCloseOthers,
}: TerminalTabContextMenuProps) {
  React.useEffect(() => {
    const handleClickOutside = () => onClose();
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  return (
    <div
      className={clsx(
        'titan-terminal-context-menu',
        'fixed z-50 py-1 min-w-[160px] rounded-md shadow-lg',
        'bg-context-menu-background border border-context-menu-border'
      )}
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <ContextMenuItem onClick={onRename}>
        Rename...
      </ContextMenuItem>
      <ContextMenuDivider />
      <ContextMenuItem onClick={onCloseTab}>
        Close
      </ContextMenuItem>
      <ContextMenuItem onClick={onCloseOthers}>
        Close Others
      </ContextMenuItem>
    </div>
  );
}

function ContextMenuItem({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={clsx(
        'w-full px-3 py-1.5 text-left text-sm',
        disabled
          ? 'text-context-menu-disabled cursor-not-allowed'
          : 'text-context-menu-foreground hover:bg-context-menu-hover'
      )}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function ContextMenuDivider() {
  return <div className="my-1 border-t border-context-menu-border" />;
}

// Icons
function PlusIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function SplitIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <path d="M8 2v12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 2L10 10M10 2L2 10" />
    </svg>
  );
}

function NodeIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1.5a.5.5 0 0 1 .5.289l6 12a.5.5 0 0 1-.447.711H2a.5.5 0 0 1-.447-.711l6-12A.5.5 0 0 1 8 1.5z" />
    </svg>
  );
}

function PythonIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM4.5 5h7a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-5a.5.5 0 0 1 .5-.5z" />
    </svg>
  );
}
