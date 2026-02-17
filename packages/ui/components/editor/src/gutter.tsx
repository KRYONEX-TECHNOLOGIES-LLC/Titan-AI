// Gutter Component
// packages/ui/components/editor/src/gutter.tsx

import React from 'react';
import { clsx } from 'clsx';

export interface GutterProps {
  children: React.ReactNode;
  className?: string;
  width?: number;
}

export function Gutter({ children, className, width = 60 }: GutterProps) {
  return (
    <div
      className={clsx(
        'titan-gutter',
        'flex flex-col flex-shrink-0',
        'bg-gutter-background border-r border-gutter-border',
        'select-none',
        className
      )}
      style={{ width }}
    >
      {children}
    </div>
  );
}

export interface GutterLineProps {
  lineNumber: number;
  isActive?: boolean;
  hasBreakpoint?: boolean;
  hasError?: boolean;
  hasWarning?: boolean;
  isFolded?: boolean;
  canFold?: boolean;
  onFoldToggle?: () => void;
  onBreakpointToggle?: () => void;
  className?: string;
}

export function GutterLine({
  lineNumber,
  isActive,
  hasBreakpoint,
  hasError,
  hasWarning,
  isFolded,
  canFold,
  onFoldToggle,
  onBreakpointToggle,
  className,
}: GutterLineProps) {
  return (
    <div
      className={clsx(
        'titan-gutter-line',
        'flex items-center h-[20px] pr-2 gap-1',
        isActive && 'bg-gutter-active-background',
        className
      )}
    >
      {/* Breakpoint area */}
      <div
        className={clsx(
          'titan-gutter-breakpoint',
          'w-3 h-full flex items-center justify-center cursor-pointer',
        )}
        onClick={onBreakpointToggle}
      >
        {hasBreakpoint && (
          <span className="w-2 h-2 rounded-full bg-breakpoint" />
        )}
      </div>

      {/* Fold indicator */}
      <div
        className={clsx(
          'titan-gutter-fold',
          'w-3 h-full flex items-center justify-center',
          canFold && 'cursor-pointer hover:bg-gutter-fold-hover',
        )}
        onClick={canFold ? onFoldToggle : undefined}
      >
        {canFold && (
          <FoldIcon isFolded={isFolded} />
        )}
      </div>

      {/* Line number */}
      <div
        className={clsx(
          'titan-gutter-line-number',
          'flex-1 text-right text-xs font-mono',
          isActive ? 'text-gutter-active-foreground' : 'text-gutter-foreground',
        )}
      >
        {lineNumber}
      </div>

      {/* Diagnostic indicator */}
      {(hasError || hasWarning) && (
        <div className="titan-gutter-diagnostic w-2">
          {hasError && (
            <span className="block w-2 h-2 rounded-full bg-error" />
          )}
          {hasWarning && !hasError && (
            <span className="block w-2 h-2 rounded-full bg-warning" />
          )}
        </div>
      )}
    </div>
  );
}

interface FoldIconProps {
  isFolded?: boolean;
}

function FoldIcon({ isFolded }: FoldIconProps) {
  return (
    <svg
      className={clsx(
        'w-3 h-3 text-gutter-fold transition-transform',
        isFolded && 'rotate-[-90deg]'
      )}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M4 3L8 6L4 9" />
    </svg>
  );
}

export interface GutterDecoration {
  lineNumber: number;
  type: 'error' | 'warning' | 'info' | 'hint' | 'breakpoint' | 'bookmark' | 'diff-added' | 'diff-removed' | 'diff-modified';
  tooltip?: string;
}

export interface DecoratedGutterProps {
  startLine: number;
  endLine: number;
  activeLine?: number;
  decorations: GutterDecoration[];
  foldableLines?: number[];
  foldedLines?: number[];
  onLineClick?: (line: number) => void;
  onFoldToggle?: (line: number) => void;
  onBreakpointToggle?: (line: number) => void;
  className?: string;
}

export function DecoratedGutter({
  startLine,
  endLine,
  activeLine,
  decorations,
  foldableLines = [],
  foldedLines = [],
  onLineClick,
  onFoldToggle,
  onBreakpointToggle,
  className,
}: DecoratedGutterProps) {
  const decorationMap = new Map<number, GutterDecoration[]>();
  decorations.forEach((d) => {
    const existing = decorationMap.get(d.lineNumber) || [];
    existing.push(d);
    decorationMap.set(d.lineNumber, existing);
  });

  const lines: GutterLineProps[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const lineDecos = decorationMap.get(i) || [];
    lines.push({
      lineNumber: i,
      isActive: i === activeLine,
      hasBreakpoint: lineDecos.some((d) => d.type === 'breakpoint'),
      hasError: lineDecos.some((d) => d.type === 'error'),
      hasWarning: lineDecos.some((d) => d.type === 'warning'),
      canFold: foldableLines.includes(i),
      isFolded: foldedLines.includes(i),
      onFoldToggle: () => onFoldToggle?.(i),
      onBreakpointToggle: () => onBreakpointToggle?.(i),
    });
  }

  return (
    <Gutter className={className}>
      {lines.map((line) => (
        <GutterLine
          key={line.lineNumber}
          {...line}
        />
      ))}
    </Gutter>
  );
}
