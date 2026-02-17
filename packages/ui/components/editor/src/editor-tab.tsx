// Editor Tab Component
// packages/ui/components/editor/src/editor-tab.tsx

import React from 'react';
import { clsx } from 'clsx';

export interface EditorTabProps {
  title: string;
  path?: string;
  language?: string;
  icon?: React.ReactNode;
  isDirty?: boolean;
  isActive?: boolean;
  isPreview?: boolean;
  isPinned?: boolean;
  onSelect?: () => void;
  onClose?: () => void;
  className?: string;
}

export function EditorTab({
  title,
  path,
  language,
  icon,
  isDirty,
  isActive,
  isPreview,
  isPinned,
  onSelect,
  onClose,
  className,
}: EditorTabProps) {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose?.();
  };

  return (
    <div
      className={clsx(
        'titan-editor-tab',
        'group inline-flex items-center gap-2 px-3 py-1.5',
        'text-sm cursor-pointer select-none',
        'border-r border-editor-tab-border',
        isActive
          ? 'bg-editor-tab-active text-editor-tab-active-foreground border-b-2 border-b-accent'
          : 'bg-editor-tab-inactive text-editor-tab-inactive-foreground hover:bg-editor-tab-hover',
        isPreview && 'italic',
        className
      )}
      onClick={onSelect}
      title={path || title}
      role="tab"
      aria-selected={isActive}
    >
      {icon && (
        <span className="titan-editor-tab-icon w-4 h-4 flex-shrink-0">
          {icon}
        </span>
      )}

      <span className={clsx('titan-editor-tab-label truncate max-w-[160px]')}>
        {title}
      </span>

      {language && (
        <span className="titan-editor-tab-language text-xs opacity-60">
          [{language}]
        </span>
      )}

      {!isPinned && (
        <button
          className={clsx(
            'titan-editor-tab-close',
            'ml-1 w-4 h-4 rounded flex items-center justify-center',
            'opacity-0 group-hover:opacity-100 hover:bg-editor-tab-close-hover',
            isActive && 'opacity-100'
          )}
          onClick={handleClose}
          aria-label={`Close ${title}`}
        >
          {isDirty ? (
            <DirtyIndicator />
          ) : (
            <CloseIcon />
          )}
        </button>
      )}

      {isPinned && (
        <span className="titan-editor-tab-pinned ml-1 w-3 h-3 opacity-60">
          <PinIcon />
        </span>
      )}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      className="w-3 h-3"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M2 2L10 10M10 2L2 10" />
    </svg>
  );
}

function DirtyIndicator() {
  return (
    <span className="w-2 h-2 rounded-full bg-editor-tab-dirty" />
  );
}

function PinIcon() {
  return (
    <svg
      className="w-3 h-3"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z" />
    </svg>
  );
}

export interface EditorTabGroupProps {
  children: React.ReactNode;
  className?: string;
}

export function EditorTabGroup({ children, className }: EditorTabGroupProps) {
  return (
    <div
      className={clsx(
        'titan-editor-tab-group',
        'flex items-center overflow-x-auto',
        'bg-editor-tab-group-background',
        'scrollbar-thin scrollbar-thumb-scrollbar-thumb',
        className
      )}
      role="tablist"
    >
      {children}
    </div>
  );
}
