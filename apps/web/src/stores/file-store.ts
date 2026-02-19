import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  size?: number;
  modified?: number;
  expanded?: boolean;
}

interface FileState {
  // Workspace / folder
  workspacePath: string;
  workspaceName: string;
  workspaceOpen: boolean;
  fileTree: FileNode[];

  // UI state
  selectedPath: string;
  expandedPaths: Set<string>;
  renamingPath: string;
  newItemParent: string;
  newItemType: 'file' | 'folder' | null;
  searchQuery: string;

  // Clipboard
  clipboardPath: string;
  clipboardOp: 'copy' | 'cut' | null;

  // Actions
  openFolder: (path: string, name: string, tree: FileNode[]) => void;
  closeFolder: () => void;
  setFileTree: (tree: FileNode[]) => void;
  refreshFileTree: () => void;

  selectPath: (path: string) => void;
  toggleExpand: (path: string) => void;
  expandPath: (path: string) => void;
  collapsePath: (path: string) => void;
  expandAll: () => void;
  collapseAll: () => void;

  setRenamingPath: (path: string) => void;
  setNewItemParent: (path: string, type: 'file' | 'folder' | null) => void;
  setSearchQuery: (q: string) => void;

  copyPath: (path: string) => void;
  cutPath: (path: string) => void;
  paste: (destDir: string) => void;
}

function getAllPaths(nodes: FileNode[]): string[] {
  const paths: string[] = [];
  function walk(n: FileNode) {
    if (n.type === 'folder') {
      paths.push(n.path);
      n.children?.forEach(walk);
    }
  }
  nodes.forEach(walk);
  return paths;
}

export const useFileStore = create<FileState>()(
  persist(
    (set, get) => ({
      workspacePath: '',
      workspaceName: 'Titan AI',
      workspaceOpen: false,
      fileTree: [],

      selectedPath: '',
      expandedPaths: new Set<string>(),
      renamingPath: '',
      newItemParent: '',
      newItemType: null,
      searchQuery: '',

      clipboardPath: '',
      clipboardOp: null,

      openFolder: (path, name, tree) =>
        set({
          workspacePath: path,
          workspaceName: name,
          workspaceOpen: true,
          fileTree: tree,
          expandedPaths: new Set([path]),
        }),

      closeFolder: () =>
        set({
          workspacePath: '',
          workspaceName: 'Titan AI',
          workspaceOpen: false,
          fileTree: [],
          selectedPath: '',
          expandedPaths: new Set(),
        }),

      setFileTree: (tree) => set({ fileTree: tree }),

      refreshFileTree: async () => {
        const { workspacePath, workspaceOpen } = get();
        if (!workspaceOpen) return;
        try {
          const res = await fetch(`/api/workspace?path=${encodeURIComponent(workspacePath)}`);
          if (res.ok) {
            const data = await res.json();
            set({ fileTree: data.tree ?? [] });
          }
        } catch {
          // silently fail — keep existing tree
        }
      },

      selectPath: (path) => set({ selectedPath: path }),

      toggleExpand: (path) =>
        set((s) => {
          const next = new Set(s.expandedPaths);
          if (next.has(path)) next.delete(path);
          else next.add(path);
          return { expandedPaths: next };
        }),

      expandPath: (path) =>
        set((s) => ({ expandedPaths: new Set([...s.expandedPaths, path]) })),

      collapsePath: (path) =>
        set((s) => {
          const next = new Set(s.expandedPaths);
          next.delete(path);
          return { expandedPaths: next };
        }),

      expandAll: () =>
        set((s) => ({ expandedPaths: new Set(getAllPaths(s.fileTree)) })),

      collapseAll: () => set({ expandedPaths: new Set() }),

      setRenamingPath: (path) => set({ renamingPath: path }),
      setNewItemParent: (path, type) => set({ newItemParent: path, newItemType: type }),
      setSearchQuery: (q) => set({ searchQuery: q }),

      copyPath: (path) => set({ clipboardPath: path, clipboardOp: 'copy' }),
      cutPath: (path) => set({ clipboardPath: path, clipboardOp: 'cut' }),
      paste: (destDir) => {
        const { clipboardPath, clipboardOp } = get();
        if (!clipboardPath || !clipboardOp) return;
        fetch('/api/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ op: clipboardOp === 'copy' ? 'copyFile' : 'moveFile', src: clipboardPath, dest: destDir }),
        }).then(() => get().refreshFileTree());
        if (clipboardOp === 'cut') set({ clipboardPath: '', clipboardOp: null });
      },
    }),
    {
      name: 'titan-files',
      partialize: (s) => ({
        workspacePath: s.workspacePath,
        workspaceName: s.workspaceName,
        workspaceOpen: s.workspaceOpen,
        expandedPaths: [...s.expandedPaths],
      }),
      merge: (persisted: unknown, current) => {
        const p = persisted as Partial<FileState> & { expandedPaths?: string[] };
        return {
          ...current,
          ...(p ?? {}),
          expandedPaths: new Set(p?.expandedPaths ?? []),
        };
      },
    }
  )
);
