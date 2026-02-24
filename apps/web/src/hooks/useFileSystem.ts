'use client';

import { useState, useCallback } from 'react';
import { useFileStore, type FileNode } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { getFileInfo, getLanguageFromFilename } from '@/utils/file-helpers';
import type { FileTab } from '@/types/ide';
import { workerManager } from '@/lib/worker-manager';
import { isElectron, electronAPI } from '@/lib/electron';

const MAX_FILES = 500;
const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.next', 'dist', 'build', '.cache', 'coverage', '.vscode', '.idea']);
const SKIP_EXTENSIONS = new Set(['exe', 'dll', 'so', 'dylib', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg', 'woff', 'woff2', 'ttf', 'eot', 'mp3', 'mp4', 'wav', 'avi', 'mov', 'pdf', 'zip', 'tar', 'gz', 'rar', '7z']);

function convertNativeTree(nodes: Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }>, prefix: string): FileNode[] {
  return nodes.map(n => {
    const relPath = prefix ? `${prefix}/${n.name}` : n.name;
    const node: FileNode = {
      name: n.name,
      path: relPath,
      type: n.type === 'directory' ? 'folder' : 'file',
    };
    if (n.type === 'directory' && n.children) {
      node.children = convertNativeTree(n.children as typeof nodes, relPath);
    }
    return node;
  });
}

function buildFileTree(_dirHandle: FileSystemDirectoryHandle, entries: Array<{ path: string; kind: 'file' | 'directory' }>): FileNode[] {
  const root: FileNode[] = [];
  const folderMap = new Map<string, FileNode>();

  const sorted = [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const entry of sorted) {
    const parts = entry.path.split('/');
    const name = parts[parts.length - 1];
    const node: FileNode = {
      name,
      path: entry.path,
      type: entry.kind === 'directory' ? 'folder' : 'file',
      children: entry.kind === 'directory' ? [] : undefined,
    };

    if (entry.kind === 'directory') {
      folderMap.set(entry.path, node);
    }

    if (parts.length === 1) {
      root.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      const parent = folderMap.get(parentPath);
      if (parent && parent.children) {
        parent.children.push(node);
      } else {
        root.push(node);
      }
    }
  }

  return root;
}

export function useFileSystem(
  setTabs: React.Dispatch<React.SetStateAction<FileTab[]>>,
  setActiveTab: (tab: string) => void,
  onFilesLoaded: (files: Record<string, string>, opts?: { replace?: boolean }) => void,
  setActiveView: (view: string) => void,
  activeView: string,
) {
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const openFolder = useCallback(async () => {
    // ── Electron native path ──
    if (isElectron && electronAPI) {
      try {
        const folderPath = await electronAPI.dialog.openFolder();
        if (!folderPath) return;

        setIsLoadingFiles(true);
        setLoadingMessage('Reading folder contents...');

        const nativeTree = await electronAPI.fs.readDir(folderPath, { recursive: true });

        const newFiles: Record<string, string> = {};
        let fileCount = 0;

        async function loadFilesFromTree(nodes: typeof nativeTree, prefix: string): Promise<void> {
          for (const node of nodes) {
            if (fileCount >= MAX_FILES) break;
            if (node.type === 'file') {
              const ext = node.name.split('.').pop()?.toLowerCase() || '';
              if (SKIP_EXTENSIONS.has(ext)) continue;
              if ((node as { size?: number }).size && (node as { size?: number }).size! > 500_000) continue;
              try {
                const content = await electronAPI!.fs.readFile(node.path);
                const relPath = prefix ? `${prefix}/${node.name}` : node.name;
                newFiles[relPath] = content;
                fileCount++;
                if (fileCount % 20 === 0) setLoadingMessage(`Reading files... (${fileCount} files)`);
              } catch { /* skip unreadable */ }
            } else if (node.type === 'directory' && (node as { children?: unknown[] }).children) {
              const relPath = prefix ? `${prefix}/${node.name}` : node.name;
              await loadFilesFromTree((node as { children: typeof nativeTree }).children, relPath);
            }
          }
        }

        await loadFilesFromTree(nativeTree, '');

        const folderName = folderPath.split(/[\\/]/).pop() || folderPath;
        const fileTree = convertNativeTree(nativeTree, '');
        const { openFolder: openFolderStore } = useFileStore.getState();
        openFolderStore(folderPath, folderName, fileTree);
        setWorkspacePath(folderPath);

        await electronAPI.recentFolders.add(folderPath);

        if (!activeView || activeView === 'explorer') {
          setActiveView('titan-agent');
        }

        setLoadingMessage('Loading editor...');
        onFilesLoaded(newFiles, { replace: true });
        useEditorStore.getState().loadFileContents(newFiles);

        const sortedFiles = Object.keys(newFiles).sort((a, b) => {
          const aDepth = a.split('/').length;
          const bDepth = b.split('/').length;
          if (aDepth !== bDepth) return aDepth - bDepth;
          return a.localeCompare(b);
        });

        const firstFile = sortedFiles[0] || '';
        if (firstFile) {
          const info = getFileInfo(firstFile);
          setTabs([{ name: firstFile, icon: info.icon, color: info.color }]);
          setActiveTab(firstFile);
        }

        setIsLoadingFiles(false);
        setLoadingMessage('');
        return;
      } catch (e: unknown) {
        setIsLoadingFiles(false);
        setLoadingMessage('');
        console.error('Electron open folder failed:', e);
        alert(`Failed to open folder: ${e instanceof Error ? e.message : 'Unknown error'}`);
        return;
      }
    }

    // ── Browser File System Access API path ──
    if (!('showDirectoryPicker' in window)) {
      alert('Your browser does not support opening folders.\n\nPlease use Chrome, Edge, or another Chromium-based browser.');
      return;
    }

    try {
      const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
      setDirectoryHandle(dirHandle);
      setIsLoadingFiles(true);
      setLoadingMessage('Reading folder contents...');

      const newFiles: Record<string, string> = {};
      const treeEntries: Array<{ path: string; kind: 'file' | 'directory' }> = [];
      let fileCount = 0;

      async function readDir(handle: FileSystemDirectoryHandle, prefix = ''): Promise<void> {
        if (fileCount >= MAX_FILES) return;
        try {
          for await (const [name, entry] of (handle as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
            if (fileCount >= MAX_FILES) break;
            if (name.startsWith('.') && name !== '.env' && name !== '.gitignore') continue;
            if (SKIP_DIRS.has(name)) continue;
            const path = prefix ? `${prefix}/${name}` : name;
            if (entry.kind === 'file') {
              const ext = name.split('.').pop()?.toLowerCase() || '';
              if (SKIP_EXTENSIONS.has(ext)) continue;
              treeEntries.push({ path, kind: 'file' });
              try {
                const file = await (entry as FileSystemFileHandle).getFile();
                if (file.size > 500_000) continue;
                const text = await file.text();
                newFiles[path] = text;
                newFiles[name] = text;
                fileCount++;
                if (fileCount % 20 === 0) setLoadingMessage(`Reading files... (${fileCount} files)`);
              } catch { /* skip unreadable */ }
            } else if (entry.kind === 'directory') {
              treeEntries.push({ path, kind: 'directory' });
              await readDir(entry as FileSystemDirectoryHandle, path);
            }
          }
        } catch (err) {
          console.warn(`Could not read directory ${prefix}:`, err);
        }
      }

      await readDir(dirHandle);

      const folderName = dirHandle.name;
      const fileTree = buildFileTree(dirHandle, treeEntries);
      const { openFolder: openFolderStore } = useFileStore.getState();
      openFolderStore(folderName, folderName, fileTree);
      setWorkspacePath(folderName);

      if (!activeView || activeView === 'explorer') {
        setActiveView('titan-agent');
      }

      if (Object.keys(newFiles).length === 0) {
        setIsLoadingFiles(false);
        setLoadingMessage('');
        return;
      }

      setLoadingMessage('Indexing files...');
      const filesToIndex = Object.entries(newFiles).map(([path, content]) => ({
        path,
        content,
        language: getLanguageFromFilename(path),
      }));
      workerManager.indexFiles(filesToIndex).catch(err =>
        console.warn('[useFileSystem] Background indexing failed:', err)
      );

      setLoadingMessage('Generating repo map...');
      try {
        const mapRes = await fetch('/api/workspace/repomap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ maxFiles: 150 }),
        });
        if (mapRes.ok) {
          const mapData = await mapRes.json();
          if (mapData.map) (window as any).__titanRepoMap = mapData.map;
        }
      } catch (err) {
        console.warn('[useFileSystem] Repo map generation failed:', err);
      }

      setLoadingMessage('Loading editor...');
      onFilesLoaded(newFiles, { replace: true });
      useEditorStore.getState().loadFileContents(newFiles);

      const sortedFiles = Object.keys(newFiles).sort((a, b) => {
        const aDepth = a.split('/').length;
        const bDepth = b.split('/').length;
        if (aDepth !== bDepth) return aDepth - bDepth;
        return a.localeCompare(b);
      });

      const firstFile = sortedFiles[0] || '';
      if (firstFile) {
        const info = getFileInfo(firstFile);
        setTabs([{ name: firstFile, icon: info.icon, color: info.color }]);
        setActiveTab(firstFile);
      }

      setIsLoadingFiles(false);
      setLoadingMessage('');
    } catch (e: unknown) {
      setIsLoadingFiles(false);
      setLoadingMessage('');
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.error('Open folder failed:', e);
      alert(`Failed to open folder: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }, [activeView, setActiveView, onFilesLoaded, setTabs, setActiveTab]);

  const openFile = useCallback(async () => {
    if (!('showOpenFilePicker' in window)) {
      alert('Your browser does not support opening files.\n\nPlease use Chrome, Edge, or another Chromium-based browser.');
      return;
    }
    try {
      const [fileHandle] = await (window as unknown as { showOpenFilePicker: () => Promise<FileSystemFileHandle[]> }).showOpenFilePicker();
      const file = await fileHandle.getFile();
      const text = await file.text();
      const fileName = file.name;
      onFilesLoaded({ [fileName]: text });
      const info = getFileInfo(fileName);
      setTabs(prev => {
        if (prev.find(t => t.name === fileName)) return prev;
        return [...prev, { name: fileName, icon: info.icon, color: info.color }];
      });
      setActiveTab(fileName);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.error('Open file failed:', e);
      alert(`Failed to open file: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }, [onFilesLoaded, setTabs, setActiveTab]);

  const writeFile = useCallback(async (filePath: string, content: string): Promise<boolean> => {
    if (isElectron && electronAPI) {
      try {
        await electronAPI.fs.writeFile(filePath, content);
        return true;
      } catch (e) {
        console.error('Electron write file failed:', e);
        return false;
      }
    }

    if (!directoryHandle) return false;
    try {
      const parts = filePath.split('/');
      let currentDir = directoryHandle;
      for (let i = 0; i < parts.length - 1; i++) {
        currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
      }
      const fileName = parts[parts.length - 1];
      const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (e) {
      console.error('Write file failed:', e);
      return false;
    }
  }, [directoryHandle]);

  return {
    isLoadingFiles,
    loadingMessage,
    workspacePath, setWorkspacePath,
    directoryHandle,
    openFolder,
    openFile,
    writeFile,
  };
}
