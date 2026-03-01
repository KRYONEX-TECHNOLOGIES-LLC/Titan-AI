'use client';

import React from 'react';
import { useAlfredCanvas, type CanvasMode } from '@/stores/alfred-canvas-store';

interface AlfredHeaderProps {
  alfredState: string;
  onBackToIDE: () => void;
  model: string;
  setModel: (model: string) => void;
  models: string[];
}

const MODE_TABS: { mode: CanvasMode; label: string }[] = [
  { mode: 'screen', label: 'Screen' },
  { mode: 'code', label: 'Code' },
  { mode: 'execution', label: 'Execution' },
  { mode: 'terminal', label: 'Terminal' },
  { mode: 'files', label: 'Files' },
  { mode: 'vibe', label: 'Vibe Code' },
  { mode: 'dashboard', label: 'Dashboard' },
];

const STATUS_COLORS: Record<string, string> = {
  idle: '#555',
  listening: '#10b981',
  activated: '#22d3ee',
  processing: '#f59e0b',
  speaking: '#3b82f6',
};

export function AlfredHeader({ alfredState, onBackToIDE, model, setModel, models }: AlfredHeaderProps) {
  const { activeMode, setMode, pinned, setPinned, sessions, activeSessionId, setActiveSession } = useAlfredCanvas();

  return (
    <div className="flex flex-col border-b border-[#3c3c3c] bg-[#1e1e1e] shrink-0">
      {/* Top row: session tabs + controls */}
      <div className="flex items-center h-[36px] px-2 gap-1 overflow-x-auto">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSession(s.id)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-t text-[11px] shrink-0 transition-colors ${
              s.id === activeSessionId
                ? 'bg-[#2d2d2d] text-white border-t border-x border-[#3c3c3c] border-b-0'
                : 'text-[#808080] hover:text-[#ccc] hover:bg-[#252526]'
            }`}
          >
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: s.status === 'active' ? '#22c55e' : s.status === 'complete' ? '#3b82f6' : '#555' }}
            />
            <span className="truncate max-w-[100px]">{s.name}</span>
            {s.taskCount > 0 && (
              <span className="text-[9px] text-[#666]">{s.completedCount}/{s.taskCount}</span>
            )}
          </button>
        ))}
        <button
          onClick={() => {
            const id = `session-${Date.now().toString(36)}`;
            useAlfredCanvas.getState().addSession({
              id, name: `Agent ${sessions.length + 1}`, createdAt: Date.now(),
              status: 'idle', taskCount: 0, completedCount: 0,
            });
            setActiveSession(id);
          }}
          className="px-2 py-1 text-[#808080] hover:text-white text-[13px] shrink-0 hover:bg-[#252526] rounded transition-colors"
          title="New session"
        >
          +
        </button>

        <div className="flex-1" />

        {/* Status indicator */}
        <div className="flex items-center gap-2 shrink-0 mr-2">
          <span className="text-[10px] text-[#999]">Model:</span>
          <select
            className="bg-[#222] text-[#ccc] text-[10px] rounded px-1 py-0.5"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <button onClick={onBackToIDE} className="text-[10px] text-[#808080] hover:text-white px-2 py-1 rounded hover:bg-[#3c3c3c] transition-colors shrink-0">
          IDE
        </button>
      </div>

      {/* Canvas mode tabs */}
      <div className="flex items-center h-[28px] px-2 gap-0.5 border-t border-[#2a2a2a]">
        {MODE_TABS.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => { setPinned(true); setMode(mode); }}
            className={`px-2.5 py-0.5 text-[10px] rounded transition-colors ${
              activeMode === mode
                ? 'bg-[#3c3c3c] text-white'
                : 'text-[#808080] hover:text-[#ccc] hover:bg-[#2a2a2a]'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setPinned(!pinned)}
          className={`px-2 py-0.5 text-[9px] rounded transition-colors ${
            pinned ? 'text-cyan-400 bg-cyan-400/10' : 'text-[#666] hover:text-[#999]'
          }`}
          title={pinned ? 'Unpin view (auto-switch on)' : 'Pin current view'}
        >
          {pinned ? 'Pinned' : 'Auto'}
        </button>
      </div>
    </div>
  );
}
