/**
 * Unified filesystem that can switch between native, virtual, and browser providers
 */

import { NativeFileSystemProvider, createNativeFS } from './native-fs';
import { VirtualFileSystemProvider, createVirtualFS } from './virtual-fs';
import { BrowserFileSystemProvider, createBrowserFS } from './browser-fs';
import type { FileSystemProvider, ReadOptions, WriteOptions, CopyOptions, WatchOptions, WatchCallback, FileStats, DirectoryEntry } from './types';

export type FileSystemType = 'native' | 'virtual' | 'browser' | 'auto';

export interface UnifiedFSConfig {
  type: FileSystemType;
  rootPath?: string;
}

export class UnifiedFileSystem implements FileSystemProvider {
  private provider: FileSystemProvider;
  readonly type: 'native' | 'virtual' | 'browser';
  readonly rootPath: string;

  constructor(config: UnifiedFSConfig = { type: 'auto' }) {
    this.provider = this.createProvider(config);
    this.type = this.provider.type;
    this.rootPath = this.provider.rootPath;
  }

  private createProvider(config: UnifiedFSConfig): FileSystemProvider {
    const rootPath = config.rootPath;

    switch (config.type) {
      case 'native':
        return createNativeFS(rootPath);
      
      case 'virtual':
        return createVirtualFS(rootPath);
      
      case 'browser':
        return createBrowserFS(rootPath);
      
      case 'auto':
      default:
        // Auto-detect environment
        if (typeof window !== 'undefined') {
          return createBrowserFS(rootPath);
        }
        return createNativeFS(rootPath);
    }
  }

  // Delegate all methods to the active provider
  readFile(path: string, options?: ReadOptions): Promise<string | Buffer> {
    return this.provider.readFile(path, options);
  }

  readDirectory(path: string): Promise<DirectoryEntry[]> {
    return this.provider.readDirectory(path);
  }

  stat(path: string): Promise<FileStats> {
    return this.provider.stat(path);
  }

  exists(path: string): Promise<boolean> {
    return this.provider.exists(path);
  }

  writeFile(path: string, content: string | Buffer, options?: WriteOptions): Promise<void> {
    return this.provider.writeFile(path, content, options);
  }

  createDirectory(path: string, recursive?: boolean): Promise<void> {
    return this.provider.createDirectory(path, recursive);
  }

  delete(path: string, recursive?: boolean): Promise<void> {
    return this.provider.delete(path, recursive);
  }

  rename(oldPath: string, newPath: string): Promise<void> {
    return this.provider.rename(oldPath, newPath);
  }

  copy(source: string, destination: string, options?: CopyOptions): Promise<void> {
    return this.provider.copy(source, destination, options);
  }

  watch(path: string, callback: WatchCallback, options?: WatchOptions): () => void {
    return this.provider.watch(path, callback, options);
  }

  resolve(...paths: string[]): string {
    return this.provider.resolve(...paths);
  }

  relative(from: string, to: string): string {
    return this.provider.relative(from, to);
  }

  join(...paths: string[]): string {
    return this.provider.join(...paths);
  }

  dirname(path: string): string {
    return this.provider.dirname(path);
  }

  basename(path: string, ext?: string): string {
    return this.provider.basename(path, ext);
  }

  extname(path: string): string {
    return this.provider.extname(path);
  }

  // Access to underlying providers
  getNativeProvider(): NativeFileSystemProvider | null {
    return this.provider instanceof NativeFileSystemProvider ? this.provider : null;
  }

  getVirtualProvider(): VirtualFileSystemProvider | null {
    return this.provider instanceof VirtualFileSystemProvider ? this.provider : null;
  }

  getBrowserProvider(): BrowserFileSystemProvider | null {
    return this.provider instanceof BrowserFileSystemProvider ? this.provider : null;
  }

  // Switch provider at runtime
  switchProvider(config: UnifiedFSConfig): void {
    this.provider = this.createProvider(config);
    (this as any).type = this.provider.type;
    (this as any).rootPath = this.provider.rootPath;
  }
}

/**
 * Creates a unified filesystem instance
 */
export function createUnifiedFS(config?: UnifiedFSConfig): UnifiedFileSystem {
  return new UnifiedFileSystem(config);
}

/**
 * Create filesystem based on environment
 */
export function createFS(rootPath?: string): FileSystemProvider {
  if (typeof window !== 'undefined') {
    return createBrowserFS(rootPath);
  }
  return createNativeFS(rootPath);
}
