/**
 * Filesystem types
 */

export interface FileStats {
  path: string;
  size: number;
  mtime: Date;
  ctime: Date;
  atime: Date;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  mode?: number;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink' | 'unknown';
}

export interface ReadOptions {
  encoding?: BufferEncoding;
  flag?: string;
}

export interface WriteOptions {
  encoding?: BufferEncoding;
  mode?: number;
  flag?: string;
}

export interface CopyOptions {
  overwrite?: boolean;
  recursive?: boolean;
  preserveTimestamps?: boolean;
}

export interface WatchOptions {
  recursive?: boolean;
  persistent?: boolean;
}

export interface WatchEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  stats?: FileStats;
}

export type WatchCallback = (event: WatchEvent) => void;

export interface FileSystemProvider {
  readonly type: 'native' | 'virtual' | 'browser';
  readonly rootPath: string;

  // Read operations
  readFile(path: string, options?: ReadOptions): Promise<string | Buffer>;
  readDirectory(path: string): Promise<DirectoryEntry[]>;
  stat(path: string): Promise<FileStats>;
  exists(path: string): Promise<boolean>;

  // Write operations
  writeFile(path: string, content: string | Buffer, options?: WriteOptions): Promise<void>;
  createDirectory(path: string, recursive?: boolean): Promise<void>;
  delete(path: string, recursive?: boolean): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  copy(source: string, destination: string, options?: CopyOptions): Promise<void>;

  // Watch operations
  watch(path: string, callback: WatchCallback, options?: WatchOptions): () => void;

  // Utility
  resolve(...paths: string[]): string;
  relative(from: string, to: string): string;
  join(...paths: string[]): string;
  dirname(path: string): string;
  basename(path: string, ext?: string): string;
  extname(path: string): string;
}
