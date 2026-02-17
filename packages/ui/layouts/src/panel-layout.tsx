// Panel Layout Component
// packages/ui/layouts/src/panel-layout.tsx

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { clsx } from 'clsx';

export interface PanelLayoutProps {
  header?: React.ReactNode;
  content: React.ReactNode;
  footer?: React.ReactNode;
  isCollapsible?: boolean;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  minHeight?: number;
  maxHeight?: number;
  defaultHeight?: number;
  position?: 'top' | 'bottom';
  className?: string;
}

export function PanelLayout({
  header,
  content,
  footer,
  isCollapsible = true,
  isCollapsed = false,
  onCollapsedChange,
  minHeight = 100,
  maxHeight = 500,
  defaultHeight = 200,
  position = 'bottom',
  className,
}: PanelLayoutProps) {
  const [height, setHeight] = useState(defaultHeight);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !panelRef.current) return;

    const rect = panelRef.current.getBoundingClientRect();
    let newHeight: number;

    if (position === 'bottom') {
      newHeight = rect.bottom - e.clientY;
    } else {
      newHeight = e.clientY - rect.top;
    }

    newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
    setHeight(newHeight);
  }, [isResizing, position, minHeight, maxHeight]);

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

  const resizeHandle = (
    <div
      className={clsx(
        'titan-panel-resize-handle',
        'h-1 cursor-ns-resize',
        'hover:bg-panel-resize-hover transition-colors',
        isResizing && 'bg-panel-resize-active'
      )}
      onMouseDown={handleResizeStart}
    />
  );

  return (
    <div
      ref={panelRef}
      className={clsx(
        'titan-panel-layout',
        'flex flex-col',
        'bg-panel-background border-panel-border',
        position === 'bottom' ? 'border-t' : 'border-b',
        isCollapsed && 'h-auto',
        className
      )}
      style={{ height: isCollapsed ? 'auto' : height }}
    >
      {/* Resize handle - top for bottom panel */}
      {position === 'bottom' && !isCollapsed && resizeHandle}

      {/* Header */}
      {header && (
        <div
          className={clsx(
            'titan-panel-header',
            'flex items-center justify-between h-8 px-2',
            'border-b border-panel-header-border bg-panel-header-background',
            isCollapsible && 'cursor-pointer'
          )}
          onClick={isCollapsible ? () => onCollapsedChange?.(!isCollapsed) : undefined}
        >
          {header}
          {isCollapsible && (
            <button className="p-1 rounded hover:bg-panel-header-button-hover">
              <svg
                className={clsx(
                  'w-3 h-3 transition-transform',
                  isCollapsed && (position === 'bottom' ? 'rotate-180' : '-rotate-180')
                )}
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M3 4.5L6 7.5L9 4.5" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {!isCollapsed && (
        <div className="titan-panel-content flex-1 overflow-auto">
          {content}
        </div>
      )}

      {/* Footer */}
      {!isCollapsed && footer && (
        <div className="titan-panel-footer flex-shrink-0 border-t border-panel-footer-border">
          {footer}
        </div>
      )}

      {/* Resize handle - bottom for top panel */}
      {position === 'top' && !isCollapsed && resizeHandle}
    </div>
  );
}

export interface TabbedPanelLayoutProps {
  tabs: PanelTab[];
  activeTabId?: string;
  onTabSelect?: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  actions?: React.ReactNode;
  isCollapsible?: boolean;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
}

export interface PanelTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number | string;
  content: React.ReactNode;
  isClosable?: boolean;
}

export function TabbedPanelLayout({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  actions,
  isCollapsible = true,
  isCollapsed = false,
  onCollapsedChange,
  className,
}: TabbedPanelLayoutProps) {
  const activeTab = tabs.find(t => t.id === activeTabId);

  const header = (
    <>
      <div className="flex items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1 text-xs rounded-t',
              'transition-colors',
              tab.id === activeTabId
                ? 'bg-panel-tab-active text-panel-tab-active-foreground'
                : 'text-panel-tab-foreground hover:bg-panel-tab-hover'
            )}
            onClick={() => onTabSelect?.(tab.id)}
          >
            {tab.icon && <span className="w-4 h-4">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className="px-1 text-[10px] rounded-full bg-panel-tab-badge">
                {tab.badge}
              </span>
            )}
            {tab.isClosable && (
              <button
                className="ml-1 p-0.5 rounded hover:bg-panel-tab-close-hover"
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose?.(tab.id);
                }}
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 3L9 9M9 3L3 9" />
                </svg>
              </button>
            )}
          </button>
        ))}
      </div>
      {actions && (
        <div className="flex items-center gap-1">
          {actions}
        </div>
      )}
    </>
  );

  return (
    <PanelLayout
      header={header}
      content={activeTab?.content || null}
      isCollapsible={isCollapsible}
      isCollapsed={isCollapsed}
      onCollapsedChange={onCollapsedChange}
      className={className}
    />
  );
}

export interface AccordionPanelProps {
  sections: AccordionSection[];
  allowMultiple?: boolean;
  defaultExpandedIds?: string[];
  className?: string;
}

export interface AccordionSection {
  id: string;
  title: string;
  icon?: React.ReactNode;
  badge?: number | string;
  content: React.ReactNode;
  isDisabled?: boolean;
}

export function AccordionPanel({
  sections,
  allowMultiple = false,
  defaultExpandedIds = [],
  className,
}: AccordionPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(defaultExpandedIds)
  );

  const toggleSection = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!allowMultiple) {
          next.clear();
        }
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div
      className={clsx(
        'titan-accordion-panel',
        'flex flex-col divide-y divide-accordion-border',
        className
      )}
    >
      {sections.map((section) => (
        <div key={section.id} className="titan-accordion-section">
          <button
            className={clsx(
              'w-full flex items-center gap-2 px-3 py-2 text-left',
              'hover:bg-accordion-header-hover transition-colors',
              section.isDisabled && 'opacity-50 cursor-not-allowed'
            )}
            onClick={() => !section.isDisabled && toggleSection(section.id)}
            disabled={section.isDisabled}
          >
            <svg
              className={clsx(
                'w-3 h-3 transition-transform',
                expandedIds.has(section.id) && 'rotate-90'
              )}
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M4 2L8 6L4 10" />
            </svg>
            {section.icon && (
              <span className="w-4 h-4">{section.icon}</span>
            )}
            <span className="flex-1 text-sm font-medium">{section.title}</span>
            {section.badge !== undefined && (
              <span className="px-1.5 text-xs rounded-full bg-accordion-badge">
                {section.badge}
              </span>
            )}
          </button>
          {expandedIds.has(section.id) && (
            <div className="titan-accordion-content px-3 py-2 bg-accordion-content-background">
              {section.content}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
