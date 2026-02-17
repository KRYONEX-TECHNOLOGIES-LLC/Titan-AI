// Main Layout Component
// packages/ui/layouts/src/main-layout.tsx

import React from 'react';
import { clsx } from 'clsx';

export interface MainLayoutProps {
  activityBar?: React.ReactNode;
  sidebar?: React.ReactNode;
  editor?: React.ReactNode;
  panel?: React.ReactNode;
  statusBar?: React.ReactNode;
  titleBar?: React.ReactNode;
  sidebarPosition?: 'left' | 'right';
  panelPosition?: 'bottom' | 'right';
  sidebarWidth?: number;
  panelHeight?: number;
  isSidebarVisible?: boolean;
  isPanelVisible?: boolean;
  className?: string;
}

export function MainLayout({
  activityBar,
  sidebar,
  editor,
  panel,
  statusBar,
  titleBar,
  sidebarPosition = 'left',
  panelPosition = 'bottom',
  sidebarWidth = 300,
  panelHeight = 300,
  isSidebarVisible = true,
  isPanelVisible = true,
  className,
}: MainLayoutProps) {
  return (
    <div
      className={clsx(
        'titan-main-layout',
        'flex flex-col h-screen w-screen overflow-hidden',
        'bg-layout-background text-layout-foreground',
        className
      )}
    >
      {/* Title bar */}
      {titleBar && (
        <div className="titan-title-bar flex-shrink-0">
          {titleBar}
        </div>
      )}

      {/* Main content */}
      <div className="titan-main-content flex flex-1 overflow-hidden">
        {/* Activity bar - left side always */}
        {activityBar && (
          <div className="titan-activity-bar flex-shrink-0">
            {activityBar}
          </div>
        )}

        {/* Sidebar - left position */}
        {sidebarPosition === 'left' && isSidebarVisible && sidebar && (
          <div
            className="titan-sidebar flex-shrink-0 overflow-hidden"
            style={{ width: sidebarWidth }}
          >
            {sidebar}
          </div>
        )}

        {/* Editor and panel area */}
        <div className="titan-editor-area flex-1 flex overflow-hidden">
          {panelPosition === 'bottom' ? (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Editor */}
              <div className="titan-editor flex-1 overflow-hidden">
                {editor}
              </div>

              {/* Panel - bottom position */}
              {isPanelVisible && panel && (
                <div
                  className="titan-panel flex-shrink-0 overflow-hidden"
                  style={{ height: panelHeight }}
                >
                  {panel}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 overflow-hidden">
              {/* Editor */}
              <div className="titan-editor flex-1 overflow-hidden">
                {editor}
              </div>

              {/* Panel - right position */}
              {isPanelVisible && panel && (
                <div
                  className="titan-panel flex-shrink-0 overflow-hidden"
                  style={{ width: sidebarWidth }}
                >
                  {panel}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar - right position */}
        {sidebarPosition === 'right' && isSidebarVisible && sidebar && (
          <div
            className="titan-sidebar flex-shrink-0 overflow-hidden"
            style={{ width: sidebarWidth }}
          >
            {sidebar}
          </div>
        )}
      </div>

      {/* Status bar */}
      {statusBar && (
        <div className="titan-status-bar flex-shrink-0">
          {statusBar}
        </div>
      )}
    </div>
  );
}

export interface EditorAreaLayoutProps {
  tabs?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  editor: React.ReactNode;
  minimap?: React.ReactNode;
  className?: string;
}

export function EditorAreaLayout({
  tabs,
  breadcrumbs,
  editor,
  minimap,
  className,
}: EditorAreaLayoutProps) {
  return (
    <div
      className={clsx(
        'titan-editor-area-layout',
        'flex flex-col h-full',
        className
      )}
    >
      {/* Tabs */}
      {tabs && (
        <div className="titan-editor-tabs flex-shrink-0">
          {tabs}
        </div>
      )}

      {/* Breadcrumbs */}
      {breadcrumbs && (
        <div className="titan-editor-breadcrumbs flex-shrink-0">
          {breadcrumbs}
        </div>
      )}

      {/* Editor content with minimap */}
      <div className="titan-editor-content flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {editor}
        </div>
        {minimap && (
          <div className="titan-editor-minimap flex-shrink-0">
            {minimap}
          </div>
        )}
      </div>
    </div>
  );
}

export interface TitleBarLayoutProps {
  icon?: React.ReactNode;
  title?: string;
  menuBar?: React.ReactNode;
  centerContent?: React.ReactNode;
  windowControls?: React.ReactNode;
  isDraggable?: boolean;
  className?: string;
}

export function TitleBarLayout({
  icon,
  title,
  menuBar,
  centerContent,
  windowControls,
  isDraggable = true,
  className,
}: TitleBarLayoutProps) {
  return (
    <div
      className={clsx(
        'titan-title-bar-layout',
        'flex items-center h-8 px-2',
        'bg-title-bar-background text-title-bar-foreground',
        'border-b border-title-bar-border',
        isDraggable && 'app-region-drag',
        className
      )}
    >
      {/* Icon and menu */}
      <div className="flex items-center gap-2 app-region-no-drag">
        {icon && (
          <span className="w-4 h-4">{icon}</span>
        )}
        {menuBar}
      </div>

      {/* Center content / title */}
      <div className="flex-1 flex items-center justify-center">
        {centerContent || (
          <span className="text-sm truncate">{title}</span>
        )}
      </div>

      {/* Window controls */}
      {windowControls && (
        <div className="flex items-center app-region-no-drag">
          {windowControls}
        </div>
      )}
    </div>
  );
}

export interface WindowControlsProps {
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  isMaximized?: boolean;
  platform?: 'windows' | 'macos' | 'linux';
  className?: string;
}

export function WindowControls({
  onMinimize,
  onMaximize,
  onClose,
  isMaximized,
  platform = 'windows',
  className,
}: WindowControlsProps) {
  if (platform === 'macos') {
    return (
      <div
        className={clsx(
          'titan-window-controls flex items-center gap-2',
          className
        )}
      >
        <button
          className="w-3 h-3 rounded-full bg-window-close hover:bg-window-close-hover"
          onClick={onClose}
          title="Close"
        />
        <button
          className="w-3 h-3 rounded-full bg-window-minimize hover:bg-window-minimize-hover"
          onClick={onMinimize}
          title="Minimize"
        />
        <button
          className="w-3 h-3 rounded-full bg-window-maximize hover:bg-window-maximize-hover"
          onClick={onMaximize}
          title={isMaximized ? 'Restore' : 'Maximize'}
        />
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'titan-window-controls flex items-center',
        className
      )}
    >
      <button
        className="w-12 h-8 flex items-center justify-center hover:bg-window-control-hover"
        onClick={onMinimize}
        title="Minimize"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 8h8v1H4z" />
        </svg>
      </button>
      <button
        className="w-12 h-8 flex items-center justify-center hover:bg-window-control-hover"
        onClick={onMaximize}
        title={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <rect x="4" y="4" width="8" height="8" rx="0.5" />
            <path d="M6 4V2.5A.5.5 0 0 1 6.5 2H13.5a.5.5 0 0 1 .5.5V9.5a.5.5 0 0 1-.5.5H12" />
          </svg>
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="10" height="10" rx="0.5" />
          </svg>
        )}
      </button>
      <button
        className="w-12 h-8 flex items-center justify-center hover:bg-window-close-hover"
        onClick={onClose}
        title="Close"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06L8 9.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L9.06 8l3.72-3.72a.75.75 0 0 0-1.06-1.06L8 6.94 4.28 3.22z" />
        </svg>
      </button>
    </div>
  );
}
