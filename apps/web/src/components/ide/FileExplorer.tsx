'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useFileStore, type FileNode } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { executeCommand } from '@/lib/ide/command-registry';
import { isElectron, electronAPI } from '@/lib/electron';

// ─── Git Status Hook ─────────────────────────────────────────────────────────
function useGitStatus(workspacePath: string | null) {
  const [gitStatus, setGitStatus] = useState<{
    modified: Set<string>;
    staged: Set<string>;
    untracked: Set<string>;
    deleted: Set<string>;
  }>({ modified: new Set(), staged: new Set(), untracked: new Set(), deleted: new Set() });

  useEffect(() => {
    if (!workspacePath) return;

    const fetchStatus = async () => {
      try {
        if (isElectron && electronAPI) {
          const data = await electronAPI.git.status(workspacePath);
          const modified = new Set<string>();
          const staged = new Set<string>();
          const untracked = new Set<string>();
          const deleted = new Set<string>();

          for (const f of data.files) {
            if (f.index === 'M' || f.index === 'A' || f.index === 'R') staged.add(f.path);
            if (f.working_dir === 'M') modified.add(f.path);
            if (f.working_dir === 'D') deleted.add(f.path);
            if (f.index === '?' && f.working_dir === '?') untracked.add(f.path);
          }
          setGitStatus({ modified, staged, untracked, deleted });
        } else {
          const res = await fetch(`/api/git/status?path=${encodeURIComponent(workspacePath)}`);
          if (!res.ok) return;
          const data = await res.json() as {
            modified?: string[];
            staged?: string[];
            untracked?: string[];
            deleted?: string[];
          };
          setGitStatus({
            modified: new Set(data.modified ?? []),
            staged: new Set(data.staged ?? []),
            untracked: new Set(data.untracked ?? []),
            deleted: new Set(data.deleted ?? []),
          });
        }
      } catch { /* ignore */ }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [workspacePath]);

  return gitStatus;
}

// ─── Git status badge ────────────────────────────────────────────────────────
function GitBadge({ status }: { status: 'M' | 'A' | 'U' | 'D' | null }) {
  if (!status) return null;
  const colors: Record<string, string> = { M: '#e3b341', A: '#3fb950', U: '#808080', D: '#f85149' };
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color: colors[status], marginLeft: 'auto', paddingLeft: 4 }}>
      {status}
    </span>
  );
}

// ─── File icon maps ───────────────────────────────────────────────────────────
const EXT_ICONS: Record<string, { icon: string; color: string }> = {
  ts: { icon: 'TS', color: '#3178c6' },
  tsx: { icon: 'TSX', color: '#3178c6' },
  js: { icon: 'JS', color: '#f7df1e' },
  jsx: { icon: 'JSX', color: '#f7df1e' },
  py: { icon: 'PY', color: '#3572a5' },
  rs: { icon: 'RS', color: '#dea584' },
  go: { icon: 'GO', color: '#00add8' },
  json: { icon: '{}', color: '#fbc02d' },
  md: { icon: 'MD', color: '#ffffff' },
  css: { icon: 'CSS', color: '#264de4' },
  scss: { icon: 'SCSS', color: '#c6538c' },
  html: { icon: 'HTML', color: '#e34f26' },
  env: { icon: 'ENV', color: '#3fb950' },
  toml: { icon: 'TOML', color: '#9c4221' },
  yaml: { icon: 'YAML', color: '#cb171e' },
  yml: { icon: 'YAML', color: '#cb171e' },
  sh: { icon: 'SH', color: '#89e051' },
  sql: { icon: 'SQL', color: '#e38c00' },
  svg: { icon: 'SVG', color: '#ffb13b' },
  png: { icon: 'PNG', color: '#a8d8ea' },
  jpg: { icon: 'JPG', color: '#a8d8ea' },
  gif: { icon: 'GIF', color: '#a8d8ea' },
  lock: { icon: '🔒', color: '#6c7086' },
  gitignore: { icon: 'GIT', color: '#f14e32' },
};

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (name === '.gitignore') return { icon: 'GIT', color: '#f14e32' };
  if (name === '.env') return { icon: 'ENV', color: '#3fb950' };
  return EXT_ICONS[ext] ?? { icon: ext.slice(0, 3).toUpperCase() || 'TXT', color: '#6c7086' };
}

