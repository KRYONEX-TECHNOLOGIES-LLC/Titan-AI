'use client';

interface ConfidenceMeterProps {
  score: number;
  status: 'healthy' | 'warning' | 'error';
  size?: 'small' | 'medium' | 'large';
}

/**
 * Confidence Meter - Visual indicator of build health
 * Green = healthy (85%+), Yellow = warning (70-84%), Red = error (<70%)
 */
export function ConfidenceMeter({ 
  score, 
  status,
  size = 'medium' 
}: ConfidenceMeterProps) {
  const colors = {
    healthy: {
      bg: 'bg-green-500/20',
      fill: 'bg-green-500',
      text: 'text-green-400',
      glow: 'shadow-green-500/50',
    },
    warning: {
      bg: 'bg-yellow-500/20',
      fill: 'bg-yellow-500',
      text: 'text-yellow-400',
      glow: 'shadow-yellow-500/50',
    },
    error: {
      bg: 'bg-red-500/20',
      fill: 'bg-red-500',
      text: 'text-red-400',
      glow: 'shadow-red-500/50',
    },
  };

  const sizeStyles = {
    small: {
      height: 'h-1.5',
      width: 'w-16',
      text: 'text-[10px]',
    },
    medium: {
      height: 'h-2',
      width: 'w-24',
      text: 'text-[11px]',
    },
    large: {
      height: 'h-3',
      width: 'w-32',
      text: 'text-[12px]',
    },
  };

  const colorSet = colors[status];
  const sizeSet = sizeStyles[size];

  return (
    <div className="flex items-center gap-2">
      {/* Progress bar */}
      <div className={`${sizeSet.width} ${sizeSet.height} ${colorSet.bg} rounded-full overflow-hidden`}>
        <div
          className={`${sizeSet.height} ${colorSet.fill} rounded-full transition-all duration-500 shadow-lg ${colorSet.glow}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      
      {/* Score text */}
      <span className={`${sizeSet.text} ${colorSet.text} font-medium`}>
        {score}%
      </span>
      
      {/* Pulse indicator */}
      <div className={`w-2 h-2 ${colorSet.fill} rounded-full ${status !== 'error' ? 'animate-pulse' : ''}`} />
    </div>
  );
}

/**
 * Compact confidence indicator for status bar
 */
export function ConfidenceIndicator({ 
  score, 
  status 
}: Pick<ConfidenceMeterProps, 'score' | 'status'>) {
  const colors = {
    healthy: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500',
  };

  return (
    <div className="flex items-center gap-1.5" title={`Confidence: ${score}%`}>
      <div className={`w-2 h-2 ${colors[status]} rounded-full animate-pulse`} />
      <span className="text-[11px]">{score}%</span>
    </div>
  );
}

export default ConfidenceMeter;
