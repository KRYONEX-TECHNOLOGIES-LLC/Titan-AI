/**
 * File watcher using chokidar
 */

import * as chokidar from 'chokidar';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { FileChange, WorkspaceConfig } from './types';

export interface FileWatcherOptions {
  ignorePatterns?: string[];
  usePolling?: boolean;
  pollInterval?: number;
  awaitWriteFinish?: boolean;
  depth?: number;
}

export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private rootPath: string = '';
  private options: FileWatcherOptions;
  private isReady: boolean = false;
  private changeBuffer: FileChange[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceMs: number = 100;

  constructor(options: FileWatcherOptions = {}) {
    super();
    this.options = {
      ignorePatterns: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
      usePolling: false,
      pollInterval: 1000,
      awaitWriteFinish: true,
      depth: 10,
      ...options,
    };
  }

  async start(rootPath: string, config?: WorkspaceConfig): Promise<void> {
    if (this.watcher) {
      await this.stop();
    }

    this.rootPath = path.resolve(rootPath);
    
    const ignorePatterns = config?.excludePatterns?.map(p => `**/${p}/**`) ?? this.options.ignorePatterns;

    this.watcher = chokidar.watch(this.rootPath, {
      ignored: ignorePatterns,
      persistent: true,
      ignoreInitial: true,
      usePolling: this.options.usePolling,
      interval: this.options.pollInterval,
      awaitWriteFinish: this.options.awaitWriteFinish ? {
        stabilityThreshold: 200,
        pollInterval: 100,
      } : false,
      depth: this.options.depth,
    });

    this.setupEventHandlers();

    return new Promise((resolve) => {
      this.watcher!.on('ready', () => {
        this.isReady = true;
        this.emit('ready');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.isReady = false;
      this.emit('stopped');
    }
  }

  private setupEventHandlers(): void {
    if (!this.watcher) return;

    this.watcher.on('add', (filePath) => {
      this.handleChange('add', filePath);
    });

    this.watcher.on('change', (filePath) => {
      this.handleChange('change', filePath);
    });

    this.watcher.on('unlink', (filePath) => {
      this.handleChange('unlink', filePath);
    });

    this.watcher.on('addDir', (filePath) => {
      this.handleChange('addDir', filePath);
    });

    this.watcher.on('unlinkDir', (filePath) => {
      this.handleChange('unlinkDir', filePath);
    });

    this.watcher.on('error', (error) => {
      this.emit('error', error);
    });
  }

  private handleChange(type: FileChange['type'], absolutePath: string): void {
    const relativePath = path.relative(this.rootPath, absolutePath);
    
    const change: FileChange = {
      type,
      path: absolutePath,
      relativePath,
      timestamp: new Date(),
    };

    this.changeBuffer.push(change);
    this.emit('change', change);

    // Debounce batch emissions
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      if (this.changeBuffer.length > 0) {
        this.emit('changes', [...this.changeBuffer]);
        this.changeBuffer = [];
      }
    }, this.debounceMs);
  }

  addPath(filePath: string): void {
    this.watcher?.add(filePath);
  }

  removePath(filePath: string): void {
    this.watcher?.unwatch(filePath);
  }

  getWatched(): Record<string, string[]> {
    return this.watcher?.getWatched() ?? {};
  }

  isWatching(): boolean {
    return this.isReady && this.watcher !== null;
  }

  setDebounceMs(ms: number): void {
    this.debounceMs = ms;
  }
}

/**
 * Creates a file watcher with default configuration
 */
export function createFileWatcher(options?: FileWatcherOptions): FileWatcher {
  return new FileWatcher(options);
}
