'use client';

import React from 'react';
import { useAlfredCanvas } from '@/stores/alfred-canvas-store';
import { ScreenView } from './canvas/ScreenView';
import { CodePreview } from './canvas/CodePreview';
import { TerminalView } from './canvas/TerminalView';
import { FileTreeView } from './canvas/FileTreeView';
import { VibeCode } from './canvas/VibeCode';
import { DashboardView } from './canvas/DashboardView';

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
    case 'idle':
    default:
      return <ScreenView />;
  }
}