// ─── Context Menu ─────────────────────────────────────────────────────────────
interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode;
}

function ContextMenu({ menu, onClose }: { menu: ContextMenuState; onClose: () => void }) {
  const fileStore = useFileStore();
  const items = [
    menu.node.type === 'file'
      ? { label: 'Open File', action: () => { /* handled by click */ } }
      : null,
    { label: 'Rename', action: () => { fileStore.setRenamingPath(menu.node.path); onClose(); } },
    { label: 'Copy', action: () => { fileStore.copyPath(menu.node.path); onClose(); } },
    { label: 'Cut', action: () => { fileStore.cutPath(menu.node.path); onClose(); } },
    menu.node.type === 'folder'
      ? { label: 'Paste', action: () => { fileStore.paste(menu.node.path); onClose(); } }
      : null,
    { separator: true },
    menu.node.type === 'folder'
      ? { label: 'New File here', action: () => { fileStore.setNewItemParent(menu.node.path, 'file'); onClose(); } }
      : null,
    menu.node.type === 'folder'
      ? { label: 'New Folder here', action: () => { fileStore.setNewItemParent(menu.node.path, 'folder'); onClose(); } }
      : null,
    { separator: true },
    { label: 'Delete', danger: true, action: async () => {
      await fetch('/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'deleteFile', path: menu.node.path }) });
      fileStore.refreshFileTree();
      onClose();
    }},
    { label: 'Copy Path', action: () => { navigator.clipboard.writeText(menu.node.path); onClose(); } },
    { label: 'Copy Relative Path', action: () => { navigator.clipboard.writeText(menu.node.name); onClose(); } },
  ].filter(Boolean) as ({ label: string; action: () => void; danger?: boolean } | { separator: true })[];

  return (
    <div
      style={{
        position: 'fixed',
        top: menu.y,
        left: menu.x,
        zIndex: 5000,
        minWidth: 180,
        background: '#1e1e2e',
        border: '1px solid #313244',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        padding: '4px 0',
        userSelect: 'none',
      }}
      onMouseLeave={onClose}
    >
      {items.map((item, i) => {
        if ('separator' in item) return <div key={i} style={{ height: 1, background: '#313244', margin: '4px 0' }} />;
        return (
          <button
            key={i}
            onClick={item.action}
            style={{
              display: 'block',
              width: '100%',
              padding: '5px 14px',
              background: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 12,
              color: item.danger ? '#f38ba8' : '#cdd6f4',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#313244'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── FileTree Node ────────────────────────────────────────────────────────────
function FileTreeNode({
  node,
  depth,
  onContextMenu,
  gitStatus,
  onFileOpen,
}: {
  node: FileNode;
  depth: number;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  gitStatus?: { modified: Set<string>; staged: Set<string>; untracked: Set<string>; deleted: Set<string> };
  onFileOpen?: (name: string, path: string, content: string, language: string) => void;
}) {
  const { expandedPaths, selectedPath, toggleExpand, selectPath, renamingPath, setRenamingPath, refreshFileTree } = useFileStore();
  const { openTab, fileContents } = useEditorStore();
  const [renameVal, setRenameVal] = useState(node.name);
  const renameRef = useRef<HTMLInputElement>(null);
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const isRenaming = renamingPath === node.path;
  const { icon, color } = getFileIcon(node.name);
  const indent = depth * 12 + 8;

  const openFile = useCallback((content: string, language: string) => {
    if (onFileOpen) {
      onFileOpen(node.name, node.path, content, language);
    } else {
      openTab({ name: node.name, path: node.path, icon, color, modified: false, language });
      useEditorStore.getState().loadFileContents({ [node.name]: content, [node.path]: content });
    }
  }, [node.name, node.path, icon, color, onFileOpen, openTab]);

  const handleClick = useCallback(() => {
    selectPath(node.path);
    if (node.type === 'folder') {
      toggleExpand(node.path);
    } else {
      const ext = node.name.split('.').pop()?.toLowerCase() ?? '';
      const langMap: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', py: 'python', rs: 'rust', go: 'go', json: 'json', md: 'markdown', css: 'css', html: 'html' };
      const language = langMap[ext] ?? 'plaintext';

      const existingContent = fileContents[node.name] ?? fileContents[node.path];
      if (existingContent !== undefined) {
        openFile(existingContent, language);
      } else if (isElectron && electronAPI) {
        electronAPI.fs.readFile(node.path)
          .then((content) => { openFile(content, language); })
          .catch(() => { openFile('', language); });
      } else {
        fetch(`/api/workspace?path=${encodeURIComponent(node.path)}`)
          .then((r) => r.json())
          .then((data) => { openFile(data.content ?? '', language); })
          .catch(() => { openFile('', language); });
      }
    }
  }, [node, selectPath, toggleExpand, openFile, fileContents]);

  const handleRenameSubmit = async () => {
    if (renameVal && renameVal !== node.name) {
      const newPath = node.path.replace(node.name, renameVal);
      await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'moveFile', src: node.path, dest: newPath }),
      }).catch(() => {});
      refreshFileTree();
    }
    setRenamingPath('');
  };

  return (
    <>
      <div
        className="file-tree-node"
        onClick={handleClick}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, node); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: `3px 8px 3px ${indent}px`,
          cursor: 'pointer',
          background: isSelected ? '#313244' : 'transparent',
          borderRadius: 4,
          margin: '0 4px',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#24273a';
        }}
        onMouseLeave={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        }}
      >
        {/* Expand arrow */}
        {node.type === 'folder' ? (
          <span style={{ width: 12, textAlign: 'center', fontSize: 10, color: '#6c7086', transition: 'transform 0.15s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}>
            ▶
          </span>
        ) : (
          <span style={{ width: 12 }} />
        )}

        {/* Icon */}
        {node.type === 'folder' ? (
          <span style={{ fontSize: 13 }}>{isExpanded ? '📂' : '📁'}</span>
        ) : (
          <span style={{ fontSize: 9, fontWeight: 700, color, letterSpacing: '-0.5px', width: 22, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
        )}

        {/* Name */}
        {isRenaming ? (
          <input
            ref={renameRef}
            autoFocus
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') setRenamingPath('');
            }}
            style={{
              flex: 1,
              background: '#313244',
              border: '1px solid #89b4fa',
              borderRadius: 3,
              color: '#cdd6f4',
              fontSize: 12,
              padding: '1px 4px',
              outline: 'none',
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span style={{ fontSize: 12, color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {node.name}
          </span>
        )}

        {/* Git status badge */}
        {node.type === 'file' && gitStatus && (() => {
          const fileName = node.name;
          if (gitStatus.staged.has(fileName) || gitStatus.staged.has(node.path)) return <GitBadge status="A" />;
          if (gitStatus.modified.has(fileName) || gitStatus.modified.has(node.path)) return <GitBadge status="M" />;
          if (gitStatus.deleted.has(fileName) || gitStatus.deleted.has(node.path)) return <GitBadge status="D" />;
          if (gitStatus.untracked.has(fileName) || gitStatus.untracked.has(node.path)) return <GitBadge status="U" />;
          return null;
        })()}
      </div>

      {/* Children */}
      {node.type === 'folder' && isExpanded && node.children?.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} onContextMenu={onContextMenu} gitStatus={gitStatus} onFileOpen={onFileOpen} />
      ))}
    </>
  );
}

// ─── FileExplorer ─────────────────────────────────────────────────────────────
export default function FileExplorer({ onFileOpen }: { onFileOpen?: (name: string, path: string, content: string, language: string) => void } = {}) {
  const { fileTree, workspaceName, workspaceOpen, workspacePath, searchQuery, setSearchQuery, newItemParent, newItemType, setNewItemParent, refreshFileTree } = useFileStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const gitStatus = useGitStatus(workspaceOpen ? (workspacePath ?? workspaceName) : null);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const handleNewItem = async () => {
    if (!newItemName) return;
    const path = `${newItemParent}/${newItemName}`;
    const op = newItemType === 'folder' ? 'createDir' : 'writeFile';
    await fetch('/api/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, path, content: '' }),
    }).catch(() => {});
    refreshFileTree();
    setNewItemParent('', null);
    setNewItemName('');
  };

  const filteredTree = searchQuery
    ? filterTree(fileTree, searchQuery.toLowerCase())
    : fileTree;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
      onClick={() => contextMenu && setContextMenu(null)}
    >
      {/* Header */}
      <div style={{ padding: '10px 12px 6px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#a6adc8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Explorer
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              title="New File"
              onClick={() => executeCommand('file.newFile')}
              style={{ background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: 14, padding: 2 }}
            >
              +
            </button>
            <button
              title="Refresh"
              onClick={() => refreshFileTree()}
              style={{ background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: 12, padding: 2 }}
            >
              ↻
            </button>
            <button
              title="Open Folder"
              onClick={() => executeCommand('file.openFolder')}
              style={{ background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: 12, padding: 2 }}
            >
              📂
            </button>
          </div>
        </div>

        {/* Search */}
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter files..."
          style={{
            width: '100%',
            background: '#181825',
            border: '1px solid #313244',
            borderRadius: 4,
            color: '#cdd6f4',
            fontSize: 12,
            padding: '4px 8px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Workspace name */}
      {workspaceOpen && (
        <div style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, color: '#a6adc8', letterSpacing: '0.05em', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {workspaceName.toUpperCase()}
          </span>
          <button
            title="Close Folder"
            onClick={() => executeCommand('file.closeFolder')}
            style={{ background: 'transparent', border: 'none', color: '#45475a', cursor: 'pointer', fontSize: 11, padding: 0, flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* New item input */}
      {newItemParent && (
        <div style={{ padding: '4px 12px', flexShrink: 0 }}>
          <input
            autoFocus
            placeholder={newItemType === 'folder' ? 'New folder name...' : 'New file name...'}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNewItem();
              if (e.key === 'Escape') { setNewItemParent('', null); setNewItemName(''); }
            }}
            onBlur={() => { setNewItemParent('', null); setNewItemName(''); }}
            style={{
              width: '100%',
              background: '#313244',
              border: '1px solid #89b4fa',
              borderRadius: 4,
              color: '#cdd6f4',
              fontSize: 12,
              padding: '4px 8px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* File tree */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {!workspaceOpen && fileTree.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ color: '#45475a', fontSize: 12, marginBottom: 12 }}>No folder open</div>
            <button
              onClick={() => executeCommand('file.openFolder')}
              style={{
                background: '#313244',
                border: '1px solid #45475a',
                borderRadius: 6,
                color: '#cdd6f4',
                fontSize: 12,
                padding: '6px 14px',
                cursor: 'pointer',
              }}
            >
              Open Folder
            </button>
          </div>
        ) : (
          filteredTree.map((node) => (
            <FileTreeNode key={node.path} node={node} depth={0} onContextMenu={handleContextMenu} gitStatus={gitStatus} onFileOpen={onFileOpen} />
          ))
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
      )}
    </div>
  );
}

function filterTree(nodes: FileNode[], q: string): FileNode[] {
  return nodes
    .map((node) => {
      if (node.type === 'file') {
        return node.name.toLowerCase().includes(q) ? node : null;
      }
      const filteredChildren = filterTree(node.children ?? [], q);
      if (filteredChildren.length > 0 || node.name.toLowerCase().includes(q)) {
        return { ...node, children: filteredChildren, expanded: true };
      }
      return null;
    })
    .filter(Boolean) as FileNode[];
}
