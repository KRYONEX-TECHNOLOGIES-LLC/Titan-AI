'use client';

import React, { useState } from 'react';
import { useAlfredCanvas } from '@/stores/alfred-canvas-store';

export function CodePreview() {
  const { content, contentHistory } = useAlfredCanvas();
  const [historyIdx, setHistoryIdx] = useState(-1);

  const codeItems = contentHistory.filter((c) => c.type === 'code');
  const active = historyIdx >= 0 ? codeItems[historyIdx] : content?.type === 'code' ? content : codeItems[codeItems.length - 1];

  if (!active) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#555]">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
        </svg>
        <p className="text-[11px] mt-2">No code changes yet</p>
        <p className="text-[9px] text-[#444] mt-1">Alfred will show code here when writing or editing files</p>
      </div>
    );
  }

  const fileName = active.title || 'Untitled';
  const lang = fileName.split('.').pop() || 'text';

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      {/* File header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a2a] bg-[#1a1a1a]">
        <span className="text-[10px] text-cyan-400 font-mono">{lang}</span>
        <span className="text-[11px] text-[#ccc] truncate flex-1">{fileName}</span>
        {codeItems.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setHistoryIdx((p) => Math.max(0, (p < 0 ? codeItems.length - 1 : p) - 1))}
              className="text-[10px] text-[#666] hover:text-white px-1"
            >
              Prev
            </button>
            <span className="text-[9px] text-[#555]">{(historyIdx < 0 ? codeItems.length : historyIdx + 1)}/{codeItems.length}</span>
            <button
              onClick={() => setHistoryIdx((p) => {
                const next = (p < 0 ? codeItems.length - 1 : p) + 1;
                return next >= codeItems.length ? -1 : next;
              })}
              className="text-[10px] text-[#666] hover:text-white px-1"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Code content */}
      <div className="flex-1 overflow-auto">
        <pre className="p-4 text-[12px] font-mono text-[#d4d4d4] leading-[1.6] whitespace-pre-wrap">
          {active.data.split('\n').map((line, i) => (
            <div key={i} className="flex hover:bg-[#1a1a1a]">
              <span className="text-[#555] w-[40px] text-right pr-3 select-none shrink-0 text-[11px]">{i + 1}</span>
              <span className="flex-1">{highlightLine(line)}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

function highlightLine(line: string): React.ReactNode {
  if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#')) {
    return <span className="text-[#6a9955]">{line}</span>;
  }
  if (line.trimStart().startsWith('import ') || line.trimStart().startsWith('from ') || line.trimStart().startsWith('export ')) {
    return <span className="text-[#c586c0]">{line}</span>;
  }
  if (line.includes('+')) {
    return <span className="text-[#4ec9b0]">{line}</span>;
  }
  if (line.startsWith('-')) {
    return <span className="text-[#f44747]">{line}</span>;
  }
  return line;
}
