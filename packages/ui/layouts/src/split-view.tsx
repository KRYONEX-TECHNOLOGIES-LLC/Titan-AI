// Split View Component
// packages/ui/layouts/src/split-view.tsx

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { clsx } from 'clsx';

export interface SplitViewProps {
  direction: 'horizontal' | 'vertical';
  children: React.ReactNode[];
  sizes?: number[];
  minSizes?: number[];
  maxSizes?: number[];
  onSizesChange?: (sizes: number[]) => void;
  gutterSize?: number;
  className?: string;
}

export function SplitView({
  direction,
  children,
  sizes: controlledSizes,
  minSizes = [],
  maxSizes = [],
  onSizesChange,
  gutterSize = 4,
  className,
}: SplitViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);
  
  // Initialize sizes
  const defaultSizes = children.map(() => 100 / children.length);
  const [internalSizes, setInternalSizes] = useState(defaultSizes);
  const sizes = controlledSizes || internalSizes;

  const handleResizeStart = useCallback((index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    setResizingIndex(index);
  }, []);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (resizingIndex === null || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const isHorizontal = direction === 'horizontal';
    const totalSize = isHorizontal ? rect.width : rect.height;
    const position = isHorizontal
      ? e.clientX - rect.left
      : e.clientY - rect.top;

    // Calculate cumulative sizes before the gutter
    let cumulativeSize = 0;
    for (let i = 0; i < resizingIndex; i++) {
      cumulativeSize += (sizes[i] / 100) * totalSize + gutterSize;
    }

    // Calculate new size for the panel before the gutter
    const newSize1Px = position - cumulativeSize;
    const newSize2Px = (sizes[resizingIndex] + sizes[resizingIndex + 1]) / 100 * totalSize - newSize1Px;

    // Convert to percentages
    let newSize1 = (newSize1Px / totalSize) * 100;
    let newSize2 = (newSize2Px / totalSize) * 100;

    // Apply constraints
    const min1 = minSizes[resizingIndex] || 10;
    const min2 = minSizes[resizingIndex + 1] || 10;
    const max1 = maxSizes[resizingIndex] || 90;
    const max2 = maxSizes[resizingIndex + 1] || 90;

    newSize1 = Math.max(min1, Math.min(max1, newSize1));
    newSize2 = Math.max(min2, Math.min(max2, newSize2));

    // Update sizes
    const newSizes = [...sizes];
    newSizes[resizingIndex] = newSize1;
    newSizes[resizingIndex + 1] = newSize2;

    if (controlledSizes) {
      onSizesChange?.(newSizes);
    } else {
      setInternalSizes(newSizes);
    }
  }, [resizingIndex, direction, sizes, gutterSize, minSizes, maxSizes, controlledSizes, onSizesChange]);

  const handleResizeEnd = useCallback(() => {
    setResizingIndex(null);
  }, []);

  useEffect(() => {
    if (resizingIndex !== null) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizingIndex, handleResizeMove, handleResizeEnd]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      className={clsx(
        'titan-split-view',
        'flex h-full w-full',
        isHorizontal ? 'flex-row' : 'flex-col',
        resizingIndex !== null && 'select-none',
        className
      )}
    >
      {React.Children.map(children, (child, index) => (
        <React.Fragment key={index}>
          <div
            className="titan-split-pane overflow-hidden"
            style={{
              [isHorizontal ? 'width' : 'height']: `calc(${sizes[index]}% - ${gutterSize * (children.length - 1) / children.length}px)`,
            }}
          >
            {child}
          </div>
          
          {index < children.length - 1 && (
            <div
              className={clsx(
                'titan-split-gutter flex-shrink-0',
                'bg-split-gutter hover:bg-split-gutter-hover transition-colors',
                isHorizontal ? 'cursor-col-resize' : 'cursor-row-resize',
                resizingIndex === index && 'bg-split-gutter-active'
              )}
              style={{
                [isHorizontal ? 'width' : 'height']: gutterSize,
              }}
              onMouseDown={handleResizeStart(index)}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export interface EditorSplitViewProps {
  editors: EditorPane[];
  activeEditorId?: string;
  onEditorSelect?: (id: string) => void;
  onEditorClose?: (id: string) => void;
  onSplit?: (direction: 'horizontal' | 'vertical') => void;
  className?: string;
}

export interface EditorPane {
  id: string;
  tabs: EditorTab[];
  activeTabId?: string;
  content: React.ReactNode;
}

export interface EditorTab {
  id: string;
  title: string;
  isDirty?: boolean;
  icon?: React.ReactNode;
}

export function EditorSplitView({
  editors,
  activeEditorId,
  onEditorSelect,
  onEditorClose,
  onSplit,
  className,
}: EditorSplitViewProps) {
  if (editors.length === 0) {
    return (
      <div
        className={clsx(
          'titan-editor-split-view',
          'flex items-center justify-center h-full',
          'text-editor-placeholder',
          className
        )}
      >
        <div className="text-center">
          <p className="text-lg">No editors open</p>
          <p className="text-sm mt-2 opacity-60">
            Open a file from the explorer or use Ctrl+P to quick open
          </p>
        </div>
      </div>
    );
  }

  if (editors.length === 1) {
    return (
      <div className={clsx('titan-editor-split-view h-full', className)}>
        <EditorPaneComponent
          pane={editors[0]}
          isActive={editors[0].id === activeEditorId}
          onSelect={() => onEditorSelect?.(editors[0].id)}
        />
      </div>
    );
  }

  return (
    <SplitView
      direction="horizontal"
      className={clsx('titan-editor-split-view', className)}
    >
      {editors.map((pane) => (
        <EditorPaneComponent
          key={pane.id}
          pane={pane}
          isActive={pane.id === activeEditorId}
          onSelect={() => onEditorSelect?.(pane.id)}
        />
      ))}
    </SplitView>
  );
}

interface EditorPaneComponentProps {
  pane: EditorPane;
  isActive: boolean;
  onSelect: () => void;
}

function EditorPaneComponent({ pane, isActive, onSelect }: EditorPaneComponentProps) {
  return (
    <div
      className={clsx(
        'titan-editor-pane h-full flex flex-col',
        isActive && 'ring-1 ring-inset ring-editor-pane-active-border'
      )}
      onClick={onSelect}
    >
      {/* Tab bar */}
      <div className="flex items-center h-9 bg-editor-tab-bar-background border-b border-editor-tab-bar-border">
        {pane.tabs.map((tab) => (
          <div
            key={tab.id}
            className={clsx(
              'flex items-center gap-1.5 px-3 h-full border-r border-editor-tab-border',
              'cursor-pointer text-xs',
              tab.id === pane.activeTabId
                ? 'bg-editor-tab-active text-editor-tab-active-foreground'
                : 'bg-editor-tab-inactive text-editor-tab-inactive-foreground hover:bg-editor-tab-hover'
            )}
          >
            {tab.icon && <span className="w-4 h-4">{tab.icon}</span>}
            <span className="truncate max-w-[120px]">{tab.title}</span>
            {tab.isDirty && (
              <span className="w-2 h-2 rounded-full bg-editor-tab-dirty" />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {pane.content}
      </div>
    </div>
  );
}
