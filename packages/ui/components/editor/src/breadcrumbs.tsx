// Breadcrumbs Component
// packages/ui/components/editor/src/breadcrumbs.tsx

import React from 'react';
import { clsx } from 'clsx';

export interface BreadcrumbItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  type?: 'file' | 'folder' | 'symbol' | 'scope';
  onClick?: () => void;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  separator?: React.ReactNode;
  className?: string;
  onItemClick?: (item: BreadcrumbItem) => void;
}

export function Breadcrumbs({
  items,
  separator = <ChevronRight />,
  className,
  onItemClick,
}: BreadcrumbsProps) {
  return (
    <nav
      className={clsx(
        'titan-breadcrumbs',
        'flex items-center gap-0.5 px-3 py-1',
        'bg-breadcrumb-background text-breadcrumb-foreground',
        'text-xs overflow-x-auto',
        'scrollbar-none',
        className
      )}
      aria-label="Breadcrumb"
    >
      {items.map((item, index) => (
        <React.Fragment key={item.id}>
          {index > 0 && (
            <span className="titan-breadcrumb-separator text-breadcrumb-separator opacity-50 mx-0.5">
              {separator}
            </span>
          )}
          <BreadcrumbButton
            item={item}
            isLast={index === items.length - 1}
            onClick={() => {
              item.onClick?.();
              onItemClick?.(item);
            }}
          />
        </React.Fragment>
      ))}
    </nav>
  );
}

interface BreadcrumbButtonProps {
  item: BreadcrumbItem;
  isLast: boolean;
  onClick: () => void;
}

function BreadcrumbButton({ item, isLast, onClick }: BreadcrumbButtonProps) {
  return (
    <button
      className={clsx(
        'titan-breadcrumb-item',
        'inline-flex items-center gap-1 px-1 py-0.5 rounded',
        'hover:bg-breadcrumb-hover transition-colors',
        isLast ? 'text-breadcrumb-active font-medium' : 'text-breadcrumb-foreground',
      )}
      onClick={onClick}
      aria-current={isLast ? 'page' : undefined}
    >
      {item.icon && (
        <span className={clsx(
          'titan-breadcrumb-icon w-4 h-4 flex-shrink-0',
          getIconColor(item.type)
        )}>
          {item.icon}
        </span>
      )}
      <span className="titan-breadcrumb-label truncate max-w-[150px]">
        {item.label}
      </span>
    </button>
  );
}

function getIconColor(type?: BreadcrumbItem['type']): string {
  switch (type) {
    case 'file':
      return 'text-icon-file';
    case 'folder':
      return 'text-icon-folder';
    case 'symbol':
      return 'text-icon-symbol';
    case 'scope':
      return 'text-icon-scope';
    default:
      return '';
  }
}

function ChevronRight() {
  return (
    <svg
      className="w-3 h-3"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M4 2L8 6L4 10" />
    </svg>
  );
}

export interface SymbolBreadcrumbsProps {
  filePath: string;
  symbols: SymbolInfo[];
  activeSymbolId?: string;
  onSymbolSelect?: (symbol: SymbolInfo) => void;
  className?: string;
}

export interface SymbolInfo {
  id: string;
  name: string;
  kind: 'class' | 'function' | 'method' | 'property' | 'variable' | 'interface' | 'type';
  range?: {
    startLine: number;
    endLine: number;
  };
}

export function SymbolBreadcrumbs({
  filePath,
  symbols,
  activeSymbolId,
  onSymbolSelect,
  className,
}: SymbolBreadcrumbsProps) {
  const pathParts = filePath.split(/[/\\]/);
  const fileName = pathParts.pop() || '';
  const folderPath = pathParts.slice(-2);

  const items: BreadcrumbItem[] = [
    ...folderPath.map((folder, i) => ({
      id: `folder-${i}`,
      label: folder,
      type: 'folder' as const,
      icon: <FolderIcon />,
    })),
    {
      id: 'file',
      label: fileName,
      type: 'file' as const,
      icon: <FileIcon />,
    },
    ...symbols.map((symbol) => ({
      id: symbol.id,
      label: symbol.name,
      type: 'symbol' as const,
      icon: getSymbolIcon(symbol.kind),
      onClick: () => onSymbolSelect?.(symbol),
    })),
  ];

  return (
    <Breadcrumbs
      items={items}
      className={className}
    />
  );
}

function getSymbolIcon(kind: SymbolInfo['kind']): React.ReactNode {
  const iconClass = 'w-4 h-4';
  
  switch (kind) {
    case 'class':
      return <ClassIcon className={iconClass} />;
    case 'function':
      return <FunctionIcon className={iconClass} />;
    case 'method':
      return <MethodIcon className={iconClass} />;
    case 'interface':
      return <InterfaceIcon className={iconClass} />;
    default:
      return <SymbolIcon className={iconClass} />;
  }
}

function FolderIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l.872.871c.14.141.332.22.531.22H13.5A1.5 1.5 0 0 1 15 5v7.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 0h5.293A1 1 0 0 1 10 .293L13.707 4a1 1 0 0 1 .293.707V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z" />
    </svg>
  );
}

function ClassIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 4a.5.5 0 0 1 .5.5V6a.5.5 0 0 1-1 0V4.5A.5.5 0 0 1 8 4zM3.732 5.732a.5.5 0 0 1 .707 0l.915.914a.5.5 0 1 1-.708.708l-.914-.915a.5.5 0 0 1 0-.707zM2 10a.5.5 0 0 1 .5-.5h1.586a.5.5 0 0 1 0 1H2.5A.5.5 0 0 1 2 10zm9.5 0a.5.5 0 0 1 .5-.5h1.5a.5.5 0 0 1 0 1H12a.5.5 0 0 1-.5-.5zm.754-4.246a.389.389 0 0 0-.527-.02L7.547 9.31a.91.91 0 1 0 1.302 1.258l3.434-4.297a.389.389 0 0 0-.029-.518z" />
    </svg>
  );
}

function FunctionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <text x="3" y="12" fontSize="10" fontFamily="monospace">fn</text>
    </svg>
  );
}

function MethodIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M6 10.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z" />
    </svg>
  );
}

function InterfaceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <text x="4" y="12" fontSize="10" fontFamily="monospace" fontWeight="bold">I</text>
    </svg>
  );
}

function SymbolIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
    </svg>
  );
}
