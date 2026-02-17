// Status Item Component
// packages/ui/components/status-bar/src/status-item.tsx

import React from 'react';
import { clsx } from 'clsx';

export interface StatusItemProps {
  icon?: React.ReactNode;
  label?: string;
  value?: string | number;
  tooltip?: string;
  onClick?: () => void;
  variant?: 'default' | 'warning' | 'error' | 'success' | 'info';
  isLoading?: boolean;
  className?: string;
}

export function StatusItem({
  icon,
  label,
  value,
  tooltip,
  onClick,
  variant = 'default',
  isLoading,
  className,
}: StatusItemProps) {
  const variantClasses = {
    default: '',
    warning: 'text-status-item-warning',
    error: 'text-status-item-error',
    success: 'text-status-item-success',
    info: 'text-status-item-info',
  };

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      className={clsx(
        'titan-status-item',
        'flex items-center gap-1 px-1.5 py-0.5 rounded',
        onClick && 'hover:bg-status-bar-hover cursor-pointer',
        variantClasses[variant],
        className
      )}
      onClick={onClick}
      title={tooltip}
    >
      {isLoading ? (
        <LoadingSpinner />
      ) : icon ? (
        <span className="w-4 h-4 flex items-center justify-center">
          {icon}
        </span>
      ) : null}

      {label && (
        <span className="text-xs">{label}</span>
      )}

      {value !== undefined && (
        <span className="text-xs font-medium">{value}</span>
      )}
    </Component>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="w-3 h-3 animate-spin"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M6 1a5 5 0 0 1 5 5" />
    </svg>
  );
}

// Common status items
export function GitBranchStatus({
  branch,
  ahead,
  behind,
  isDirty,
  onClick,
}: {
  branch: string;
  ahead?: number;
  behind?: number;
  isDirty?: boolean;
  onClick?: () => void;
}) {
  return (
    <StatusItem
      icon={<GitBranchIcon />}
      label={branch}
      value={
        (ahead || behind)
          ? `${ahead ? `↑${ahead}` : ''}${behind ? `↓${behind}` : ''}`
          : isDirty
          ? '●'
          : undefined
      }
      variant={isDirty ? 'warning' : 'default'}
      onClick={onClick}
      tooltip={`Git branch: ${branch}`}
    />
  );
}

export function LanguageStatus({
  language,
  onClick,
}: {
  language: string;
  onClick?: () => void;
}) {
  return (
    <StatusItem
      label={language}
      onClick={onClick}
      tooltip={`Language mode: ${language}`}
    />
  );
}

export function EncodingStatus({
  encoding,
  onClick,
}: {
  encoding: string;
  onClick?: () => void;
}) {
  return (
    <StatusItem
      label={encoding}
      onClick={onClick}
      tooltip={`File encoding: ${encoding}`}
    />
  );
}

export function LineEndingStatus({
  lineEnding,
  onClick,
}: {
  lineEnding: 'LF' | 'CRLF';
  onClick?: () => void;
}) {
  return (
    <StatusItem
      label={lineEnding}
      onClick={onClick}
      tooltip={`Line ending: ${lineEnding}`}
    />
  );
}

export function CursorPositionStatus({
  line,
  column,
  selected,
  onClick,
}: {
  line: number;
  column: number;
  selected?: number;
  onClick?: () => void;
}) {
  return (
    <StatusItem
      label={`Ln ${line}, Col ${column}`}
      value={selected ? `(${selected} selected)` : undefined}
      onClick={onClick}
      tooltip={`Line ${line}, Column ${column}`}
    />
  );
}

export function IndentationStatus({
  type,
  size,
  onClick,
}: {
  type: 'spaces' | 'tabs';
  size: number;
  onClick?: () => void;
}) {
  return (
    <StatusItem
      label={type === 'spaces' ? `Spaces: ${size}` : `Tab Size: ${size}`}
      onClick={onClick}
      tooltip={`Indentation: ${size} ${type}`}
    />
  );
}

export function ProblemsStatus({
  errors,
  warnings,
  onClick,
}: {
  errors: number;
  warnings: number;
  onClick?: () => void;
}) {
  return (
    <StatusItem
      icon={<ProblemsIcon errors={errors} warnings={warnings} />}
      value={`${errors} ${warnings}`}
      variant={errors > 0 ? 'error' : warnings > 0 ? 'warning' : 'default'}
      onClick={onClick}
      tooltip={`${errors} errors, ${warnings} warnings`}
    />
  );
}

export function NotificationsStatus({
  count,
  onClick,
}: {
  count: number;
  onClick?: () => void;
}) {
  return (
    <StatusItem
      icon={<BellIcon />}
      value={count > 0 ? String(count) : undefined}
      variant={count > 0 ? 'info' : 'default'}
      onClick={onClick}
      tooltip={`${count} notifications`}
    />
  );
}

export function SyncStatus({
  status,
  onClick,
}: {
  status: 'synced' | 'syncing' | 'error' | 'offline';
  onClick?: () => void;
}) {
  const config = {
    synced: { icon: <SyncIcon />, variant: 'success' as const, tooltip: 'Settings synced' },
    syncing: { icon: <SyncIcon />, variant: 'info' as const, tooltip: 'Syncing settings...' },
    error: { icon: <SyncErrorIcon />, variant: 'error' as const, tooltip: 'Sync error' },
    offline: { icon: <OfflineIcon />, variant: 'default' as const, tooltip: 'Offline' },
  };

  const { icon, variant, tooltip } = config[status];

  return (
    <StatusItem
      icon={icon}
      variant={variant}
      isLoading={status === 'syncing'}
      onClick={onClick}
      tooltip={tooltip}
    />
  );
}

// Icons
function GitBranchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 4.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0zM5.5 2a2.5 2.5 0 0 0-.405 4.966c-.028.26-.037.53-.026.804.014.344.042.685.083 1.02a2.5 2.5 0 1 0 1.695.013c.054-.42.09-.846.102-1.276a6.542 6.542 0 0 1 2.05 1.42 2.5 2.5 0 1 0 1.501-.085c-.29-.392-.634-.75-1.027-1.064a8.39 8.39 0 0 0-2.17-1.325A2.5 2.5 0 0 0 5.5 2z" />
    </svg>
  );
}

function ProblemsIcon({ errors, warnings }: { errors: number; warnings: number }) {
  if (errors > 0) {
    return (
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-2a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm-1-3h2v2H7v-2zm0-6h2v5H7V4z" />
      </svg>
    );
  }
  if (warnings > 0) {
    return (
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-2a5 5 0 1 0 0-10 5 5 0 0 0 0 10z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zM8 1.918l-.797.161A4.002 4.002 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4.002 4.002 0 0 0-3.203-3.92L8 1.917zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 6.88 3 6c0-2.42 1.72-4.44 4.005-4.901a1 1 0 1 1 1.99 0A5.002 5.002 0 0 1 13 6c0 .88.32 4.2 1.22 6z" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
      <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
    </svg>
  );
}

function SyncErrorIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-2a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm-1-3h2v2H7v-2zm0-6h2v5H7V4z" />
    </svg>
  );
}

function OfflineIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-2a5 5 0 1 0 0-10 5 5 0 0 0 0 10z" />
      <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
    </svg>
  );
}
