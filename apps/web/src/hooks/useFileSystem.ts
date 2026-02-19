'use client';

import { useState, useCallback } from 'react';
import { useFileStore } from '@/stores/file-store';
import { getFileInfo } from '@/utils/file-helpers';
import type { FileTab } from '@/types/ide';

const MAX_FILES = 500;
const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.next', 'dist', 'build', '.cache', 'coverage', '.vscode', '.idea']);
const SKIP_EXTENSIONS = new Set(['exe', 'dll', 'so', 'dylib', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg', 'woff', 'woff2', 'ttf', 'eot', 'mp3', 'mp4', 'wav', 'avi', 'mov', 'pdf', 'zip', 'tar', 'gz', 'rar', '7z']);

export function useFileSystem(
  setTabs: React.Dispatch<React.SetStateAction<FileTab[]>>,
  setActiveTab: (tab: string) => void,
  setFileContents: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  setActiveView: (view: string) => void,
  activeView: string,
) {
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const openFolder = useCallback(async () => {
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
              try {
                const file = await (entry as FileSystemFileHandle).getFile();
                if (file.size > 500_000) continue;
                const text = await file.text();
                newFiles[path] = text;
                fileCount++;
                if (fileCount % 20 === 0) setLoadingMessage(`Reading files... (${fileCount} files)`);
              } catch { /* skip unreadable */ }
            } else if (entry.kind === 'directory') {
              await readDir(entry as FileSystemDirectoryHandle, path);
            }
          }
        } catch (err) {
          console.warn(`Could not read directory ${prefix}:`, err);
        }
      }

      await readDir(dirHandle);

      const folderName = dirHandle.name;
      const { openFolder: openFolderStore } = useFileStore.getState();
      openFolderStore(folderName, folderName, []);
      setWorkspacePath(folderName);

      if (!activeView || activeView === 'explorer') {
        setActiveView('titan-agent');
      }

      if (Object.keys(newFiles).length === 0) {
        setIsLoadingFiles(false);
        setLoadingMessage('');
        return;
      }

      setLoadingMessage('Loading editor...');
      setFileContents(newFiles);

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
  }, [activeView, setActiveView, setFileContents, setTabs, setActiveTab]);

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
      setFileContents(prev => ({ ...prev, [fileName]: text }));
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
  }, [setFileContents, setTabs, setActiveTab]);

  const writeFile = useCallback(async (filePath: string, content: string): Promise<boolean> => {
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
