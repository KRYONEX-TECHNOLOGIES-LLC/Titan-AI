/**
 * Workspace manager
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { WorkspaceConfig, WorkspaceState, FileState } from './types';

export class WorkspaceManager extends EventEmitter {
  private state: WorkspaceState | null = null;
  private config: WorkspaceConfig | null = null;
  private fileCache: Map<string, FileState> = new Map();

  async open(rootPath: string, config?: Partial<WorkspaceConfig>): Promise<WorkspaceState> {
    const absolutePath = path.resolve(rootPath);
    
    // Verify path exists
    const stats = await fs.stat(absolutePath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${absolutePath}`);
    }

    // Create config
    this.config = {
      rootPath: absolutePath,
      name: path.basename(absolutePath),
      excludePatterns: config?.excludePatterns ?? ['node_modules', '.git', 'dist', 'build'],
      watchEnabled: config?.watchEnabled ?? true,
      gitEnabled: config?.gitEnabled ?? true,
    };

    // Initialize state
    this.state = {
      isOpen: true,
      rootPath: absolutePath,
      name: this.config.name,
      files: new Map(),
      lastSyncedAt: new Date(),
    };

    // Scan workspace
    await this.scanWorkspace();

    this.emit('workspace:opened', this.state);
    return this.state;
  }

  async close(): Promise<void> {
    if (!this.state) return;

    this.state.isOpen = false;
    this.fileCache.clear();
    
    this.emit('workspace:closed', this.state);
    
    this.state = null;
    this.config = null;
  }

  getState(): WorkspaceState | null {
    return this.state;
  }

  getConfig(): WorkspaceConfig | null {
    return this.config;
  }

  async scanWorkspace(): Promise<Map<string, FileState>> {
    if (!this.state || !this.config) {
      throw new Error('Workspace not opened');
    }

    this.fileCache.clear();
    await this.scanDirectory(this.config.rootPath, '');
    this.state.files = new Map(this.fileCache);
    this.state.lastSyncedAt = new Date();

    this.emit('workspace:scanned', { fileCount: this.fileCache.size });
    return this.fileCache;
  }

  private async scanDirectory(absolutePath: string, relativePath: string): Promise<void> {
    if (!this.config) return;

    const entries = await fs.readdir(absolutePath, { withFileTypes: true });

    for (const entry of entries) {
      const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const entryAbsPath = path.join(absolutePath, entry.name);

      // Check exclusions
      if (this.shouldExclude(entryRelPath)) {
        continue;
      }

      try {
        const stats = await fs.stat(entryAbsPath);
        
        const fileState: FileState = {
          path: entryAbsPath,
          relativePath: entryRelPath,
          mtime: stats.mtimeMs,
          size: stats.size,
          isDirectory: entry.isDirectory(),
          isSymlink: entry.isSymbolicLink(),
        };

        this.fileCache.set(entryRelPath, fileState);

        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          await this.scanDirectory(entryAbsPath, entryRelPath);
        }
      } catch {
        // Skip files we can't access
      }
    }
  }

  private shouldExclude(relativePath: string): boolean {
    if (!this.config) return false;

    return this.config.excludePatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(relativePath);
      }
      return relativePath.includes(pattern);
    });
  }

  async getFile(relativePath: string): Promise<FileState | undefined> {
    return this.fileCache.get(relativePath);
  }

  async readFile(relativePath: string): Promise<string> {
    if (!this.config) {
      throw new Error('Workspace not opened');
    }

    const absolutePath = path.join(this.config.rootPath, relativePath);
    return fs.readFile(absolutePath, 'utf-8');
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    if (!this.config) {
      throw new Error('Workspace not opened');
    }

    const absolutePath = path.join(this.config.rootPath, relativePath);
    const dir = path.dirname(absolutePath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(absolutePath, content, 'utf-8');

    // Update cache
    const stats = await fs.stat(absolutePath);
    const fileState: FileState = {
      path: absolutePath,
      relativePath,
      content,
      mtime: stats.mtimeMs,
      size: stats.size,
      isDirectory: false,
      isSymlink: false,
    };
    this.fileCache.set(relativePath, fileState);

    this.emit('file:written', fileState);
  }

  async deleteFile(relativePath: string): Promise<void> {
    if (!this.config) {
      throw new Error('Workspace not opened');
    }

    const absolutePath = path.join(this.config.rootPath, relativePath);
    await fs.unlink(absolutePath);
    this.fileCache.delete(relativePath);

    this.emit('file:deleted', { relativePath });
  }

  async createDirectory(relativePath: string): Promise<void> {
    if (!this.config) {
      throw new Error('Workspace not opened');
    }

    const absolutePath = path.join(this.config.rootPath, relativePath);
    await fs.mkdir(absolutePath, { recursive: true });

    const stats = await fs.stat(absolutePath);
    const fileState: FileState = {
      path: absolutePath,
      relativePath,
      mtime: stats.mtimeMs,
      size: 0,
      isDirectory: true,
      isSymlink: false,
    };
    this.fileCache.set(relativePath, fileState);

    this.emit('directory:created', fileState);
  }

  async exists(relativePath: string): Promise<boolean> {
    if (!this.config) return false;

    const absolutePath = path.join(this.config.rootPath, relativePath);
    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  getFiles(pattern?: string): FileState[] {
    const files = Array.from(this.fileCache.values());
    
    if (!pattern) {
      return files;
    }

    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return files.filter(f => regex.test(f.relativePath));
  }

  getDirectories(): FileState[] {
    return Array.from(this.fileCache.values()).filter(f => f.isDirectory);
  }

  async refresh(): Promise<void> {
    await this.scanWorkspace();
    this.emit('workspace:refreshed');
  }
}
