// Sidebar Container Component
// packages/ui/components/sidebar/src/sidebar-container.tsx

import React, { useState, useRef, useCallback } from 'react';
import { clsx } from 'clsx';

export interface SidebarContainerProps {
  children: React.ReactNode;
  position: 'left' | 'right';
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onWidthChange?: (width: number) => void;
  className?: string;
}

export function SidebarContainer({
  children,
  position,
  defaultWidth = 300,
  minWidth = 200,
  maxWidth = 600,
  isCollapsed = false,
  onCollapsedChange,
  onWidthChange,
  className,
}: SidebarContainerProps) {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    let newWidth: number;

    if (position === 'left') {
      newWidth = e.clientX - rect.left;
    } else {
      newWidth = rect.right - e.clientX;
    }

    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    setWidth(newWidth);
    onWidthChange?.(newWidth);
  }, [isResizing, position, minWidth, maxWidth, onWidthChange]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  React.useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  return (
    <div
      ref={containerRef}
      className={clsx(
        'titan-sidebar',
        'relative flex flex-col h-full',
        'bg-sidebar-background text-sidebar-foreground',
        'border-sidebar-border',
        position === 'left' ? 'border-r' : 'border-l',
        isCollapsed && 'w-0 overflow-hidden',
        className
      )}
      style={{ width: isCollapsed ? 0 : width }}
    >
      {!isCollapsed && (
        <>
          {children}
          
          {/* Resize handle */}
          <div
            className={clsx(
              'titan-sidebar-resize-handle',
              'absolute top-0 bottom-0 w-1 cursor-col-resize',
              'hover:bg-sidebar-resize-hover transition-colors',
              isResizing && 'bg-sidebar-resize-active',
              position === 'left' ? 'right-0' : 'left-0'
            )}
            onMouseDown={handleResizeStart}
          />
        </>
      )}
    </div>
  );
}

export interface SidebarHeaderProps {
  title: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function SidebarHeader({ title, icon, actions, className }: SidebarHeaderProps) {
  return (
    <div
      className={clsx(
        'titan-sidebar-header',
        'flex items-center justify-between px-4 py-2 h-10',
        'border-b border-sidebar-header-border',
        'bg-sidebar-header-background',
        className
      )}
    >
      <div className="flex items-center gap-2">
        {icon && (
          <span className="titan-sidebar-header-icon w-4 h-4">
            {icon}
          </span>
        )}
        <span className="titan-sidebar-header-title text-xs font-semibold uppercase tracking-wider">
          {title}
        </span>
      </div>
      {actions && (
        <div className="titan-sidebar-header-actions flex items-center gap-1">
          {actions}
        </div>
      )}
    </div>
  );
}

export interface SidebarSectionProps {
  title?: string;
  isCollapsible?: boolean;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function SidebarSection({
  title,
  isCollapsible = true,
  defaultCollapsed = false,
  children,
  actions,
  className,
}: SidebarSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <div
      className={clsx(
        'titan-sidebar-section',
        'flex flex-col',
        className
      )}
    >
      {title && (
        <button
          className={clsx(
            'titan-sidebar-section-header',
            'flex items-center justify-between px-2 py-1.5',
            'text-xs font-medium uppercase tracking-wider',
            'hover:bg-sidebar-section-hover transition-colors',
            isCollapsible && 'cursor-pointer'
          )}
          onClick={() => isCollapsible && setIsCollapsed(!isCollapsed)}
        >
          <div className="flex items-center gap-1">
            {isCollapsible && (
              <svg
                className={clsx(
                  'w-3 h-3 transition-transform',
                  isCollapsed && '-rotate-90'
                )}
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M3 4.5L6 7.5L9 4.5" />
              </svg>
            )}
            <span>{title}</span>
          </div>
          {actions && !isCollapsed && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {actions}
            </div>
          )}
        </button>
      )}
      {!isCollapsed && (
        <div className="titan-sidebar-section-content">
          {children}
        </div>
      )}
    </div>
  );
}

export interface ActivityBarProps {
  items: ActivityBarItem[];
  activeItemId?: string;
  onItemSelect?: (id: string) => void;
  position?: 'left' | 'right';
  className?: string;
}

export interface ActivityBarItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  badge?: number | string;
}

export function ActivityBar({
  items,
  activeItemId,
  onItemSelect,
  position = 'left',
  className,
}: ActivityBarProps) {
  return (
    <div
      className={clsx(
        'titan-activity-bar',
        'flex flex-col items-center py-2 w-12',
        'bg-activity-bar-background',
        position === 'left' ? 'border-r' : 'border-l',
        'border-activity-bar-border',
        className
      )}
    >
      {items.map((item) => (
        <button
          key={item.id}
          className={clsx(
            'titan-activity-bar-item',
            'relative w-12 h-12 flex items-center justify-center',
            'text-activity-bar-foreground hover:text-activity-bar-foreground-hover',
            'transition-colors',
            activeItemId === item.id && [
              'text-activity-bar-foreground-active',
              position === 'left' ? 'border-l-2' : 'border-r-2',
              'border-activity-bar-active-border',
            ]
          )}
          onClick={() => onItemSelect?.(item.id)}
          title={item.label}
        >
          <span className="w-6 h-6">{item.icon}</span>
          {item.badge !== undefined && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold rounded-full bg-activity-bar-badge text-activity-bar-badge-foreground">
              {item.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
