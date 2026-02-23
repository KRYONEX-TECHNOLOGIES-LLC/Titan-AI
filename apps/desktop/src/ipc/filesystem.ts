import { IpcMain, BrowserWindow, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'out', '.turbo',
  '__pycache__', '.venv', 'venv', '.cache', 'coverage',
]);

let watcher: import('chokidar').FSWatcher | null = null;

export function registerFilesystemHandlers(ipcMain: IpcMain, win: BrowserWindow): void {

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Open Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0]!;
  });

  ipcMain.handle('dialog:openFile', async (_e, filters?: Array<{ name: string; extensions: string[] }>) => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: filters ?? [{ name: 'All Files', extensions: ['*'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0]!;
  });

  ipcMain.handle('dialog:saveFile', async (_e, defaultPath?: string, filters?: Array<{ name: string; extensions: string[] }>) => {
    const result = await dialog.showSaveDialog(win, {
      defaultPath,
      filters: filters ?? [{ name: 'All Files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle('fs:readDir', async (_e, dirPath: string, opts?: { recursive?: boolean }) => {
    const resolved = path.resolve(dirPath);
    return readDirRecursive(resolved, opts?.recursive ?? true, 0, 4);
  });

  ipcMain.handle('fs:readFile', async (_e, filePath: string) => {
    const resolved = path.resolve(filePath);
    return fs.promises.readFile(resolved, 'utf-8');
  });

  ipcMain.handle('fs:writeFile', async (_e, filePath: string, content: string) => {
    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(resolved, content, 'utf-8');
  });

  ipcMain.handle('fs:deleteFile', async (_e, filePath: string) => {
    const resolved = path.resolve(filePath);
    const stat = await fs.promises.stat(resolved);
    if (stat.isDirectory()) {
      await fs.promises.rm(resolved, { recursive: true, force: true });
    } else {
      await fs.promises.unlink(resolved);
    }
  });

  ipcMain.handle('fs:stat', async (_e, filePath: string) => {
    const resolved = path.resolve(filePath);
    const stat = await fs.promises.stat(resolved);
    return {
      size: stat.size,
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      mtime: stat.mtime.toISOString(),
    };
  });

  ipcMain.handle('fs:exists', async (_e, filePath: string) => {
    return fs.promises.access(path.resolve(filePath)).then(() => true).catch(() => false);
  });

  ipcMain.handle('fs:mkdir', async (_e, dirPath: string) => {
    const resolved = path.resolve(dirPath);
    await fs.promises.mkdir(resolved, { recursive: true });
  });

  ipcMain.handle('fs:watchFolder', async (_e, dirPath: string) => {
    if (watcher) {
      await watcher.close();
    }

    const chokidar = await import('chokidar');
    const resolved = path.resolve(dirPath);

    watcher = chokidar.watch(resolved, {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        '**/dist/**',
        '**/out/**',
      ],
      persistent: true,
      ignoreInitial: true,
      depth: 10,
    });

    watcher.on('add', (fp) => {
      if (!win.isDestroyed()) win.webContents.send('fs:watchEvent', 'add', fp);
    });
    watcher.on('change', (fp) => {
      if (!win.isDestroyed()) win.webContents.send('fs:watchEvent', 'change', fp);
    });
    watcher.on('unlink', (fp) => {
      if (!win.isDestroyed()) win.webContents.send('fs:watchEvent', 'unlink', fp);
    });
    watcher.on('addDir', (fp) => {
      if (!win.isDestroyed()) win.webContents.send('fs:watchEvent', 'addDir', fp);
    });
    watcher.on('unlinkDir', (fp) => {
      if (!win.isDestroyed()) win.webContents.send('fs:watchEvent', 'unlinkDir', fp);
    });
  });

  ipcMain.handle('fs:unwatchFolder', async () => {
    if (watcher) {
      await watcher.close();
      watcher = null;
    }
  });
}

function readDirRecursive(dirPath: string, recursive: boolean, depth: number, maxDepth: number): FileNode[] {
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const result: FileNode[] = [];

    const sorted = items.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const item of sorted) {
      if (item.name.startsWith('.') && IGNORED_DIRS.has(item.name.slice(1))) continue;
      if (IGNORED_DIRS.has(item.name)) continue;

      const fullPath = path.join(dirPath, item.name);

      if (item.isDirectory()) {
        const node: FileNode = {
          name: item.name,
          path: fullPath,
          type: 'directory',
        };
        if (recursive && depth < maxDepth) {
          node.children = readDirRecursive(fullPath, true, depth + 1, maxDepth);
        }
        result.push(node);
      } else {
        // Use the dirent's known fact that it's a file; skip extra stat call for size
        // (size is cosmetic in the tree view, not worth a sync stat per file)
        result.push({ name: item.name, path: fullPath, type: 'file' });
      }
    }

    return result;
  } catch {
    return [];
  }
}
