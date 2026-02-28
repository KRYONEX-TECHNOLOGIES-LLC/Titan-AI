'use client';

import React from 'react';
import { useAlfredCanvas } from '@/stores/alfred-canvas-store';

export function FileTreeView() {
  const { content, contentHistory } = useAlfredCanvas();

  const fileItems = contentHistory.filter((c) => c.type === 'files');
  const current = content?.type === 'files' ? content : fileItems[fileItems.length - 1];

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#555]">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <p className="text-[11px] mt-2">No file changes yet</p>
        <p className="text-[9px] text-[#444] mt-1">The file tree will update as Alfred creates or modifies files</p>
      </div>
    );
  }

  const lines = current.data.split('\n').filter(Boolean);

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a2a]">
        <span className="text-[11px] text-[#ccc]">File Changes</span>
        <span className="text-[9px] text-[#666] ml-auto">{lines.length} items</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {lines.map((line, i) => {
          const isDir = line.trimEnd().endsWith('/');
          const depth = line.search(/\S/);
          const name = line.trim();
          const isNew = Boolean(current.meta?.newFiles && Array.isArray(current.meta.newFiles) && (current.meta.newFiles as string[]).includes(name.replace('/', '')));

          return (
            <div
              key={i}
              className="flex items-center gap-1.5 py-0.5 hover:bg-[#1a1a1a] rounded px-1"
              style={{ paddingLeft: `${Math.max(4, depth * 12 + 4)}px` }}
            >
              {isDir ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#e8a838" stroke="none">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#808080" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              )}
              <span className={`text-[11px] ${isDir ? 'text-[#e8a838]' : 'text-[#ccc]'}`}>{name}</span>
              {isNew && <span className="text-[8px] text-green-400 ml-auto px-1 py-0.5 bg-green-400/10 rounded">NEW</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
