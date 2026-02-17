/**
 * Multi-File Diff View
 */

import * as React from 'react';
import type { MultiFileDiff, FileDiff } from './types';
import { SideBySideView } from './side-by-side';
import { FileAcceptReject } from './accept-reject';

export interface MultiFileDiffProps {
  diff: MultiFileDiff;
  acceptedFiles: Set<string>;
  rejectedFiles: Set<string>;
  onAcceptFile: (filePath: string) => void;
  onRejectFile: (filePath: string) => void;
  onSelectFile: (filePath: string) => void;
  selectedFile?: string;
}

export function MultiFileDiffView({
  diff,
  acceptedFiles,
  rejectedFiles,
  onAcceptFile,
  onRejectFile,
  onSelectFile,
  selectedFile,
}: MultiFileDiffProps) {
  const [expandedFiles, setExpandedFiles] = React.useState<Set<string>>(
    new Set(diff.files.slice(0, 3).map((f) => f.filePath))
  );

  const toggleExpanded = (filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Summary */}
      <div className="px-4 py-3 bg-zinc-800 border-b border-zinc-700">
        <div className="text-sm text-zinc-300">{diff.summary}</div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {diff.files.map((file) => (
          <FileSection
            key={file.filePath}
            file={file}
            isExpanded={expandedFiles.has(file.filePath)}
            isSelected={selectedFile === file.filePath}
            isAccepted={acceptedFiles.has(file.filePath)}
            isRejected={rejectedFiles.has(file.filePath)}
            onToggleExpand={() => toggleExpanded(file.filePath)}
            onSelect={() => onSelectFile(file.filePath)}
            onAccept={() => onAcceptFile(file.filePath)}
            onReject={() => onRejectFile(file.filePath)}
          />
        ))}
      </div>
    </div>
  );
}

interface FileSectionProps {
  file: FileDiff;
  isExpanded: boolean;
  isSelected: boolean;
  isAccepted: boolean;
  isRejected: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
  onAccept: () => void;
  onReject: () => void;
}

function FileSection({
  file,
  isExpanded,
  isSelected,
  isAccepted,
  isRejected,
  onToggleExpand,
  onSelect,
  onAccept,
  onReject,
}: FileSectionProps) {
  return (
    <div
      className={`border-b border-zinc-700 ${
        isSelected ? 'ring-2 ring-blue-500' : ''
      }`}
    >
      {/* File header */}
      <div
        className="flex items-center justify-between px-4 py-2 bg-zinc-800 cursor-pointer hover:bg-zinc-700"
        onClick={onSelect}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="text-zinc-400 hover:text-white"
          >
            {isExpanded ? '▼' : '▶'}
          </button>

          <FileIcon file={file} />

          <span className="text-sm text-zinc-200">{file.filePath}</span>

          {file.isRenamed && file.oldPath && (
            <span className="text-xs text-zinc-500">← {file.oldPath}</span>
          )}

          <div className="flex items-center gap-2 text-xs">
            <span className="text-green-400">+{file.additions}</span>
            <span className="text-red-400">-{file.deletions}</span>
          </div>
        </div>

        {/* Status/Actions */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {isAccepted ? (
            <span className="px-2 py-1 text-xs bg-green-600 text-white rounded">
              Accepted
            </span>
          ) : isRejected ? (
            <span className="px-2 py-1 text-xs bg-red-600 text-white rounded">
              Rejected
            </span>
          ) : (
            <>
              <button
                onClick={onAccept}
                className="px-2 py-1 text-xs bg-green-600 hover:bg-green-500 text-white rounded"
              >
                Accept
              </button>
              <button
                onClick={onReject}
                className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded"
              >
                Reject
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded diff */}
      {isExpanded && (
        <div className="max-h-96 overflow-auto">
          <SideBySideView diff={file} />
        </div>
      )}
    </div>
  );
}

function FileIcon({ file }: { file: FileDiff }) {
  if (file.isNew) {
    return <span className="text-green-400 text-xs">NEW</span>;
  }
  if (file.isDeleted) {
    return <span className="text-red-400 text-xs">DEL</span>;
  }
  if (file.isRenamed) {
    return <span className="text-yellow-400 text-xs">REN</span>;
  }
  return <span className="text-blue-400 text-xs">MOD</span>;
}

/**
 * File list sidebar for multi-file diff
 */
export interface FileListSidebarProps {
  files: FileDiff[];
  selectedFile?: string;
  acceptedFiles: Set<string>;
  rejectedFiles: Set<string>;
  onSelectFile: (filePath: string) => void;
}

export function FileListSidebar({
  files,
  selectedFile,
  acceptedFiles,
  rejectedFiles,
  onSelectFile,
}: FileListSidebarProps) {
  return (
    <div className="w-64 bg-zinc-900 border-r border-zinc-700 overflow-auto">
      <div className="px-3 py-2 text-xs font-medium text-zinc-500 uppercase">
        Changed Files ({files.length})
      </div>
      {files.map((file) => {
        const isAccepted = acceptedFiles.has(file.filePath);
        const isRejected = rejectedFiles.has(file.filePath);
        const isSelected = selectedFile === file.filePath;

        return (
          <div
            key={file.filePath}
            onClick={() => onSelectFile(file.filePath)}
            className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm ${
              isSelected
                ? 'bg-blue-600 text-white'
                : 'text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            <FileIcon file={file} />
            <span className="truncate flex-1">
              {file.filePath.split('/').pop()}
            </span>
            {isAccepted && <span className="text-green-400">✓</span>}
            {isRejected && <span className="text-red-400">✗</span>}
          </div>
        );
      })}
    </div>
  );
}
