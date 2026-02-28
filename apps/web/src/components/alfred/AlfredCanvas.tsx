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
    case 'idle':
    default:
      return <ScreenView />;
  }
}
