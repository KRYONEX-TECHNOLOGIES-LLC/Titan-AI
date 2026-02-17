/**
 * Inline Patch View
 */

import * as React from 'react';
import type { InlinePatch, DiffHunk } from './types';

export interface InlinePatchProps {
  patch: InlinePatch;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  className?: string;
}

export function InlinePatchView({
  patch,
  onAccept,
  onReject,
  className = '',
}: InlinePatchProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);

  const oldLines = patch.originalContent.split('\n');
  const newLines = patch.newContent.split('\n');

  return (
    <div className={`border border-zinc-700 rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-800 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-zinc-400 hover:text-zinc-200"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <span className="text-sm text-zinc-300">
            Lines {patch.startLine}-{patch.endLine}
          </span>
          <span className="text-xs text-zinc-500">{patch.filePath}</span>
        </div>

        {patch.status === 'pending' && (
          <div className="flex gap-2">
            <button
              onClick={() => onAccept(patch.id)}
              className="px-3 py-1 text-xs bg-green-600 hover:bg-green-500 text-white rounded"
            >
              Accept
            </button>
            <button
              onClick={() => onReject(patch.id)}
              className="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded"
            >
              Reject
            </button>
          </div>
        )}

        {patch.status === 'accepted' && (
          <span className="text-xs text-green-400">✓ Accepted</span>
        )}

        {patch.status === 'rejected' && (
          <span className="text-xs text-red-400">✗ Rejected</span>
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="font-mono text-sm">
          {/* Removed lines */}
          {oldLines.map((line, idx) => (
            <div key={`old-${idx}`} className="flex bg-red-900/20">
              <span className="w-12 px-2 text-right text-zinc-500 select-none border-r border-zinc-700">
                {patch.startLine + idx}
              </span>
              <span className="w-6 text-center text-red-400">-</span>
              <span className="flex-1 px-2 text-red-300 whitespace-pre">{line}</span>
            </div>
          ))}

          {/* Added lines */}
          {newLines.map((line, idx) => (
            <div key={`new-${idx}`} className="flex bg-green-900/20">
              <span className="w-12 px-2 text-right text-zinc-500 select-none border-r border-zinc-700">
                {patch.startLine + idx}
              </span>
              <span className="w-6 text-center text-green-400">+</span>
              <span className="flex-1 px-2 text-green-300 whitespace-pre">{line}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface InlinePatchListProps {
  patches: InlinePatch[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

export function InlinePatchList({
  patches,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
}: InlinePatchListProps) {
  const pendingCount = patches.filter((p) => p.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Actions */}
      {pendingCount > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 rounded">
          <span className="text-sm text-zinc-300">
            {pendingCount} pending change{pendingCount !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onAcceptAll}
              className="px-3 py-1 text-xs bg-green-600 hover:bg-green-500 text-white rounded"
            >
              Accept All
            </button>
            <button
              onClick={onRejectAll}
              className="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded"
            >
              Reject All
            </button>
          </div>
        </div>
      )}

      {/* Patches */}
      {patches.map((patch) => (
        <InlinePatchView
          key={patch.id}
          patch={patch}
          onAccept={onAccept}
          onReject={onReject}
        />
      ))}
    </div>
  );
}
