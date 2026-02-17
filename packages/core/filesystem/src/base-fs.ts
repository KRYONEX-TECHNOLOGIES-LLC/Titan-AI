/**
 * Base filesystem provider
 */

import * as path from 'path';
import type { FileSystemProvider, ReadOptions, WriteOptions, CopyOptions, WatchOptions, WatchCallback, FileStats, DirectoryEntry } from './types';

export abstract class BaseFileSystemProvider implements FileSystemProvider {
  abstract readonly type: 'native' | 'virtual' | 'browser';
  abstract readonly rootPath: string;

  // Abstract methods to be implemented
  abstract readFile(filePath: string, options?: ReadOptions): Promise<string | Buffer>;
  abstract readDirectory(dirPath: string): Promise<DirectoryEntry[]>;
  abstract stat(filePath: string): Promise<FileStats>;
  abstract exists(filePath: string): Promise<boolean>;
  abstract writeFile(filePath: string, content: string | Buffer, options?: WriteOptions): Promise<void>;
  abstract createDirectory(dirPath: string, recursive?: boolean): Promise<void>;
  abstract delete(filePath: string, recursive?: boolean): Promise<void>;
  abstract rename(oldPath: string, newPath: string): Promise<void>;
  abstract copy(source: string, destination: string, options?: CopyOptions): Promise<void>;
  abstract watch(filePath: string, callback: WatchCallback, options?: WatchOptions): () => void;

  // Path utilities (common implementation)
  resolve(...paths: string[]): string {
    return path.resolve(this.rootPath, ...paths);
  }

  relative(from: string, to: string): string {
    return path.relative(from, to);
  }

  join(...paths: string[]): string {
    return path.join(...paths);
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  basename(filePath: string, ext?: string): string {
    return path.basename(filePath, ext);
  }

  extname(filePath: string): string {
    return path.extname(filePath);
  }

  // Helper methods
  protected normalizePath(filePath: string): string {
    // Normalize path separators
    return filePath.replace(/\\/g, '/');
  }

  protected isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }

  protected async ensureDirectory(filePath: string): Promise<void> {
    const dir = this.dirname(filePath);
    if (!(await this.exists(dir))) {
      await this.createDirectory(dir, true);
    }
  }

  // Bulk operations
  async readFiles(paths: string[], options?: ReadOptions): Promise<Map<string, string | Buffer>> {
    const results = new Map<string, string | Buffer>();
    await Promise.all(
      paths.map(async (p) => {
        try {
          const content = await this.readFile(p, options);
          results.set(p, content);
        } catch {
          // Skip files that can't be read
        }
      })
    );
    return results;
  }

  async writeFiles(files: Map<string, string | Buffer>, options?: WriteOptions): Promise<void> {
    await Promise.all(
      Array.from(files.entries()).map(([p, content]) =>
        this.writeFile(p, content, options)
      )
    );
  }

  async deleteFiles(paths: string[]): Promise<void> {
    await Promise.all(paths.map((p) => this.delete(p)));
  }

  // Tree operations
  async walkDirectory(
    dirPath: string,
    callback: (entry: DirectoryEntry, depth: number) => boolean | void,
    maxDepth: number = Infinity
  ): Promise<void> {
    const walk = async (currentPath: string, depth: number): Promise<void> => {
      if (depth > maxDepth) return;

      const entries = await this.readDirectory(currentPath);
      
      for (const entry of entries) {
        const shouldContinue = callback(entry, depth);
        if (shouldContinue === false) continue;

        if (entry.type === 'directory') {
          await walk(entry.path, depth + 1);
        }
      }
    };

    await walk(dirPath, 0);
  }

  async findFiles(
    dirPath: string,
    pattern: RegExp,
    maxDepth: number = Infinity
  ): Promise<string[]> {
    const matches: string[] = [];
    
    await this.walkDirectory(
      dirPath,
      (entry) => {
        if (entry.type === 'file' && pattern.test(entry.name)) {
          matches.push(entry.path);
        }
      },
      maxDepth
    );
    
    return matches;
  }
}
