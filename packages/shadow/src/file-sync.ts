/**
 * Titan AI Shadow - File Sync
 * Bidirectional file synchronization
 */

import { readdir, stat, mkdir, copyFile, rm, readFile } from 'fs/promises';
import { join, relative } from 'path';
import { createHash } from 'crypto';
import type { FileChange, SyncResult } from './types.js';

export interface FileSyncConfig {
  sourcePath: string;
  targetPath: string;
  includePatterns: string[];
  excludePatterns: string[];
}

export class FileSync {
  private config: FileSyncConfig;
  private sourceHashes: Map<string, string> = new Map();
  private targetHashes: Map<string, string> = new Map();

  constructor(config: FileSyncConfig) {
    this.config = config;
  }

  /**
   * Sync files from source to target
   */
  async sync(): Promise<Omit<SyncResult, 'duration'>> {
    const result: Omit<SyncResult, 'duration'> = {
      added: [],
      modified: [],
      deleted: [],
      errors: [],
    };

    try {
      // Get all files in source
      const sourceFiles = await this.getFiles(this.config.sourcePath);

      // Get all files in target
      const targetFiles = await this.getFiles(this.config.targetPath);
      const targetSet = new Set(targetFiles);

      // Process source files
      for (const file of sourceFiles) {
        const sourcePath = join(this.config.sourcePath, file);
        const targetPath = join(this.config.targetPath, file);

        try {
          // Check if file should be included
          if (!this.shouldInclude(file)) continue;

          const sourceHash = await this.hashFile(sourcePath);
          this.sourceHashes.set(file, sourceHash);

          if (targetSet.has(file)) {
            // File exists in target
            const targetHash = await this.hashFile(targetPath);
            if (sourceHash !== targetHash) {
              await this.copyFileSafe(sourcePath, targetPath);
              result.modified.push(file);
            }
            targetSet.delete(file);
          } else {
            // New file
            await this.copyFileSafe(sourcePath, targetPath);
            result.added.push(file);
          }
        } catch (error) {
          result.errors.push(`${file}: ${error}`);
        }
      }

      // Delete files that no longer exist in source
      for (const file of targetSet) {
        if (!this.shouldInclude(file)) continue;

        try {
          const targetPath = join(this.config.targetPath, file);
          await rm(targetPath, { force: true });
          result.deleted.push(file);
        } catch (error) {
          result.errors.push(`${file}: ${error}`);
        }
      }
    } catch (error) {
      result.errors.push(`Sync error: ${error}`);
    }

    return result;
  }

  /**
   * Detect changes in target compared to source
   */
  async detectChanges(): Promise<FileChange[]> {
    const changes: FileChange[] = [];

    try {
      const targetFiles = await this.getFiles(this.config.targetPath);

      for (const file of targetFiles) {
        if (!this.shouldInclude(file)) continue;

        const targetPath = join(this.config.targetPath, file);
        const sourcePath = join(this.config.sourcePath, file);

        try {
          const targetHash = await this.hashFile(targetPath);
          const sourceHash = this.sourceHashes.get(file);

          if (!sourceHash) {
            // New file in target
            changes.push({
              path: file,
              action: 'create',
              content: await readFile(targetPath, 'utf-8'),
            });
          } else if (targetHash !== sourceHash) {
            // Modified file
            changes.push({
              path: file,
              action: 'modify',
              content: await readFile(targetPath, 'utf-8'),
            });
          }
        } catch (error) {
          // File might not exist
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return changes;
  }

  /**
   * Get all files in a directory recursively
   */
  private async getFiles(dir: string, prefix = ''): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          const subFiles = await this.getFiles(
            join(dir, entry.name),
            relativePath
          );
          files.push(...subFiles);
        } else {
          files.push(relativePath);
        }
      }
    } catch {
      // Directory might not exist
    }

    return files;
  }

  /**
   * Check if file should be included
   */
  private shouldInclude(file: string): boolean {
    // Check exclude patterns first
    for (const pattern of this.config.excludePatterns) {
      if (this.matchPattern(file, pattern)) {
        return false;
      }
    }

    // Check include patterns
    if (this.config.includePatterns.length === 0) {
      return true;
    }

    for (const pattern of this.config.includePatterns) {
      if (this.matchPattern(file, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Match file against glob pattern
   */
  private matchPattern(file: string, pattern: string): boolean {
    // Simple glob matching
    const regex = pattern
      .replace(/\*\*/g, '<<<GLOBSTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<GLOBSTAR>>>/g, '.*');

    return new RegExp(`^${regex}$`).test(file);
  }

  /**
   * Hash a file
   */
  private async hashFile(path: string): Promise<string> {
    const content = await readFile(path);
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Copy file with directory creation
   */
  private async copyFileSafe(source: string, target: string): Promise<void> {
    const dir = target.substring(0, target.lastIndexOf('/'));
    if (dir) {
      await mkdir(dir, { recursive: true });
    }
    await copyFile(source, target);
  }
}
