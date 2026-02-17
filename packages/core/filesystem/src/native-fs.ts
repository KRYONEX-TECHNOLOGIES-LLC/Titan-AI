/**
 * Native filesystem provider using Node.js fs
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { BaseFileSystemProvider } from './base-fs';
import type { ReadOptions, WriteOptions, CopyOptions, WatchOptions, WatchCallback, FileStats, DirectoryEntry } from './types';

export class NativeFileSystemProvider extends BaseFileSystemProvider {
  readonly type = 'native' as const;
  readonly rootPath: string;

  constructor(rootPath: string = process.cwd()) {
    super();
    this.rootPath = path.resolve(rootPath);
  }

  async readFile(filePath: string, options?: ReadOptions): Promise<string | Buffer> {
    const fullPath = this.resolve(filePath);
    
    if (options?.encoding) {
      return fs.readFile(fullPath, { encoding: options.encoding });
    }
    return fs.readFile(fullPath);
  }

  async readDirectory(dirPath: string): Promise<DirectoryEntry[]> {
    const fullPath = this.resolve(dirPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    
    return entries.map((entry) => ({
      name: entry.name,
      path: path.join(fullPath, entry.name),
      type: entry.isFile() ? 'file' :
            entry.isDirectory() ? 'directory' :
            entry.isSymbolicLink() ? 'symlink' : 'unknown',
    }));
  }

  async stat(filePath: string): Promise<FileStats> {
    const fullPath = this.resolve(filePath);
    const stats = await fs.stat(fullPath);
    
    return {
      path: fullPath,
      size: stats.size,
      mtime: stats.mtime,
      ctime: stats.ctime,
      atime: stats.atime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymlink: stats.isSymbolicLink(),
      mode: stats.mode,
    };
  }

  async exists(filePath: string): Promise<boolean> {
    const fullPath = this.resolve(filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async writeFile(filePath: string, content: string | Buffer, options?: WriteOptions): Promise<void> {
    const fullPath = this.resolve(filePath);
    await this.ensureDirectory(fullPath);
    await fs.writeFile(fullPath, content, {
      encoding: options?.encoding,
      mode: options?.mode,
      flag: options?.flag,
    });
  }

  async createDirectory(dirPath: string, recursive: boolean = true): Promise<void> {
    const fullPath = this.resolve(dirPath);
    await fs.mkdir(fullPath, { recursive });
  }

  async delete(filePath: string, recursive: boolean = false): Promise<void> {
    const fullPath = this.resolve(filePath);
    const stats = await this.stat(fullPath);
    
    if (stats.isDirectory) {
      await fs.rm(fullPath, { recursive, force: true });
    } else {
      await fs.unlink(fullPath);
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const fullOldPath = this.resolve(oldPath);
    const fullNewPath = this.resolve(newPath);
    await this.ensureDirectory(fullNewPath);
    await fs.rename(fullOldPath, fullNewPath);
  }

  async copy(source: string, destination: string, options?: CopyOptions): Promise<void> {
    const fullSource = this.resolve(source);
    const fullDest = this.resolve(destination);
    
    await this.ensureDirectory(fullDest);
    
    const sourceStats = await this.stat(fullSource);
    
    if (sourceStats.isDirectory) {
      await this.copyDirectory(fullSource, fullDest, options);
    } else {
      const mode = options?.overwrite ? 0 : fsSync.constants.COPYFILE_EXCL;
      await fs.copyFile(fullSource, fullDest, mode);
      
      if (options?.preserveTimestamps) {
        await fs.utimes(fullDest, sourceStats.atime, sourceStats.mtime);
      }
    }
  }

  private async copyDirectory(source: string, destination: string, options?: CopyOptions): Promise<void> {
    await fs.mkdir(destination, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath, options);
      } else {
        const mode = options?.overwrite ? 0 : fsSync.constants.COPYFILE_EXCL;
        await fs.copyFile(srcPath, destPath, mode);
      }
    }
  }

  watch(filePath: string, callback: WatchCallback, options?: WatchOptions): () => void {
    const fullPath = this.resolve(filePath);
    
    const watcher = fsSync.watch(fullPath, {
      recursive: options?.recursive,
      persistent: options?.persistent ?? true,
    }, async (eventType, filename) => {
      if (!filename) return;
      
      const watchedPath = path.join(fullPath, filename);
      let stats: FileStats | undefined;
      
      try {
        stats = await this.stat(watchedPath);
      } catch {
        // File was deleted
      }
      
      const type = eventType === 'rename' 
        ? (stats ? 'add' : 'unlink')
        : 'change';
      
      callback({
        type: type as 'add' | 'change' | 'unlink',
        path: watchedPath,
        stats,
      });
    });

    return () => watcher.close();
  }

  // Additional native-specific methods
  async readLink(linkPath: string): Promise<string> {
    const fullPath = this.resolve(linkPath);
    return fs.readlink(fullPath);
  }

  async createSymlink(target: string, linkPath: string): Promise<void> {
    const fullLinkPath = this.resolve(linkPath);
    await fs.symlink(target, fullLinkPath);
  }

  async chmod(filePath: string, mode: number): Promise<void> {
    const fullPath = this.resolve(filePath);
    await fs.chmod(fullPath, mode);
  }

  async chown(filePath: string, uid: number, gid: number): Promise<void> {
    const fullPath = this.resolve(filePath);
    await fs.chown(fullPath, uid, gid);
  }
}

/**
 * Creates a native filesystem provider
 */
export function createNativeFS(rootPath?: string): NativeFileSystemProvider {
  return new NativeFileSystemProvider(rootPath);
}
