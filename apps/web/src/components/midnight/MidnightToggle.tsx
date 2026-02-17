'use client';

import { useState } from 'react';

interface MidnightToggleProps {
  isActive: boolean;
  onToggle: () => void;
}

/**
 * Midnight Toggle Button - Crescent Moon Icon
 * Displays in status bar to toggle Project Midnight mode
 */
export function MidnightToggle({ isActive, onToggle }: MidnightToggleProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        flex items-center gap-1.5 px-2 py-0.5 rounded transition-all
        ${isActive 
          ? 'bg-purple-600 text-white' 
          : isHovered 
            ? 'bg-[#0098ff] text-white' 
            : 'hover:bg-[#0098ff]'}
      `}
      title={isActive ? 'Project Midnight Active' : 'Enable Project Midnight'}
    >
      {/* Crescent Moon SVG */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        className={`transition-transform ${isActive ? 'animate-pulse' : ''}`}
      >
        <path
          d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={isActive ? 'currentColor' : 'none'}
        />
      </svg>
      <span className="text-[11px]">
        {isActive ? 'Midnight' : ''}
      </span>
      {isActive && (
        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
      )}
    </button>
  );
}

export default MidnightToggle;
