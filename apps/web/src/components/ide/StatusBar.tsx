'use client';

import dynamic from 'next/dynamic';

const MidnightToggle = dynamic(() => import('@/components/midnight/MidnightToggle'), { ssr: false });
const ConfidenceIndicator = dynamic(
  () => import('@/components/midnight/ConfidenceMeter').then(mod => ({ default: mod.ConfidenceIndicator })),
  { ssr: false }
);

function GitIcon({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>;
}

interface StatusBarProps {
  midnightActive: boolean;
  onMidnightToggle: () => void;
  confidenceScore: number;
  confidenceStatus: 'healthy' | 'warning' | 'error';
  gitBranch: string;
  unsavedCount: number;
  currentLanguage: string;
  cursorLine: number;
  cursorColumn: number;
  activeModelLabel: string;
  onGitClick: () => void;
  onSettingsClick: () => void;
}

export default function StatusBar({
  midnightActive,
  onMidnightToggle,
  confidenceScore,
  confidenceStatus,
  gitBranch,
  unsavedCount,
  currentLanguage,
  cursorLine,
  cursorColumn,
  activeModelLabel,
  onGitClick,
  onSettingsClick,
}: StatusBarProps) {
  return (
    <div className={`h-[22px] ${midnightActive ? 'bg-purple-600' : 'bg-[#007acc]'} flex items-center justify-between px-3 text-[11px] text-white shrink-0 transition-colors`}>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 cursor-pointer hover:bg-[#0098ff] px-1 rounded" onClick={onGitClick}>
          <GitIcon size={12} /> {gitBranch}
        </span>
        <span>{unsavedCount > 0 ? `${unsavedCount} unsaved` : '✓'}</span>
      </div>
      <div className="flex items-center gap-4">
        <MidnightToggle isActive={midnightActive} onToggle={onMidnightToggle} />
        {midnightActive && <ConfidenceIndicator score={confidenceScore} status={confidenceStatus} />}
        <span className="cursor-pointer hover:bg-[#0098ff] px-1 rounded" onClick={onSettingsClick}>{currentLanguage}</span>
        <span>Ln {cursorLine}, Col {cursorColumn}</span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-[#3fb950] rounded-full"></span>
          {activeModelLabel}
        </span>
      </div>
    </div>
  );
}
