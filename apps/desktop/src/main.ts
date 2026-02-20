import { app, BrowserWindow, protocol, ipcMain } from 'electron';
import * as path from 'path';
import * as http from 'http';
import Store from 'electron-store';
import { registerToolHandlers } from './ipc/tools.js';
import { registerTerminalHandlers } from './ipc/terminal.js';
import { registerFilesystemHandlers } from './ipc/filesystem.js';
import { registerGitHandlers } from './ipc/git.js';
import { registerLinterHandlers } from './ipc/linter.js';
import { registerSearchHandlers } from './ipc/search.js';
import { registerWebHandlers } from './ipc/web.js';
import { registerAuthHandlers } from './auth/github.js';
import { createAppMenu } from './menu/app-menu.js';
import { createMainWindow, restoreWindowState, saveWindowState } from './window/main-window.js';

// Catch EPIPE and other non-fatal pipe errors so the app doesn't crash
process.on('uncaughtException', (err) => {
  const msg = err?.message || '';
  if (msg.includes('EPIPE') || msg.includes('ECONNRESET') || msg.includes('ECONNREFUSED') || msg.includes('write after end')) {
    console.error('[Main] Pipe error (non-fatal):', msg);
    return;
  }
  console.error('[Main] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason);
});

const store = new Store({
  defaults: {
    windowState: { width: 1400, height: 900, x: undefined, y: undefined, isMaximized: false },
    recentFolders: [] as string[],
    lastOpenedFolder: undefined as string | undefined,
  },
});

let mainWindow: BrowserWindow | null = null;
let nextServerProcess: ReturnType<typeof import('child_process').spawn> | null = null;
let serverPort: number = 0;

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error('Could not find free port'));
      }
    });
  });
}

async function startNextServer(port: number): Promise<void> {
  const { spawn } = await import('child_process');
  const webDir = path.join(__dirname, '..', '..', 'web');

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      ELECTRON: 'true',
    };

    nextServerProcess = spawn('npx', ['next', 'start', '-p', String(port)], {
      cwd: webDir,
      env,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let resolved = false;

    nextServerProcess.stdout?.on('error', () => {});
    nextServerProcess.stderr?.on('error', () => {});
    nextServerProcess.stdin?.on('error', () => {});

    nextServerProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      console.log('[Next.js]', output);
      if (!resolved && (output.includes('Ready') || output.includes('started server'))) {
        resolved = true;
        resolve();
      }
    });

    nextServerProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[Next.js Error]', data.toString());
    });

    nextServerProcess.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    nextServerProcess.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Next.js server exited with code ${code}`));
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    }, 15000);
  });
}

async function createWindow(): Promise<void> {
  const windowState = restoreWindowState(store);

  mainWindow = createMainWindow(windowState);

  mainWindow.on('close', () => {
    if (mainWindow) {
      saveWindowState(mainWindow, store);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  registerAllIPC(mainWindow);
  createAppMenu(mainWindow);

  mainWindow.loadURL(`http://localhost:${serverPort}`);
}

function registerAllIPC(win: BrowserWindow): void {
  registerToolHandlers(ipcMain);
  registerTerminalHandlers(ipcMain, win);
  registerFilesystemHandlers(ipcMain, win);
  registerGitHandlers(ipcMain);
  registerLinterHandlers(ipcMain, win);
  registerSearchHandlers(ipcMain);
  registerWebHandlers(ipcMain);
  registerAuthHandlers(ipcMain, win);

  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getPlatform', () => process.platform);
  ipcMain.handle('app:isElectron', () => true);

  ipcMain.handle('store:get', (_e, key: string) => store.get(key));
  ipcMain.handle('store:set', (_e, key: string, value: unknown) => store.set(key, value));

  ipcMain.handle('recent-folders:get', () => store.get('recentFolders', []));
  ipcMain.handle('recent-folders:add', (_e, folderPath: string) => {
    const recent = store.get('recentFolders', []) as string[];
    const updated = [folderPath, ...recent.filter((f: string) => f !== folderPath)].slice(0, 10);
    store.set('recentFolders', updated);
    store.set('lastOpenedFolder', folderPath);
    return updated;
  });
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'titan-ai',
    privileges: { secure: true, standard: true, supportFetchAPI: true },
  },
]);

app.whenReady().then(async () => {
  try {
    serverPort = await findFreePort();
    console.log(`Starting Next.js on port ${serverPort}...`);
    await startNextServer(serverPort);
    console.log('Next.js server ready');
    await createWindow();
  } catch (err) {
    console.error('Failed to start:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (nextServerProcess) {
    nextServerProcess.kill();
    nextServerProcess = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});

app.on('before-quit', () => {
  if (nextServerProcess) {
    nextServerProcess.kill();
    nextServerProcess = null;
  }
});
