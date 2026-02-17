// Editor Container Component
// packages/ui/components/editor/src/editor-container.tsx

import React, { useRef, useEffect, useState } from 'react';
import { clsx } from 'clsx';

export interface EditorContainerProps {
  children: React.ReactNode;
  className?: string;
  showMinimap?: boolean;
  showLineNumbers?: boolean;
  showBreadcrumbs?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function EditorContainer({
  children,
  className,
  showMinimap = true,
  showLineNumbers = true,
  showBreadcrumbs = true,
  onFocus,
  onBlur,
}: EditorContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const handleFocusIn = () => {
      setIsFocused(true);
      onFocus?.();
    };

    const handleFocusOut = () => {
      setIsFocused(false);
      onBlur?.();
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('focusin', handleFocusIn);
      container.addEventListener('focusout', handleFocusOut);
    }

    return () => {
      if (container) {
        container.removeEventListener('focusin', handleFocusIn);
        container.removeEventListener('focusout', handleFocusOut);
      }
    };
  }, [onFocus, onBlur]);

  return (
    <div
      ref={containerRef}
      className={clsx(
        'titan-editor-container',
        'relative flex flex-col h-full',
        'bg-editor-background text-editor-foreground',
        'font-mono text-sm',
        isFocused && 'ring-1 ring-focus-border',
        className
      )}
      data-focused={isFocused}
      data-show-minimap={showMinimap}
      data-show-line-numbers={showLineNumbers}
      data-show-breadcrumbs={showBreadcrumbs}
    >
      {children}
    </div>
  );
}

export interface EditorViewportProps {
  children: React.ReactNode;
  className?: string;
}

export function EditorViewport({ children, className }: EditorViewportProps) {
  return (
    <div
      className={clsx(
        'titan-editor-viewport',
        'flex-1 overflow-hidden relative',
        className
      )}
    >
      {children}
    </div>
  );
}

export interface EditorContentProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function EditorContent({ children, className, style }: EditorContentProps) {
  return (
    <div
      className={clsx(
        'titan-editor-content',
        'absolute inset-0 overflow-auto',
        className
      )}
      style={style}
    >
      {children}
    </div>
  );
}

export interface EditorOverlayProps {
  children: React.ReactNode;
  className?: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

export function EditorOverlay({
  children,
  className,
  position = 'center',
}: EditorOverlayProps) {
  const positionClasses = {
    top: 'top-0 left-0 right-0',
    bottom: 'bottom-0 left-0 right-0',
    left: 'top-0 left-0 bottom-0',
    right: 'top-0 right-0 bottom-0',
    center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  };

  return (
    <div
      className={clsx(
        'titan-editor-overlay',
        'absolute z-50',
        positionClasses[position],
        className
      )}
    >
      {children}
    </div>
  );
}
