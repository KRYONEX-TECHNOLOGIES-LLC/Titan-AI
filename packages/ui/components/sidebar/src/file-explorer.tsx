// File Explorer Component
// packages/ui/components/sidebar/src/file-explorer.tsx

import React, { useState, useCallback } from 'react';
import { clsx } from 'clsx';

export interface FileExplorerProps {
  rootPath: string;
  items: FileSystemItem[];
  selectedPath?: string;
  expandedPaths?: Set<string>;
  onSelect?: (item: FileSystemItem) => void;
  onOpen?: (item: FileSystemItem) => void;
  onContextMenu?: (item: FileSystemItem, e: React.MouseEvent) => void;
  onExpand?: (path: string) => void;
  onCollapse?: (path: string) => void;
  onDrop?: (source: FileSystemItem, target: FileSystemItem) => void;
  className?: string;
}

export interface FileSystemItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileSystemItem[];
  isSymlink?: boolean;
  isHidden?: boolean;
  size?: number;
  modified?: Date;
  icon?: React.ReactNode;
}

export function FileExplorer({
  rootPath,
  items,
  selectedPath,
  expandedPaths = new Set(),
  onSelect,
  onOpen,
  onContextMenu,
  onExpand,
  onCollapse,
  onDrop,
  className,
}: FileExplorerProps) {
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(path);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverPath(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, target: FileSystemItem) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);
    
    const sourcePath = e.dataTransfer.getData('text/plain');
    const findItem = (items: FileSystemItem[], path: string): FileSystemItem | null => {
      for (const item of items) {
        if (item.path === path) return item;
        if (item.children) {
          const found = findItem(item.children, path);
          if (found) return found;
        }
      }
      return null;
    };

    const source = findItem(items, sourcePath);
    if (source && source.path !== target.path) {
      onDrop?.(source, target);
    }
  }, [items, onDrop]);

  return (
    <div
      className={clsx(
        'titan-file-explorer',
        'flex flex-col h-full overflow-auto',
        'text-sm',
        className
      )}
    >
      <FileExplorerTree
        items={items}
        depth={0}
        selectedPath={selectedPath}
        expandedPaths={expandedPaths}
        dragOverPath={dragOverPath}
        onSelect={onSelect}
        onOpen={onOpen}
        onContextMenu={onContextMenu}
        onExpand={onExpand}
        onCollapse={onCollapse}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />
    </div>
  );
}

interface FileExplorerTreeProps {
  items: FileSystemItem[];
  depth: number;
  selectedPath?: string;
  expandedPaths: Set<string>;
  dragOverPath: string | null;
  onSelect?: (item: FileSystemItem) => void;
  onOpen?: (item: FileSystemItem) => void;
  onContextMenu?: (item: FileSystemItem, e: React.MouseEvent) => void;
  onExpand?: (path: string) => void;
  onCollapse?: (path: string) => void;
  onDragOver: (e: React.DragEvent, path: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, target: FileSystemItem) => void;
}

function FileExplorerTree({
  items,
  depth,
  selectedPath,
  expandedPaths,
  dragOverPath,
  onSelect,
  onOpen,
  onContextMenu,
  onExpand,
  onCollapse,
  onDragOver,
  onDragLeave,
  onDrop,
}: FileExplorerTreeProps) {
  return (
    <div className="titan-file-explorer-tree">
      {items.map((item) => (
        <FileExplorerItem
          key={item.path}
          item={item}
          depth={depth}
          isSelected={selectedPath === item.path}
          isExpanded={expandedPaths.has(item.path)}
          isDragOver={dragOverPath === item.path}
          expandedPaths={expandedPaths}
          selectedPath={selectedPath}
          dragOverPath={dragOverPath}
          onSelect={onSelect}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
          onExpand={onExpand}
          onCollapse={onCollapse}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        />
      ))}
    </div>
  );
}

