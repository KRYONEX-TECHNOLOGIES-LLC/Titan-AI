/**
 * Browser filesystem provider using File System Access API or IndexedDB fallback
 */

import { BaseFileSystemProvider } from './base-fs';
import type { ReadOptions, WriteOptions, CopyOptions, WatchOptions, WatchCallback, FileStats, DirectoryEntry } from './types';

export class BrowserFileSystemProvider extends BaseFileSystemProvider {
  readonly type = 'browser' as const;
  readonly rootPath: string;
  private rootHandle: FileSystemDirectoryHandle | null = null;
  private storage: Map<string, Uint8Array> = new Map(); // Fallback storage
  private watchers: Map<string, Set<WatchCallback>> = new Map();
  private useNativeAPI: boolean = false;

  constructor(rootPath: string = '/workspace') {
    super();
    this.rootPath = rootPath;
    this.useNativeAPI = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  /**
   * Initialize with File System Access API (requires user gesture)
   */
  async initWithPicker(): Promise<void> {
    if (!this.useNativeAPI) {
      throw new Error('File System Access API not supported');
    }

    this.rootHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
    });
  }

  /**
   * Initialize with an existing directory handle
   */
  initWithHandle(handle: FileSystemDirectoryHandle): void {
    this.rootHandle = handle;
  }

  private async getHandle(filePath: string, create: boolean = false): Promise<FileSystemFileHandle | FileSystemDirectoryHandle> {
    if (!this.rootHandle) {
      throw new Error('Browser filesystem not initialized');
    }

    const parts = this.normalizePath(filePath).split('/').filter(Boolean);
    let current: FileSystemDirectoryHandle = this.rootHandle;

    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i]!, { create });
    }

    const lastName = parts[parts.length - 1]!;
    if (!lastName) return current;

    try {
      return await current.getFileHandle(lastName, { create });
    } catch {
      return await current.getDirectoryHandle(lastName, { create });
    }
  }

  async readFile(filePath: string, options?: ReadOptions): Promise<string | Buffer> {
    if (this.rootHandle) {
      const handle = await this.getHandle(filePath) as FileSystemFileHandle;
      const file = await handle.getFile();
      
      if (options?.encoding) {
        return file.text();
      }
      const arrayBuffer = await file.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    // Fallback to memory storage
    const data = this.storage.get(filePath);
    if (!data) {
      throw new Error(`File not found: ${filePath}`);
    }

    if (options?.encoding) {
      return new TextDecoder(options.encoding).decode(data);
    }
    return Buffer.from(data);
  }

  async readDirectory(dirPath: string): Promise<DirectoryEntry[]> {
    if (this.rootHandle) {
      const handle = await this.getHandle(dirPath) as FileSystemDirectoryHandle;
      const entries: DirectoryEntry[] = [];

      for await (const [name, entryHandle] of (handle as any).entries()) {
        entries.push({
          name,
          path: `${dirPath}/${name}`,
          type: entryHandle.kind === 'file' ? 'file' : 'directory',
        });
      }

      return entries;
    }

    // Fallback: scan memory storage for entries in this directory
    const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
    const entries: DirectoryEntry[] = [];
    const seen = new Set<string>();

    for (const key of this.storage.keys()) {
      if (key.startsWith(prefix)) {
        const remainder = key.slice(prefix.length);
        const firstPart = remainder.split('/')[0]!;
        
        if (!seen.has(firstPart)) {
          seen.add(firstPart);
          entries.push({
            name: firstPart,
            path: `${prefix}${firstPart}`,
            type: remainder.includes('/') ? 'directory' : 'file',
          });
        }
      }
    }

    return entries;
  }

  async stat(filePath: string): Promise<FileStats> {
    if (this.rootHandle) {
      const handle = await this.getHandle(filePath);
      const isFile = handle.kind === 'file';
      
      let size = 0;
      let mtime = new Date();
      
      if (isFile) {
        const file = await (handle as FileSystemFileHandle).getFile();
        size = file.size;
        mtime = new Date(file.lastModified);
      }

      return {
        path: filePath,
        size,
        mtime,
        ctime: mtime,
        atime: mtime,
        isFile,
        isDirectory: !isFile,
        isSymlink: false,
      };
    }

    // Fallback
    const data = this.storage.get(filePath);
    const isDirectory = !data && Array.from(this.storage.keys()).some(k => k.startsWith(`${filePath}/`));
    
    return {
      path: filePath,
      size: data?.length || 0,
      mtime: new Date(),
      ctime: new Date(),
      atime: new Date(),
      isFile: !!data,
      isDirectory,
      isSymlink: false,
    };
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await this.stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async writeFile(filePath: string, content: string | Buffer, _options?: WriteOptions): Promise<void> {
    if (this.rootHandle) {
      const handle = await this.getHandle(filePath, true) as FileSystemFileHandle;
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      
      this.notifyWatchers(filePath, 'change');
      return;
    }

    // Fallback
    const data = typeof content === 'string' 
      ? new TextEncoder().encode(content)
      : new Uint8Array(content);
    this.storage.set(filePath, data);
    this.notifyWatchers(filePath, 'change');
  }

  async createDirectory(dirPath: string, recursive: boolean = true): Promise<void> {
    if (this.rootHandle) {
      const parts = this.normalizePath(dirPath).split('/').filter(Boolean);
      let current = this.rootHandle;

      for (const part of parts) {
        current = await current.getDirectoryHandle(part, { create: recursive });
      }
      
      this.notifyWatchers(dirPath, 'addDir');
      return;
    }

    // Fallback: directories are implicit in path structure
    this.notifyWatchers(dirPath, 'addDir');
  }

  async delete(filePath: string, _recursive: boolean = false): Promise<void> {
    if (this.rootHandle) {
      const parts = this.normalizePath(filePath).split('/').filter(Boolean);
      let parent = this.rootHandle;

      for (let i = 0; i < parts.length - 1; i++) {
        parent = await parent.getDirectoryHandle(parts[i]!);
      }

      await parent.removeEntry(parts[parts.length - 1]!, { recursive: _recursive });
      this.notifyWatchers(filePath, 'unlink');
      return;
    }

    // Fallback
    this.storage.delete(filePath);
    this.notifyWatchers(filePath, 'unlink');
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const content = await this.readFile(oldPath);
    await this.writeFile(newPath, content);
    await this.delete(oldPath);
  }

  async copy(source: string, destination: string, _options?: CopyOptions): Promise<void> {
    const content = await this.readFile(source);
    await this.writeFile(destination, content);
  }

  watch(filePath: string, callback: WatchCallback, _options?: WatchOptions): () => void {
    if (!this.watchers.has(filePath)) {
      this.watchers.set(filePath, new Set());
    }
    this.watchers.get(filePath)!.add(callback);

    return () => {
      const callbacks = this.watchers.get(filePath);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  private notifyWatchers(filePath: string, type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'): void {
    const callbacks = this.watchers.get(filePath);
    if (callbacks) {
      for (const callback of callbacks) {
        callback({ type, path: filePath });
      }
    }
  }

  // Browser-specific methods
  isNativeAPISupported(): boolean {
    return this.useNativeAPI;
  }

  isInitialized(): boolean {
    return this.rootHandle !== null || this.storage.size > 0;
  }

  async requestPermission(): Promise<boolean> {
    if (!this.rootHandle) return false;
    
    const permission = await (this.rootHandle as any).requestPermission({ mode: 'readwrite' });
    return permission === 'granted';
  }
}

/**
 * Creates a browser filesystem provider
 */
export function createBrowserFS(rootPath?: string): BrowserFileSystemProvider {
  return new BrowserFileSystemProvider(rootPath);
}
