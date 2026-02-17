/**
 * Virtual filesystem provider using memfs
 */

import { fs as memfs, vol } from 'memfs';
import * as path from 'path';
import { BaseFileSystemProvider } from './base-fs';
import type { ReadOptions, WriteOptions, CopyOptions, WatchOptions, WatchCallback, FileStats, DirectoryEntry } from './types';

export class VirtualFileSystemProvider extends BaseFileSystemProvider {
  readonly type = 'virtual' as const;
  readonly rootPath: string;
  private watchers: Map<string, Set<WatchCallback>> = new Map();

  constructor(rootPath: string = '/') {
    super();
    this.rootPath = rootPath;
    vol.mkdirSync(rootPath, { recursive: true });
  }

  async readFile(filePath: string, options?: ReadOptions): Promise<string | Buffer> {
    const fullPath = this.resolve(filePath);
    
    if (options?.encoding) {
      return memfs.promises.readFile(fullPath, { encoding: options.encoding }) as Promise<string>;
    }
    return memfs.promises.readFile(fullPath) as Promise<Buffer>;
  }

  async readDirectory(dirPath: string): Promise<DirectoryEntry[]> {
    const fullPath = this.resolve(dirPath);
    const entries = await memfs.promises.readdir(fullPath, { withFileTypes: true }) as any[];
    
    return entries.map((entry: any) => ({
      name: entry.name,
      path: path.posix.join(fullPath, entry.name),
      type: entry.isFile() ? 'file' :
            entry.isDirectory() ? 'directory' :
            entry.isSymbolicLink() ? 'symlink' : 'unknown',
    }));
  }

  async stat(filePath: string): Promise<FileStats> {
    const fullPath = this.resolve(filePath);
    const stats = await memfs.promises.stat(fullPath) as any;
    
    return {
      path: fullPath,
      size: stats.size,
      mtime: new Date(stats.mtimeMs),
      ctime: new Date(stats.ctimeMs),
      atime: new Date(stats.atimeMs),
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymlink: stats.isSymbolicLink(),
      mode: stats.mode,
    };
  }

  async exists(filePath: string): Promise<boolean> {
    const fullPath = this.resolve(filePath);
    try {
      await memfs.promises.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async writeFile(filePath: string, content: string | Buffer, options?: WriteOptions): Promise<void> {
    const fullPath = this.resolve(filePath);
    await this.ensureDirectory(fullPath);
    await memfs.promises.writeFile(fullPath, content, {
      encoding: options?.encoding,
      mode: options?.mode,
    });
    
    this.notifyWatchers(fullPath, 'change');
  }

  async createDirectory(dirPath: string, recursive: boolean = true): Promise<void> {
    const fullPath = this.resolve(dirPath);
    await memfs.promises.mkdir(fullPath, { recursive });
    this.notifyWatchers(fullPath, 'addDir');
  }

  async delete(filePath: string, recursive: boolean = false): Promise<void> {
    const fullPath = this.resolve(filePath);
    const stats = await this.stat(fullPath);
    
    if (stats.isDirectory) {
      await memfs.promises.rm(fullPath, { recursive, force: true });
      this.notifyWatchers(fullPath, 'unlinkDir');
    } else {
      await memfs.promises.unlink(fullPath);
      this.notifyWatchers(fullPath, 'unlink');
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const fullOldPath = this.resolve(oldPath);
    const fullNewPath = this.resolve(newPath);
    await this.ensureDirectory(fullNewPath);
    await memfs.promises.rename(fullOldPath, fullNewPath);
    
    this.notifyWatchers(fullOldPath, 'unlink');
    this.notifyWatchers(fullNewPath, 'add');
  }

  async copy(source: string, destination: string, options?: CopyOptions): Promise<void> {
    const fullSource = this.resolve(source);
    const fullDest = this.resolve(destination);
    
    await this.ensureDirectory(fullDest);
    
    const content = await this.readFile(fullSource);
    await this.writeFile(fullDest, content);
  }

  watch(filePath: string, callback: WatchCallback, _options?: WatchOptions): () => void {
    const fullPath = this.resolve(filePath);
    
    if (!this.watchers.has(fullPath)) {
      this.watchers.set(fullPath, new Set());
    }
    this.watchers.get(fullPath)!.add(callback);

    return () => {
      const callbacks = this.watchers.get(fullPath);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.watchers.delete(fullPath);
        }
      }
    };
  }

  private notifyWatchers(filePath: string, type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'): void {
    // Notify exact path watchers
    const callbacks = this.watchers.get(filePath);
    if (callbacks) {
      for (const callback of callbacks) {
        callback({ type, path: filePath });
      }
    }

    // Notify parent directory watchers
    const parentDir = path.posix.dirname(filePath);
    const parentCallbacks = this.watchers.get(parentDir);
    if (parentCallbacks) {
      for (const callback of parentCallbacks) {
        callback({ type, path: filePath });
      }
    }
  }

  // Virtual filesystem specific methods
  reset(): void {
    vol.reset();
    vol.mkdirSync(this.rootPath, { recursive: true });
    this.watchers.clear();
  }

  fromJSON(json: Record<string, string | null>): void {
    vol.fromJSON(json, this.rootPath);
  }

  toJSON(): Record<string, string | null> {
    return vol.toJSON(this.rootPath);
  }

  snapshot(): Record<string, string | null> {
    return this.toJSON();
  }

  restore(snapshot: Record<string, string | null>): void {
    this.reset();
    this.fromJSON(snapshot);
  }
}

/**
 * Creates a virtual filesystem provider
 */
export function createVirtualFS(rootPath?: string): VirtualFileSystemProvider {
  return new VirtualFileSystemProvider(rootPath);
}
