'use client';

import React, { useRef, useEffect } from 'react';
import { useAlfredCanvas } from '@/stores/alfred-canvas-store';

export function TerminalView() {
  const { content, contentHistory } = useAlfredCanvas();
  const scrollRef = useRef<HTMLDivElement>(null);

  const terminalItems = contentHistory.filter((c) => c.type === 'terminal');
  const current = content?.type === 'terminal' ? content : terminalItems[terminalItems.length - 1];

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [content]);

  if (!current && terminalItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#555] bg-[#0a0a0a]">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        <p className="text-[11px] mt-2">No terminal output yet</p>
        <p className="text-[9px] text-[#444] mt-1">Commands will appear here when Alfred runs them</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] font-mono">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] bg-[#111]">
        <div className="flex gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="text-[10px] text-[#666] ml-2">Terminal</span>
        {current?.title && <span className="text-[10px] text-[#888] ml-auto truncate">{current.title}</span>}
      </div>

      {/* Output */}
      <div className="flex-1 overflow-y-auto p-3">
        {terminalItems.map((item, i) => (
          <div key={i} className="mb-3">
            {item.title && (
              <div className="text-[10px] text-green-400 mb-0.5">
                <span className="text-[#555]">$</span> {item.title}
              </div>
            )}
            <pre className="text-[11px] text-[#ccc] whitespace-pre-wrap leading-[1.5]">{item.data}</pre>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>
    </div>
  );
}
