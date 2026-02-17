/**
 * Conflict Resolver
 */

import * as React from 'react';
import type { ConflictMarker, ConflictResolution } from './types';

export interface ConflictResolverProps {
  conflict: ConflictMarker;
  onResolve: (resolution: ConflictResolution) => void;
  onCancel: () => void;
}

export function ConflictResolver({
  conflict,
  onResolve,
  onCancel,
}: ConflictResolverProps) {
  const [customContent, setCustomContent] = React.useState('');
  const [selectedResolution, setSelectedResolution] = React.useState<
    'ours' | 'theirs' | 'both' | 'custom' | null
  >(null);

  const handleResolve = () => {
    if (!selectedResolution) return;

    onResolve({
      conflictId: `${conflict.filePath}:${conflict.startLine}`,
      resolution: selectedResolution,
      customContent: selectedResolution === 'custom' ? customContent : undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-lg border border-zinc-700 w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <div>
            <h2 className="text-lg font-medium text-white">Resolve Conflict</h2>
            <p className="text-sm text-zinc-400">
              {conflict.filePath} (lines {conflict.startLine}-{conflict.endLine})
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-zinc-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-auto max-h-[60vh]">
          {/* Ours */}
          <div
            className={`border rounded-lg overflow-hidden cursor-pointer ${
              selectedResolution === 'ours'
                ? 'border-blue-500 ring-2 ring-blue-500'
                : 'border-zinc-700 hover:border-zinc-500'
            }`}
            onClick={() => setSelectedResolution('ours')}
          >
            <div className="px-3 py-2 bg-green-900/30 border-b border-zinc-700 flex items-center gap-2">
              <input
                type="radio"
                checked={selectedResolution === 'ours'}
                onChange={() => setSelectedResolution('ours')}
              />
              <span className="text-sm font-medium text-green-400">
                Accept Current (Ours)
              </span>
            </div>
            <pre className="p-3 text-sm text-zinc-300 font-mono bg-zinc-800 overflow-x-auto">
              {conflict.ours}
            </pre>
          </div>

          {/* Theirs */}
          <div
            className={`border rounded-lg overflow-hidden cursor-pointer ${
              selectedResolution === 'theirs'
                ? 'border-blue-500 ring-2 ring-blue-500'
                : 'border-zinc-700 hover:border-zinc-500'
            }`}
            onClick={() => setSelectedResolution('theirs')}
          >
            <div className="px-3 py-2 bg-blue-900/30 border-b border-zinc-700 flex items-center gap-2">
              <input
                type="radio"
                checked={selectedResolution === 'theirs'}
                onChange={() => setSelectedResolution('theirs')}
              />
              <span className="text-sm font-medium text-blue-400">
                Accept Incoming (Theirs)
              </span>
            </div>
            <pre className="p-3 text-sm text-zinc-300 font-mono bg-zinc-800 overflow-x-auto">
              {conflict.theirs}
            </pre>
          </div>

          {/* Both */}
          <div
            className={`border rounded-lg overflow-hidden cursor-pointer ${
              selectedResolution === 'both'
                ? 'border-blue-500 ring-2 ring-blue-500'
                : 'border-zinc-700 hover:border-zinc-500'
            }`}
            onClick={() => setSelectedResolution('both')}
          >
            <div className="px-3 py-2 bg-purple-900/30 border-b border-zinc-700 flex items-center gap-2">
              <input
                type="radio"
                checked={selectedResolution === 'both'}
                onChange={() => setSelectedResolution('both')}
              />
              <span className="text-sm font-medium text-purple-400">
                Accept Both
              </span>
            </div>
            <pre className="p-3 text-sm text-zinc-300 font-mono bg-zinc-800 overflow-x-auto">
              {conflict.ours}
              {'\n'}
              {conflict.theirs}
            </pre>
          </div>

          {/* Custom */}
          <div
            className={`border rounded-lg overflow-hidden ${
              selectedResolution === 'custom'
                ? 'border-blue-500 ring-2 ring-blue-500'
                : 'border-zinc-700'
            }`}
          >
            <div
              className="px-3 py-2 bg-yellow-900/30 border-b border-zinc-700 flex items-center gap-2 cursor-pointer"
              onClick={() => setSelectedResolution('custom')}
            >
              <input
                type="radio"
                checked={selectedResolution === 'custom'}
                onChange={() => setSelectedResolution('custom')}
              />
              <span className="text-sm font-medium text-yellow-400">
                Custom Resolution
              </span>
            </div>
            <textarea
              value={customContent}
              onChange={(e) => {
                setCustomContent(e.target.value);
                setSelectedResolution('custom');
              }}
              placeholder="Enter custom resolution..."
              className="w-full p-3 text-sm text-zinc-300 font-mono bg-zinc-800 border-none outline-none resize-none"
              rows={6}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-zinc-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-zinc-300 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleResolve}
            disabled={!selectedResolution}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded"
          >
            Apply Resolution
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Conflict list view
 */
export interface ConflictListProps {
  conflicts: ConflictMarker[];
  resolvedConflicts: Set<string>;
  onSelectConflict: (conflict: ConflictMarker) => void;
}

export function ConflictList({
  conflicts,
  resolvedConflicts,
  onSelectConflict,
}: ConflictListProps) {
  const unresolvedCount = conflicts.filter(
    (c) => !resolvedConflicts.has(`${c.filePath}:${c.startLine}`)
  ).length;

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-700 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-200">
          Merge Conflicts
        </span>
        <span className="text-xs text-zinc-400">
          {unresolvedCount} unresolved
        </span>
      </div>

      <div className="max-h-64 overflow-auto">
        {conflicts.map((conflict) => {
          const conflictId = `${conflict.filePath}:${conflict.startLine}`;
          const isResolved = resolvedConflicts.has(conflictId);

          return (
            <div
              key={conflictId}
              onClick={() => !isResolved && onSelectConflict(conflict)}
              className={`flex items-center gap-3 px-4 py-2 border-b border-zinc-800 ${
                isResolved
                  ? 'opacity-50'
                  : 'cursor-pointer hover:bg-zinc-800'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isResolved ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className="text-sm text-zinc-300 truncate flex-1">
                {conflict.filePath}
              </span>
              <span className="text-xs text-zinc-500">
                L{conflict.startLine}-{conflict.endLine}
              </span>
              {isResolved && (
                <span className="text-xs text-green-400">Resolved</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
