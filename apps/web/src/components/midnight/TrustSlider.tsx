'use client';

import { useState } from 'react';

interface TrustLevel {
  level: 1 | 2 | 3;
  name: string;
  description: string;
  color: string;
}

const TRUST_LEVELS: TrustLevel[] = [
  {
    level: 1,
    name: 'Supervised',
    description: 'Standard co-pilot mode - requires approval for all actions',
    color: '#22c55e', // green
  },
  {
    level: 2,
    name: 'Assistant',
    description: 'Multi-file edits allowed - requires Apply clicks',
    color: '#3b82f6', // blue
  },
  {
    level: 3,
    name: 'Project Midnight',
    description: 'Full autonomy - no permissions asked, auto repo rotation',
    color: '#a855f7', // purple
  },
];

interface TrustSliderProps {
  value: 1 | 2 | 3;
  onChange: (level: 1 | 2 | 3) => void;
  disabled?: boolean;
}

/**
 * Trust Levels Slider
 * Controls the autonomy level of Titan AI
 */
export function TrustSlider({ value, onChange, disabled = false }: TrustSliderProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const current = TRUST_LEVELS.find(t => t.level === value)!;
  const displayLevel = hovered !== null ? TRUST_LEVELS[hovered] : current;

  return (
    <div className={`space-y-3 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-[#cccccc]">Trust Level</span>
        <span 
          className="text-[12px] font-medium"
          style={{ color: displayLevel.color }}
        >
          {displayLevel.name}
        </span>
      </div>

      {/* Slider track */}
      <div className="relative">
        <div className="h-2 bg-[#2d2d2d] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${((value - 1) / 2) * 100}%`,
              background: `linear-gradient(to right, #22c55e, ${current.color})`,
            }}
          />
        </div>

        {/* Level markers */}
        <div className="absolute inset-0 flex justify-between items-center px-0">
          {TRUST_LEVELS.map((level, index) => (
            <button
              key={level.level}
              onClick={() => onChange(level.level)}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              className={`
                w-4 h-4 rounded-full border-2 transition-all
                ${value >= level.level 
                  ? 'border-transparent scale-110' 
                  : 'border-[#3c3c3c] bg-[#1e1e1e]'}
                hover:scale-125
              `}
              style={{
                backgroundColor: value >= level.level ? level.color : undefined,
              }}
              title={level.name}
            />
          ))}
        </div>
      </div>

      {/* Description */}
      <p className="text-[11px] text-[#808080]">
        {displayLevel.description}
      </p>

      {/* Warning for level 3 */}
      {value === 3 && (
        <div className="flex items-center gap-2 p-2 bg-purple-500/10 border border-purple-500/30 rounded text-[11px] text-purple-300">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Full autonomy mode. AI will execute without confirmation.</span>
        </div>
      )}
    </div>
  );
}

export default TrustSlider;
