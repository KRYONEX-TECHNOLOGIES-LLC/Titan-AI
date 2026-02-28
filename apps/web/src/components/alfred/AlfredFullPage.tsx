'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AlfredHeader } from './AlfredHeader';
import { AlfredCanvas } from './AlfredCanvas';
import { AlfredChat } from './AlfredChat';
import type { useAlfredAmbient } from '@/hooks/useAlfredAmbient';

interface AlfredFullPageProps {
  onBackToIDE: () => void;
  alfred: ReturnType<typeof useAlfredAmbient>;
  titanVoice: {
    isSpeaking: boolean;
    voiceEnabled: boolean;
    stopSpeaking: () => void;
    toggleVoice: () => void;
  };
  renderMessage: (text: string) => React.ReactNode;
  WaveformVisualizer: React.ComponentType<{ active: boolean; speaking: boolean }>;
  BuildProgressCard: React.ComponentType<{ steps: Array<{ id: string; tool: string; description: string; status: string; result?: string }> }>;
}

const MIN_PANEL_WIDTH = 280;
const DEFAULT_SPLIT = 0.62;

export function AlfredFullPage({
  onBackToIDE, alfred, titanVoice, renderMessage, WaveformVisualizer, BuildProgressCard,
}: AlfredFullPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT);
  const [isDragging, setIsDragging] = useState(false);

  const { alfredState, conversationLog, voice, sendManual } = alfred;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = x / rect.width;
      const minRatio = MIN_PANEL_WIDTH / rect.width;
      setSplitRatio(Math.min(Math.max(ratio, minRatio), 1 - minRatio));
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="flex flex-col h-full w-full bg-[#111] select-none">
      {/* Header with session tabs + mode tabs */}
      <AlfredHeader alfredState={alfredState} onBackToIDE={onBackToIDE} />

      {/* Main split content */}
      <div ref={containerRef} className="flex-1 flex min-h-0 overflow-hidden" style={{ cursor: isDragging ? 'col-resize' : undefined }}>
        {/* Canvas (left/main) */}
        <div
          className="h-full overflow-hidden"
          style={{ width: `${splitRatio * 100}%` }}
        >
          <AlfredCanvas />
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className={`w-[4px] shrink-0 cursor-col-resize transition-colors ${
            isDragging ? 'bg-cyan-500' : 'bg-[#2a2a2a] hover:bg-[#3c3c3c]'
          }`}
        />

        {/* Chat (right) */}
        <div
          className="h-full overflow-hidden"
          style={{ width: `${(1 - splitRatio) * 100}%` }}
        >
          <AlfredChat
            alfredState={alfredState}
            conversationLog={conversationLog}
            voice={voice}
            sendManual={sendManual}
            titanVoice={titanVoice}
            renderMessage={renderMessage}
            WaveformVisualizer={WaveformVisualizer}
            BuildProgressCard={BuildProgressCard}
          />
        </div>
      </div>
    </div>
  );
}
