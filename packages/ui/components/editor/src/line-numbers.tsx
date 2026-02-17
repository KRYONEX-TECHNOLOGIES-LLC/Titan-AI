// Line Numbers Component
// packages/ui/components/editor/src/line-numbers.tsx

import React, { useMemo } from 'react';
import { clsx } from 'clsx';

export interface LineNumbersProps {
  startLine: number;
  endLine: number;
  activeLine?: number;
  lineHeight?: number;
  className?: string;
  onLineClick?: (line: number) => void;
}

export function LineNumbers({
  startLine,
  endLine,
  activeLine,
  lineHeight = 20,
  className,
  onLineClick,
}: LineNumbersProps) {
  const lines = useMemo(() => {
    const result: number[] = [];
    for (let i = startLine; i <= endLine; i++) {
      result.push(i);
    }
    return result;
  }, [startLine, endLine]);

  const maxDigits = String(endLine).length;
  const width = maxDigits * 8 + 16; // 8px per digit + padding

  return (
    <div
      className={clsx(
        'titan-line-numbers',
        'flex flex-col flex-shrink-0',
        'bg-line-numbers-background text-line-numbers-foreground',
        'text-right font-mono text-xs select-none',
        className
      )}
      style={{ width }}
    >
      {lines.map((line) => (
        <LineNumber
          key={line}
          number={line}
          isActive={line === activeLine}
          height={lineHeight}
          onClick={() => onLineClick?.(line)}
        />
      ))}
    </div>
  );
}

interface LineNumberProps {
  number: number;
  isActive?: boolean;
  height: number;
  onClick?: () => void;
}

function LineNumber({ number, isActive, height, onClick }: LineNumberProps) {
  return (
    <div
      className={clsx(
        'titan-line-number',
        'pr-3 cursor-pointer',
        isActive
          ? 'text-line-numbers-active bg-line-numbers-active-background'
          : 'hover:text-line-numbers-hover',
      )}
      style={{ height, lineHeight: `${height}px` }}
      onClick={onClick}
    >
      {number}
    </div>
  );
}

export interface RelativeLineNumbersProps extends Omit<LineNumbersProps, 'startLine' | 'endLine'> {
  totalLines: number;
  currentLine: number;
  visibleStartLine: number;
  visibleEndLine: number;
}

export function RelativeLineNumbers({
  totalLines,
  currentLine,
  visibleStartLine,
  visibleEndLine,
  activeLine,
  lineHeight = 20,
  className,
  onLineClick,
}: RelativeLineNumbersProps) {
  const lines = useMemo(() => {
    const result: { line: number; display: number | string }[] = [];
    for (let i = visibleStartLine; i <= visibleEndLine; i++) {
      if (i === currentLine) {
        result.push({ line: i, display: i });
      } else {
        result.push({ line: i, display: Math.abs(i - currentLine) });
      }
    }
    return result;
  }, [visibleStartLine, visibleEndLine, currentLine]);

  const maxDigits = String(totalLines).length;
  const width = maxDigits * 8 + 16;

  return (
    <div
      className={clsx(
        'titan-relative-line-numbers',
        'flex flex-col flex-shrink-0',
        'bg-line-numbers-background text-line-numbers-foreground',
        'text-right font-mono text-xs select-none',
        className
      )}
      style={{ width }}
    >
      {lines.map(({ line, display }) => (
        <div
          key={line}
          className={clsx(
            'titan-line-number pr-3 cursor-pointer',
            line === currentLine
              ? 'text-line-numbers-active bg-line-numbers-active-background font-bold'
              : 'hover:text-line-numbers-hover text-line-numbers-relative',
          )}
          style={{ height: lineHeight, lineHeight: `${lineHeight}px` }}
          onClick={() => onLineClick?.(line)}
        >
          {display}
        </div>
      ))}
    </div>
  );
}

export interface FoldIndicatorProps {
  startLine: number;
  endLine: number;
  foldedRanges: { start: number; end: number }[];
  lineHeight?: number;
  onFold?: (line: number) => void;
  onUnfold?: (line: number) => void;
  className?: string;
}

export function FoldIndicators({
  startLine,
  endLine,
  foldedRanges,
  lineHeight = 20,
  onFold,
  onUnfold,
  className,
}: FoldIndicatorProps) {
  const foldedStarts = new Set(foldedRanges.map((r) => r.start));

  return (
    <div
      className={clsx(
        'titan-fold-indicators',
        'flex flex-col flex-shrink-0 w-4',
        className
      )}
    >
      {Array.from({ length: endLine - startLine + 1 }, (_, i) => {
        const line = startLine + i;
        const isFolded = foldedStarts.has(line);
        const range = foldedRanges.find((r) => r.start === line);

        return (
          <div
            key={line}
            className={clsx(
              'titan-fold-indicator',
              'flex items-center justify-center cursor-pointer',
              'hover:bg-fold-indicator-hover',
            )}
            style={{ height: lineHeight }}
            onClick={() => {
              if (isFolded) {
                onUnfold?.(line);
              } else if (range) {
                onFold?.(line);
              }
            }}
          >
            {range && (
              <svg
                className={clsx(
                  'w-3 h-3 transition-transform',
                  isFolded && 'rotate-[-90deg]'
                )}
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 3L8 6L4 9" />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}
