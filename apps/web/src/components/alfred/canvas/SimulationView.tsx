'use client';

import React, { useMemo, useState } from 'react';
import { useAlfredCanvas } from '@/stores/alfred-canvas-store';

export function SimulationView() {
  const { content, contentHistory } = useAlfredCanvas();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const simItems = contentHistory.filter((c) => c.type === 'simulation');
  const active = content?.type === 'simulation' ? content : simItems[simItems.length - 1];

  const srcDoc = useMemo(() => {
    if (!active?.data) return null;
    const code = active.data;
    if (code.trim().startsWith('<!') || code.trim().startsWith('<html') || code.trim().startsWith('<head') || code.includes('<body')) {
      return code;
    }
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#111;color:#fff;font-family:system-ui,-apple-system,sans-serif;overflow:hidden}</style>
</head><body>${code.includes('<script') ? code : `<script>${code}</script>`}</body></html>`;
  }, [active]);

  if (!active || !srcDoc) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#555] bg-[#0d0d0d]">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        <p className="text-[13px] mt-3 text-[#ccc]">Simulation</p>
        <p className="text-[10px] text-[#555] mt-1 text-center max-w-[280px]">
          When Alfred builds runnable code, it will appear here as a live preview.
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-[#0d0d0d] ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a2a] bg-[#1a1a1a]">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-[11px] text-[#ccc] truncate flex-1">{active.title || 'Live Preview'}</span>
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="px-2 py-0.5 rounded text-[10px] text-[#888] hover:text-white bg-[#2a2a2a] hover:bg-[#3a3a3a] transition-colors"
        >
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <iframe
          srcDoc={srcDoc}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-modals allow-same-origin"
          title="Simulation Preview"
        />
      </div>
    </div>
  );
}
