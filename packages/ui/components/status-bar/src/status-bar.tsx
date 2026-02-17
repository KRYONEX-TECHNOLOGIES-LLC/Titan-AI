// Status Bar Component
// packages/ui/components/status-bar/src/status-bar.tsx

import React from 'react';
import { clsx } from 'clsx';

export interface StatusBarProps {
  leftItems?: React.ReactNode;
  rightItems?: React.ReactNode;
  centerItems?: React.ReactNode;
  variant?: 'default' | 'warning' | 'error' | 'debugging';
  className?: string;
}

export function StatusBar({
  leftItems,
  rightItems,
  centerItems,
  variant = 'default',
  className,
}: StatusBarProps) {
  const variantClasses = {
    default: 'bg-status-bar-background',
    warning: 'bg-status-bar-warning',
    error: 'bg-status-bar-error',
    debugging: 'bg-status-bar-debugging',
  };

  return (
    <div
      className={clsx(
        'titan-status-bar',
        'flex items-center justify-between h-6 px-2',
        'text-status-bar-foreground text-xs',
        variantClasses[variant],
        className
      )}
    >
      {/* Left section */}
      <div className="titan-status-bar-left flex items-center gap-1 min-w-0">
        {leftItems}
      </div>

      {/* Center section */}
      {centerItems && (
        <div className="titan-status-bar-center flex items-center gap-1 mx-4">
          {centerItems}
        </div>
      )}

      {/* Right section */}
      <div className="titan-status-bar-right flex items-center gap-1 min-w-0">
        {rightItems}
      </div>
    </div>
  );
}

export interface StatusBarGroupProps {
  children: React.ReactNode;
  className?: string;
}

export function StatusBarGroup({ children, className }: StatusBarGroupProps) {
  return (
    <div
      className={clsx(
        'titan-status-bar-group',
        'flex items-center gap-0.5',
        className
      )}
    >
      {children}
    </div>
  );
}

export interface StatusBarDividerProps {
  className?: string;
}

export function StatusBarDivider({ className }: StatusBarDividerProps) {
  return (
    <div
      className={clsx(
        'titan-status-bar-divider',
        'w-px h-4 bg-status-bar-divider mx-1',
        className
      )}
    />
  );
}
