'use client';

import React, { useState } from 'react';
import { useAlfredCanvas } from '@/stores/alfred-canvas-store';

export function ExecutionView() {
  const { content, contentHistory } = useAlfredCanvas();
  const [historyIdx, setHistoryIdx] = useState(-1);

  const execItems = contentHistory.filter((c) => c.type === 'execution');
  const active = historyIdx >= 0 ? execItems[historyIdx] : content?.type === 'execution' ? content : execItems[execItems.length - 1];

  if (!active) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#555] bg-[#0a0a0a]">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        <p className="text-[11px] mt-2">No code executions yet</p>
        <p className="text-[9px] text-[#444] mt-1">Alfred will show execution results here</p>
      </div>
    );
  }

  const data = JSON.parse(active.data);
  const { code, language, stdout, stderr, error, status, duration } = data;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] font-mono">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] bg-[#111]">
        <div className="flex gap-1">
          <div className={`w-2.5 h-2.5 rounded-full ${status === 'success' ? 'bg-[#28c840]' : status === 'error' ? 'bg-[#ff5f57]' : 'bg-[#febc2e]'}`} />
        </div>
        <span className="text-[10px] text-[#666] ml-2">Execution Sandbox</span>
        <span className="text-[10px] text-cyan-400 ml-2">{language}</span>
        {duration && <span className="text-[10px] text-[#555] ml-auto">{duration}ms</span>}
        
        {execItems.length > 1 && (
          <div className="flex items-center gap-1 ml-4">
            <button
              onClick={() => setHistoryIdx((p) => Math.max(0, (p < 0 ? execItems.length - 1 : p) - 1))}
              className="text-[10px] text-[#666] hover:text-white px-1"
            >
              Prev
            </button>
            <span className="text-[9px] text-[#555]">{(historyIdx < 0 ? execItems.length : historyIdx + 1)}/{execItems.length}</span>
            <button
              onClick={() => setHistoryIdx((p) => {
                const next = (p < 0 ? execItems.length - 1 : p) + 1;
                return next >= execItems.length ? -1 : next;
              })}
              className="text-[10px] text-[#666] hover:text-white px-1"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* Code Section */}
        <div className="border-b border-[#1a1a1a]">
          <div className="px-3 py-1 bg-[#141414] text-[10px] text-[#888] uppercase tracking-wider">Input Code</div>
          <pre className="p-3 text-[11px] text-[#ccc] whitespace-pre-wrap leading-[1.5] bg-[#0d0d0d]">
            {code}
          </pre>
        </div>

        {/* Output Section */}
        <div className="flex-1 flex flex-col">
          <div className="px-3 py-1 bg-[#141414] text-[10px] text-[#888] uppercase tracking-wider">Output</div>
          <div className="p-3 flex-1 bg-[#0a0a0a]">
            {stdout && (
              <div className="mb-3">
                <div className="text-[10px] text-[#555] mb-1">stdout:</div>
                <pre className="text-[11px] text-[#ccc] whitespace-pre-wrap">{stdout}</pre>
              </div>
            )}
            {stderr && (
              <div className="mb-3">
                <div className="text-[10px] text-[#555] mb-1">stderr:</div>
                <pre className="text-[11px] text-[#ff5f57] whitespace-pre-wrap">{stderr}</pre>
              </div>
            )}
            {error && (
              <div className="mb-3">
                <div className="text-[10px] text-[#555] mb-1">error:</div>
                <pre className="text-[11px] text-[#ff5f57] whitespace-pre-wrap">{error}</pre>
              </div>
            )}
            {!stdout && !stderr && !error && (
              <div className="text-[11px] text-[#555] italic">No output</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