interface FileExplorerItemProps {
  item: FileSystemItem;
  depth: number;
  isSelected: boolean;
  isExpanded: boolean;
  isDragOver: boolean;
  expandedPaths: Set<string>;
  selectedPath?: string;
  dragOverPath: string | null;
  onSelect?: (item: FileSystemItem) => void;
  onOpen?: (item: FileSystemItem) => void;
  onContextMenu?: (item: FileSystemItem, e: React.MouseEvent) => void;
  onExpand?: (path: string) => void;
  onCollapse?: (path: string) => void;
  onDragOver: (e: React.DragEvent, path: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, target: FileSystemItem) => void;
}

function FileExplorerItem({
  item,
  depth,
  isSelected,
  isExpanded,
  isDragOver,
  expandedPaths,
  selectedPath,
  dragOverPath,
  onSelect,
  onOpen,
  onContextMenu,
  onExpand,
  onCollapse,
  onDragOver,
  onDragLeave,
  onDrop,
}: FileExplorerItemProps) {
  const handleClick = () => {
    onSelect?.(item);
    if (item.type === 'directory') {
      if (isExpanded) {
        onCollapse?.(item.path);
      } else {
        onExpand?.(item.path);
      }
    }
  };

  const handleDoubleClick = () => {
    onOpen?.(item);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', item.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="titan-file-explorer-item-container">
      <div
        className={clsx(
          'titan-file-explorer-item',
          'flex items-center gap-1 py-0.5 px-1 cursor-pointer',
          'hover:bg-file-explorer-hover',
          isSelected && 'bg-file-explorer-selected',
          isDragOver && item.type === 'directory' && 'bg-file-explorer-drop-target',
          item.isHidden && 'opacity-60'
        )}
        style={{ paddingLeft: depth * 16 + 4 }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => onContextMenu?.(item, e)}
        draggable
        onDragStart={handleDragStart}
        onDragOver={(e) => onDragOver(e, item.path)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, item)}
      >
        {item.type === 'directory' && (
          <svg
            className={clsx(
              'w-3 h-3 flex-shrink-0 transition-transform',
              isExpanded && 'rotate-90'
            )}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M4 2L8 6L4 10" />
          </svg>
        )}
        
        <span className="titan-file-explorer-icon w-4 h-4 flex-shrink-0">
          {item.icon || <DefaultIcon type={item.type} isExpanded={isExpanded} />}
        </span>
        
        <span className="titan-file-explorer-name truncate text-xs">
          {item.name}
        </span>
      </div>

      {item.type === 'directory' && isExpanded && item.children && (
        <FileExplorerTree
          items={item.children}
          depth={depth + 1}
          selectedPath={selectedPath}
          expandedPaths={expandedPaths}
          dragOverPath={dragOverPath}
          onSelect={onSelect}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
          onExpand={onExpand}
          onCollapse={onCollapse}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        />
      )}
    </div>
  );
}

function DefaultIcon({ type, isExpanded }: { type: 'file' | 'directory'; isExpanded?: boolean }) {
  if (type === 'directory') {
    return isExpanded ? (
      <svg viewBox="0 0 16 16" fill="currentColor" className="text-icon-folder">
        <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l.872.871c.14.141.332.22.531.22H13.5A1.5 1.5 0 0 1 15 5v7.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9zM2.5 3a.5.5 0 0 0-.5.5V6h12v-.5a.5.5 0 0 0-.5-.5H8.842a1.5 1.5 0 0 1-1.06-.44l-.872-.871a.5.5 0 0 0-.354-.147H2.5z" />
      </svg>
    ) : (
      <svg viewBox="0 0 16 16" fill="currentColor" className="text-icon-folder">
        <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l.872.871c.14.141.332.22.531.22H13.5A1.5 1.5 0 0 1 15 5v7.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="text-icon-file">
      <path d="M4 0h5.293A1 1 0 0 1 10 .293L13.707 4a1 1 0 0 1 .293.707V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z" />
    </svg>
  );
}
