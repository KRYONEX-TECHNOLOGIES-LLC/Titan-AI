'use client';
import React from 'react';

interface AlfredActionBarProps {
  actions: string[];
  onAction: (action: string) => void;
  disabled?: boolean;
}

export function AlfredActionBar({ actions, onAction, disabled }: AlfredActionBarProps) {
  if (actions.length === 0) return null;

  const getStyle = (action: string) => {
    const lower = action.toLowerCase();
    if (lower === 'proceed' || lower === 'yes' || lower === 'confirm' || lower === 'go')
      return 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500';
    if (lower === 'cancel' || lower === 'no' || lower === 'stop')
      return 'bg-red-600/80 hover:bg-red-500 text-white border-red-500';
    if (lower === 'play' || lower === 'run' || lower === 'execute')
      return 'bg-cyan-600 hover:bg-cyan-500 text-white border-cyan-500';
    if (lower === 'edit' || lower === 'modify')
      return 'bg-amber-600/80 hover:bg-amber-500 text-white border-amber-500';
    if (lower === 'save' || lower === 'push')
      return 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500';
    return 'bg-[#2d2d2d] hover:bg-[#3d3d3d] text-white border-[#555]';
  };

  const getIcon = (action: string) => {
    const lower = action.toLowerCase();
    if (lower === 'proceed' || lower === 'yes' || lower === 'confirm' || lower === 'go')
      return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />;
    if (lower === 'cancel' || lower === 'no' || lower === 'stop')
      return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />;
    if (lower === 'play' || lower === 'run' || lower === 'execute')
      return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />;
    if (lower === 'save' || lower === 'push')
      return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />;
    return null;
  };

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={() => onAction(action)}
          disabled={disabled}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm ${getStyle(action)}`}
        >
          {getIcon(action) && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              {getIcon(action)}
            </svg>
          )}
          {action}
        </button>
      ))}
    </div>
  );
}

const ACTIONS_REGEX = /\[actions:\s*([^\]]+)\]/;

export function parseActions(text: string): { cleanText: string; actions: string[] } {
  const match = text.match(ACTIONS_REGEX);
  if (!match) return { cleanText: text, actions: [] };
  const actions = match[1].split('|').map(a => a.trim()).filter(a => a.length > 0);
  const cleanText = text.replace(ACTIONS_REGEX, '').trim();
  return { cleanText, actions };
}
