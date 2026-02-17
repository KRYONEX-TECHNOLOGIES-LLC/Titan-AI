/**
 * Accept/Reject UI Components
 */

import * as React from 'react';
import type { FileDiff, InlinePatch } from './types';

export interface AcceptRejectBarProps {
  totalChanges: number;
  acceptedCount: number;
  rejectedCount: number;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onUndo: () => void;
  canUndo: boolean;
}

export function AcceptRejectBar({
  totalChanges,
  acceptedCount,
  rejectedCount,
  onAcceptAll,
  onRejectAll,
  onUndo,
  canUndo,
}: AcceptRejectBarProps) {
  const pendingCount = totalChanges - acceptedCount - rejectedCount;
  const progress = totalChanges > 0 ? ((acceptedCount + rejectedCount) / totalChanges) * 100 : 0;

  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-zinc-800 border-b border-zinc-700">
      {/* Progress */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm text-zinc-300">
            {pendingCount} pending
          </span>
          <span className="text-xs text-green-400">
            {acceptedCount} accepted
          </span>
          <span className="text-xs text-red-400">
            {rejectedCount} rejected
          </span>
        </div>
        <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {canUndo && (
          <button
            onClick={onUndo}
            className="px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-700 rounded transition-colors"
          >
            Undo
          </button>
        )}
        <button
          onClick={onAcceptAll}
          disabled={pendingCount === 0}
          className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
        >
          Accept All
        </button>
        <button
          onClick={onRejectAll}
          disabled={pendingCount === 0}
          className="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
        >
          Reject All
        </button>
      </div>
    </div>
  );
}

export interface FileAcceptRejectProps {
  file: FileDiff;
  isAccepted: boolean;
  isRejected: boolean;
  onAccept: () => void;
  onReject: () => void;
}

export function FileAcceptReject({
  file,
  isAccepted,
  isRejected,
  onAccept,
  onReject,
}: FileAcceptRejectProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 border border-zinc-700 rounded">
      <div className="flex items-center gap-3">
        {/* File icon */}
        <span className="text-zinc-400">📄</span>

        {/* File path */}
        <span className="text-sm text-zinc-200">{file.filePath}</span>

        {/* Stats */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-green-400">+{file.additions}</span>
          <span className="text-red-400">-{file.deletions}</span>
        </div>

        {/* Status badges */}
        {file.isNew && (
          <span className="px-2 py-0.5 text-xs bg-green-600 text-white rounded">New</span>
        )}
        {file.isDeleted && (
          <span className="px-2 py-0.5 text-xs bg-red-600 text-white rounded">Deleted</span>
        )}
        {file.isRenamed && (
          <span className="px-2 py-0.5 text-xs bg-yellow-600 text-white rounded">Renamed</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {isAccepted ? (
          <span className="text-sm text-green-400">✓ Accepted</span>
        ) : isRejected ? (
          <span className="text-sm text-red-400">✗ Rejected</span>
        ) : (
          <>
            <button
              onClick={onAccept}
              className="px-3 py-1 text-xs bg-green-600 hover:bg-green-500 text-white rounded"
            >
              Accept
            </button>
            <button
              onClick={onReject}
              className="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded"
            >
              Reject
            </button>
          </>
        )}
      </div>
    </div>
  );
}
