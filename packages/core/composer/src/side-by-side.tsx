/**
 * Side-by-Side Diff View
 */

import * as React from 'react';
import type { FileDiff, DiffChange } from './types';

export interface SideBySideProps {
  diff: FileDiff;
  className?: string;
  showLineNumbers?: boolean;
  onLineClick?: (lineNumber: number, side: 'old' | 'new') => void;
}

export function SideBySideView({
  diff,
  className = '',
  showLineNumbers = true,
  onLineClick,
}: SideBySideProps) {
  // Build aligned lines for side-by-side display
  const { leftLines, rightLines } = React.useMemo(() => {
    const left: Array<{ line: number | null; content: string; type: string }> = [];
    const right: Array<{ line: number | null; content: string; type: string }> = [];

    for (const hunk of diff.hunks) {
      for (const change of hunk.changes) {
        if (change.type === 'remove') {
          left.push({
            line: change.oldLineNumber ?? null,
            content: change.value,
            type: 'remove',
          });
          right.push({ line: null, content: '', type: 'empty' });
        } else if (change.type === 'add') {
          left.push({ line: null, content: '', type: 'empty' });
          right.push({
            line: change.newLineNumber ?? null,
            content: change.value,
            type: 'add',
          });
        } else {
          left.push({
            line: change.oldLineNumber ?? null,
            content: change.value,
            type: 'unchanged',
          });
          right.push({
            line: change.newLineNumber ?? null,
            content: change.value,
            type: 'unchanged',
          });
        }
      }
    }

    return { leftLines: left, rightLines: right };
  }, [diff]);

  const getLineClass = (type: string) => {
    switch (type) {
      case 'add':
        return 'bg-green-900/30';
      case 'remove':
        return 'bg-red-900/30';
      case 'empty':
        return 'bg-zinc-800/50';
      default:
        return '';
    }
  };

  return (
    <div className={`flex font-mono text-sm ${className}`}>
      {/* Left side (old) */}
      <div className="flex-1 border-r border-zinc-700 overflow-x-auto">
        {leftLines.map((line, idx) => (
          <div
            key={`left-${idx}`}
            className={`flex ${getLineClass(line.type)}`}
            onClick={() => line.line && onLineClick?.(line.line, 'old')}
          >
            {showLineNumbers && (
              <span className="w-12 px-2 text-right text-zinc-500 select-none border-r border-zinc-700">
                {line.line ?? ''}
              </span>
            )}
            <span className="flex-1 px-2 whitespace-pre">
              {line.type === 'remove' && (
                <span className="text-red-400">-</span>
              )}
              <span className={line.type === 'remove' ? 'text-red-300' : 'text-zinc-300'}>
                {line.content}
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* Right side (new) */}
      <div className="flex-1 overflow-x-auto">
        {rightLines.map((line, idx) => (
          <div
            key={`right-${idx}`}
            className={`flex ${getLineClass(line.type)}`}
            onClick={() => line.line && onLineClick?.(line.line, 'new')}
          >
            {showLineNumbers && (
              <span className="w-12 px-2 text-right text-zinc-500 select-none border-r border-zinc-700">
                {line.line ?? ''}
              </span>
            )}
            <span className="flex-1 px-2 whitespace-pre">
              {line.type === 'add' && (
                <span className="text-green-400">+</span>
              )}
              <span className={line.type === 'add' ? 'text-green-300' : 'text-zinc-300'}>
                {line.content}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
