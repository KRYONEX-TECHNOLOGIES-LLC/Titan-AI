import * as React from 'react';
import { cn } from '../lib/utils';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileText,
} from 'lucide-react';

export interface FileTreeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
  isExpanded?: boolean;
  isSelected?: boolean;
  icon?: React.ReactNode;
}

export interface FileTreeProps extends React.HTMLAttributes<HTMLDivElement> {
  nodes: FileTreeNode[];
  onSelect?: (node: FileTreeNode) => void;
  onToggle?: (node: FileTreeNode) => void;
  selectedId?: string;
}

const FileTree = React.forwardRef<HTMLDivElement, FileTreeProps>(
  ({ className, nodes, onSelect, onToggle, selectedId, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('text-sm', className)} {...props}>
        {nodes.map((node) => (
          <FileTreeItem
            key={node.id}
            node={node}
            depth={0}
            onSelect={onSelect}
            onToggle={onToggle}
            selectedId={selectedId}
          />
        ))}
      </div>
    );
  }
);
FileTree.displayName = 'FileTree';

interface FileTreeItemProps {
  node: FileTreeNode;
  depth: number;
  onSelect?: (node: FileTreeNode) => void;
  onToggle?: (node: FileTreeNode) => void;
  selectedId?: string;
}

function FileTreeItem({
  node,
  depth,
  onSelect,
  onToggle,
  selectedId,
}: FileTreeItemProps) {
  const isFolder = node.type === 'folder';
  const isSelected = node.id === selectedId;
  const isExpanded = node.isExpanded ?? false;

  const handleClick = () => {
    if (isFolder) {
      onToggle?.(node);
    } else {
      onSelect?.(node);
    }
  };

  const icon = node.icon || getFileIcon(node.name, node.type, isExpanded);

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-zinc-800/50 rounded-sm',
          isSelected && 'bg-zinc-800'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        {/* Expand arrow for folders */}
        {isFolder ? (
          <span className="w-4 h-4 flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
            )}
          </span>
        ) : (
          <span className="w-4" />
        )}

        {/* Icon */}
        <span className="w-4 h-4 flex items-center justify-center">{icon}</span>

        {/* Name */}
        <span
          className={cn(
            'text-zinc-300 truncate',
            isSelected && 'text-white'
          )}
        >
          {node.name}
        </span>
      </div>

      {/* Children */}
      {isFolder && isExpanded && node.children && (
        <>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              onToggle={onToggle}
              selectedId={selectedId}
            />
          ))}
        </>
      )}
    </>
  );
}

function getFileIcon(name: string, type: string, isExpanded: boolean) {
  if (type === 'folder') {
    return isExpanded ? (
      <FolderOpen className="h-4 w-4 text-yellow-500" />
    ) : (
      <Folder className="h-4 w-4 text-yellow-500" />
    );
  }

  const ext = name.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return <FileCode className="h-4 w-4 text-blue-400" />;
    case 'json':
      return <FileJson className="h-4 w-4 text-yellow-400" />;
    case 'md':
    case 'txt':
      return <FileText className="h-4 w-4 text-zinc-400" />;
    case 'rs':
      return <FileCode className="h-4 w-4 text-orange-400" />;
    case 'py':
      return <FileCode className="h-4 w-4 text-green-400" />;
    default:
      return <File className="h-4 w-4 text-zinc-400" />;
  }
}

export { FileTree };
