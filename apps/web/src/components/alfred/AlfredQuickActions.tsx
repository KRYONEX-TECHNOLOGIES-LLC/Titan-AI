'use client';

import React from 'react';
import { useFileStore } from '@/stores/file-store';

interface AlfredQuickActionsProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

const DEFAULT_ACTIONS = [
  { label: 'Build this', prompt: 'Build out the current project based on what you see in the workspace' },
  { label: 'Search the web', prompt: 'Search the web for the latest information on ' },
  { label: 'Start Plan Mode', prompt: 'Switch to Plan Mode and help me create a build plan' },
  { label: 'Scan project', prompt: 'Scan the current project and give me a full analysis' },
  { label: 'Find bugs', prompt: 'Analyze the codebase for bugs, missing error handling, and potential issues' },
  { label: 'Deploy', prompt: 'Help me deploy this project to production' },
];

export function AlfredQuickActions({ onSend, disabled }: AlfredQuickActionsProps) {
  const workspaceOpen = useFileStore((s) => s.workspaceOpen);

  const actions = workspaceOpen ? DEFAULT_ACTIONS : [
    { label: 'Open a project', prompt: 'Help me open or create a new project' },
    { label: 'Search the web', prompt: 'Search the web for ' },
    { label: 'Start Plan Mode', prompt: 'Switch to Plan Mode' },
    { label: 'What can you do?', prompt: 'Tell me everything you can do as Alfred' },
  ];

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-t border-[#2a2a2a] bg-[#1a1a1a] overflow-x-auto">
      <span className="text-[9px] text-[#555] shrink-0 mr-1">Suggested</span>
      {actions.map((a, i) => (
        <button
          key={i}
          onClick={() => onSend(a.prompt)}
          disabled={disabled}
          className="px-2.5 py-1 rounded-full text-[10px] text-[#ccc] bg-[#2d2d2d] border border-[#3c3c3c] hover:bg-[#3c3c3c] hover:text-white disabled:opacity-40 transition-colors shrink-0 whitespace-nowrap"
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
