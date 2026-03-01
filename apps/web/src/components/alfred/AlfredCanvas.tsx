'use client';

import React from 'react';
import { useAlfredCanvas } from '@/stores/alfred-canvas-store';
import { ScreenView } from './canvas/ScreenView';
import { CodePreview } from './canvas/CodePreview';
import { TerminalView } from './canvas/TerminalView';
import { FileTreeView } from './canvas/FileTreeView';
import { VibeCode } from './canvas/VibeCode';
import { DashboardView } from './canvas/DashboardView';
import { SimulationView } from './canvas/SimulationView';
import { VideoView } from './canvas/VideoView';
import { ExecutionView } from './canvas/ExecutionView';

export function AlfredCanvas() {
  const { activeMode } = useAlfredCanvas();

  switch (activeMode) {
    case 'screen':
      return <ScreenView />;
    case 'code':
      return <CodePreview />;
    case 'terminal':
      return <TerminalView />;
    case 'files':
      return <FileTreeView />;
    case 'vibe':
      return <VibeCode />;
    case 'dashboard':
      return <DashboardView />;
    case 'simulation':
      return <SimulationView />;
    case 'video':
      return <VideoView />;
    case 'execution':
      return (
        <div className="h-full flex flex-col">
          <ExecutionView />
          <div className="p-2 bg-[#0a0a0a] border-t border-[#1a1a1a]">
            <div className="text-[10px] text-[#666] flex items-center gap-2">
              <span className="text-cyan-400">Sandbox Info:</span>
              <span>Docker Node:18</span>
              <span>Mem: 512MB</span>
              <span>Timeout: 5s</span>
            </div>
          </div>
        </div>
      );
    case 'idle':
    default:
      return <ScreenView />;
  }
}
