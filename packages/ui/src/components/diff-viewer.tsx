import * as React from 'react';
import { cn } from '../lib/utils';

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'header';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffViewerProps extends React.HTMLAttributes<HTMLDivElement> {
  lines: DiffLine[];
  filename?: string;
  mode?: 'unified' | 'split';
}

const DiffViewer = React.forwardRef<HTMLDivElement, DiffViewerProps>(
  ({ className, lines, filename, mode = 'unified', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('rounded-lg border bg-zinc-950 overflow-hidden', className)}
        {...props}
      >
        {/* Header */}
        {filename && (
          <div className="flex items-center px-4 py-2 border-b border-zinc-800 bg-zinc-900">
            <span className="text-xs text-zinc-400 font-mono">{filename}</span>
          </div>
        )}

        {/* Diff content */}
        <div className="overflow-x-auto">
          {mode === 'unified' ? (
            <UnifiedDiff lines={lines} />
          ) : (
            <SplitDiff lines={lines} />
          )}
        </div>
      </div>
    );
  }
);
DiffViewer.displayName = 'DiffViewer';

function UnifiedDiff({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="font-mono text-sm">
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            'flex px-4 py-0.5',
            line.type === 'added' && 'bg-green-500/10',
            line.type === 'removed' && 'bg-red-500/10',
            line.type === 'header' && 'bg-blue-500/10'
          )}
        >
          {/* Line numbers */}
          <div className="flex gap-2 shrink-0 w-20 text-zinc-600 select-none">
            <span className="w-8 text-right">
              {line.oldLineNumber ?? ''}
            </span>
            <span className="w-8 text-right">
              {line.newLineNumber ?? ''}
            </span>
          </div>

          {/* Sign */}
          <span
            className={cn(
              'w-4 shrink-0 text-center select-none',
              line.type === 'added' && 'text-green-500',
              line.type === 'removed' && 'text-red-500'
            )}
          >
            {line.type === 'added' && '+'}
            {line.type === 'removed' && '-'}
            {line.type === 'header' && '@'}
          </span>

          {/* Content */}
          <span
            className={cn(
              'flex-1 pl-2',
              line.type === 'added' && 'text-green-400',
              line.type === 'removed' && 'text-red-400',
              line.type === 'unchanged' && 'text-zinc-300',
              line.type === 'header' && 'text-blue-400'
            )}
          >
            {line.content}
          </span>
        </div>
      ))}
    </div>
  );
}

function SplitDiff({ lines }: { lines: DiffLine[] }) {
  // Group lines into left (old) and right (new) columns
  const leftLines: Array<DiffLine | null> = [];
  const rightLines: Array<DiffLine | null> = [];

  let leftIndex = 0;
  let rightIndex = 0;

  for (const line of lines) {
    if (line.type === 'header') {
      // Sync up the sides
      while (leftIndex < rightIndex) {
        leftLines.push(null);
        leftIndex++;
      }
      while (rightIndex < leftIndex) {
        rightLines.push(null);
        rightIndex++;
      }
      leftLines.push(line);
      rightLines.push(line);
      leftIndex++;
      rightIndex++;
    } else if (line.type === 'removed') {
      leftLines.push(line);
      leftIndex++;
    } else if (line.type === 'added') {
      rightLines.push(line);
      rightIndex++;
    } else {
      // Sync up
      while (leftIndex < rightIndex) {
        leftLines.push(null);
        leftIndex++;
      }
      while (rightIndex < leftIndex) {
        rightLines.push(null);
        rightIndex++;
      }
      leftLines.push(line);
      rightLines.push(line);
      leftIndex++;
      rightIndex++;
    }
  }

  // Final sync
  while (leftIndex < rightIndex) {
    leftLines.push(null);
    leftIndex++;
  }
  while (rightIndex < leftIndex) {
    rightLines.push(null);
    rightIndex++;
  }

  return (
    <div className="flex font-mono text-sm">
      {/* Left side (old) */}
      <div className="flex-1 border-r border-zinc-800">
        {leftLines.map((line, index) => (
          <div
            key={index}
            className={cn(
              'flex px-4 py-0.5',
              line?.type === 'removed' && 'bg-red-500/10',
              line?.type === 'header' && 'bg-blue-500/10'
            )}
          >
            <span className="w-8 text-right text-zinc-600 select-none shrink-0">
              {line?.oldLineNumber ?? ''}
            </span>
            <span
              className={cn(
                'flex-1 pl-4',
                line?.type === 'removed' && 'text-red-400',
                line?.type === 'unchanged' && 'text-zinc-300',
                line?.type === 'header' && 'text-blue-400'
              )}
            >
              {line?.content ?? ''}
            </span>
          </div>
        ))}
      </div>

      {/* Right side (new) */}
      <div className="flex-1">
        {rightLines.map((line, index) => (
          <div
            key={index}
            className={cn(
              'flex px-4 py-0.5',
              line?.type === 'added' && 'bg-green-500/10',
              line?.type === 'header' && 'bg-blue-500/10'
            )}
          >
            <span className="w-8 text-right text-zinc-600 select-none shrink-0">
              {line?.newLineNumber ?? ''}
            </span>
            <span
              className={cn(
                'flex-1 pl-4',
                line?.type === 'added' && 'text-green-400',
                line?.type === 'unchanged' && 'text-zinc-300',
                line?.type === 'header' && 'text-blue-400'
              )}
            >
              {line?.content ?? ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { DiffViewer };
