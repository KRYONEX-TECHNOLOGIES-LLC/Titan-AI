// File Tree Component
// packages/ui/components/sidebar/src/file-tree.tsx

import React, { useMemo } from 'react';
import { clsx } from 'clsx';

export interface TreeNode {
  id: string;
  label: string;
  icon?: React.ReactNode;
  children?: TreeNode[];
  isExpanded?: boolean;
  isSelected?: boolean;
  isDisabled?: boolean;
  data?: unknown;
}

export interface FileTreeProps {
  nodes: TreeNode[];
  selectedId?: string;
  expandedIds?: Set<string>;
  onSelect?: (node: TreeNode) => void;
  onExpand?: (id: string) => void;
  onCollapse?: (id: string) => void;
  renderNode?: (node: TreeNode, depth: number) => React.ReactNode;
  className?: string;
}

export function FileTree({
  nodes,
  selectedId,
  expandedIds = new Set(),
  onSelect,
  onExpand,
  onCollapse,
  renderNode,
  className,
}: FileTreeProps) {
  return (
    <div
      className={clsx(
        'titan-file-tree',
        'flex flex-col',
        className
      )}
      role="tree"
    >
      <TreeLevel
        nodes={nodes}
        depth={0}
        selectedId={selectedId}
        expandedIds={expandedIds}
        onSelect={onSelect}
        onExpand={onExpand}
        onCollapse={onCollapse}
        renderNode={renderNode}
      />
    </div>
  );
}

interface TreeLevelProps {
  nodes: TreeNode[];
  depth: number;
  selectedId?: string;
  expandedIds: Set<string>;
  onSelect?: (node: TreeNode) => void;
  onExpand?: (id: string) => void;
  onCollapse?: (id: string) => void;
  renderNode?: (node: TreeNode, depth: number) => React.ReactNode;
}

function TreeLevel({
  nodes,
  depth,
  selectedId,
  expandedIds,
  onSelect,
  onExpand,
  onCollapse,
  renderNode,
}: TreeLevelProps) {
  return (
    <ul className="titan-tree-level list-none m-0 p-0" role="group">
      {nodes.map((node) => {
        const isExpanded = expandedIds.has(node.id);
        const hasChildren = node.children && node.children.length > 0;

        return (
          <li
            key={node.id}
            className="titan-tree-item"
            role="treeitem"
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-selected={node.id === selectedId}
          >
            {renderNode ? (
              renderNode(node, depth)
            ) : (
              <TreeNodeContent
                node={node}
                depth={depth}
                isExpanded={isExpanded}
                isSelected={node.id === selectedId}
                hasChildren={hasChildren}
                onSelect={onSelect}
                onExpand={onExpand}
                onCollapse={onCollapse}
              />
            )}
            
            {hasChildren && isExpanded && (
              <TreeLevel
                nodes={node.children!}
                depth={depth + 1}
                selectedId={selectedId}
                expandedIds={expandedIds}
                onSelect={onSelect}
                onExpand={onExpand}
                onCollapse={onCollapse}
                renderNode={renderNode}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface TreeNodeContentProps {
  node: TreeNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  hasChildren: boolean;
  onSelect?: (node: TreeNode) => void;
  onExpand?: (id: string) => void;
  onCollapse?: (id: string) => void;
}

function TreeNodeContent({
  node,
  depth,
  isExpanded,
  isSelected,
  hasChildren,
  onSelect,
  onExpand,
  onCollapse,
}: TreeNodeContentProps) {
  const handleClick = () => {
    if (node.isDisabled) return;
    onSelect?.(node);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExpanded) {
      onCollapse?.(node.id);
    } else {
      onExpand?.(node.id);
    }
  };

  return (
    <div
      className={clsx(
        'titan-tree-node',
        'flex items-center gap-1 py-0.5 px-1 cursor-pointer',
        'hover:bg-tree-hover transition-colors',
        isSelected && 'bg-tree-selected',
        node.isDisabled && 'opacity-50 cursor-not-allowed'
      )}
      style={{ paddingLeft: depth * 12 + 4 }}
      onClick={handleClick}
    >
      {hasChildren ? (
        <button
          className="titan-tree-toggle w-4 h-4 flex items-center justify-center"
          onClick={handleToggle}
        >
          <svg
            className={clsx(
              'w-3 h-3 transition-transform',
              isExpanded && 'rotate-90'
            )}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M4 2L8 6L4 10" />
          </svg>
        </button>
      ) : (
        <span className="w-4" />
      )}

      {node.icon && (
        <span className="titan-tree-icon w-4 h-4 flex-shrink-0">
          {node.icon}
        </span>
      )}

      <span className="titan-tree-label truncate text-xs">
        {node.label}
      </span>
    </div>
  );
}

export interface VirtualFileTreeProps extends Omit<FileTreeProps, 'nodes'> {
  nodes: TreeNode[];
  height: number;
  itemHeight?: number;
}

export function VirtualFileTree({
  nodes,
  height,
  itemHeight = 22,
  selectedId,
  expandedIds = new Set(),
  onSelect,
  onExpand,
  onCollapse,
  className,
}: VirtualFileTreeProps) {
  // Flatten tree for virtualization
  const flatNodes = useMemo(() => {
    const result: { node: TreeNode; depth: number }[] = [];
    
    const flatten = (nodes: TreeNode[], depth: number) => {
      for (const node of nodes) {
        result.push({ node, depth });
        if (node.children && expandedIds.has(node.id)) {
          flatten(node.children, depth + 1);
        }
      }
    };
    
    flatten(nodes, 0);
    return result;
  }, [nodes, expandedIds]);

  const [scrollTop, setScrollTop] = React.useState(0);
  
  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(
    startIndex + Math.ceil(height / itemHeight) + 1,
    flatNodes.length
  );

  const visibleNodes = flatNodes.slice(startIndex, endIndex);
  const totalHeight = flatNodes.length * itemHeight;

  return (
    <div
      className={clsx(
        'titan-virtual-file-tree overflow-auto',
        className
      )}
      style={{ height }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleNodes.map(({ node, depth }, index) => {
          const isExpanded = expandedIds.has(node.id);
          const hasChildren = node.children && node.children.length > 0;

          return (
            <div
              key={node.id}
              style={{
                position: 'absolute',
                top: (startIndex + index) * itemHeight,
                left: 0,
                right: 0,
                height: itemHeight,
              }}
            >
              <TreeNodeContent
                node={node}
                depth={depth}
                isExpanded={isExpanded}
                isSelected={node.id === selectedId}
                hasChildren={!!hasChildren}
                onSelect={onSelect}
                onExpand={onExpand}
                onCollapse={onCollapse}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
