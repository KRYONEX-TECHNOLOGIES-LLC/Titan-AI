'use client';

import React from 'react';

interface AlfredChoiceChipsProps {
  choices: string[];
  onSelect: (choice: string) => void;
  disabled?: boolean;
}

export function AlfredChoiceChips({ choices, onSelect, disabled }: AlfredChoiceChipsProps) {
  if (choices.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {choices.map((choice, i) => (
        <button
          key={i}
          onClick={() => onSelect(choice)}
          disabled={disabled}
          className="px-3 py-1.5 rounded-full text-[11px] font-medium
            bg-gradient-to-r from-cyan-600/20 to-blue-600/20
            border border-cyan-500/30 text-cyan-300
            hover:from-cyan-600/30 hover:to-blue-600/30 hover:border-cyan-400/50 hover:text-cyan-200
            active:scale-95 transition-all duration-150
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {choice}
        </button>
      ))}
    </div>
  );
}

const CHOICES_REGEX = /\[choices:\s*([^\]]+)\]/;

export function parseChoices(text: string): { cleanText: string; choices: string[] } {
  const match = text.match(CHOICES_REGEX);
  if (!match) return { cleanText: text, choices: [] };

  const choices = match[1]
    .split('|')
    .map(c => c.trim())
    .filter(c => c.length > 0);

  const cleanText = text.replace(CHOICES_REGEX, '').trim();
  return { cleanText, choices };
}
