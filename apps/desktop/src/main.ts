import { app, BrowserWindow, protocol, ipcMain, shell, dialog } from 'electron';
import * as path from 'path';
import * as http from 'http';

// GPU acceleration + input responsiveness — must be set before app.whenReady()
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-software-rasterization');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
if (process.platform === 'win32') {
  // Removes the Windows occlusion-detection overhead that throttles hidden windows
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}
import Store from 'electron-store';
import { autoUpdater } from 'electron-updater';
import { registerToolHandlers, killAllBackground } from './ipc/tools.js';
import { registerTerminalHandlers, killAllTerminals } from './ipc/terminal.js';
import { registerFilesystemHandlers } from './ipc/filesystem.js';
import { registerGitHandlers } from './ipc/git.js';
import { registerLinterHandlers } from './ipc/linter.js';
import { registerSearchHandlers } from './ipc/search.js';
import { registerWebHandlers } from './ipc/web.js';
import { registerAuthHandlers } from './auth/github.js';
import { createAppMenu } from './menu/app-menu.js';
import { setupIndexerIPC } from './ipc/indexer.js';
import { createMainWindow, restoreWindowState, saveWindowState } from './window/main-window.js';
import * as chokidar from 'chokidar';

// Enforce single instance — if another copy is already running, focus it and exit this one.
// Use only app.quit() — process.exit() can conflict with elevated NSIS post-install launch.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

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
const DESKTOP_PORT = 3100;
let updatePromptOpen = false;

function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    console.log('[Updater] Skipping update checks in development mode.');
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', async (info) => {
    if (updatePromptOpen || !mainWindow) return;
    updatePromptOpen = true;
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `Titan AI ${info.version} is available.`,
      detail: 'Update now to get the latest fixes and improvements.',
      buttons: ['Update Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    updatePromptOpen = false;

    if (response === 0) {
      try {
        await autoUpdater.downloadUpdate();
      } catch (error) {
        console.error('[Updater] Failed to download update:', error);
      }
    }
  });

  autoUpdater.on('update-downloaded', async (info) => {
    if (updatePromptOpen || !mainWindow) return;
    updatePromptOpen = true;
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Titan AI ${info.version} is ready to install.`,
      detail: 'Restart now to finish installing the update.',
      buttons: ['Restart and Install', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    updatePromptOpen = false;

    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (error) => {
    console.error('[Updater] Update check failed:', error);
  });

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    console.error('[Updater] checkForUpdatesAndNotify failed:', error);
  });
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      resolve(err.code === 'EADDRINUSE');
    });
    server.once('listening', () => {
      server.close(() => resolve(false));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function startNextJsServer(port: number): Promise<void> {
  const isDev = process.env.NODE_ENV !== 'production';
  const webAppPath = isDev
    ? path.join(__dirname, '../../web') // In dev, it's a sibling project
    : path.join(process.resourcesPath, 'app/apps/web'); // In prod, it's in the ASAR archive

  console.log(`[Next.js] Starting server in ${isDev ? 'development' : 'production'} mode...`);
  console.log(`[Next.js] Web app path: ${webAppPath}`);

  const command = 'npx';
  const args = ['next', isDev ? 'dev' : 'start', '-p', String(port)];

  try {
    const { spawn } = await import('child_process');
    nextServerProcess = spawn(command, args, {
      cwd: webAppPath,
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });

    nextServerProcess.stdout?.on('data', (data) => {
      console.log(`[Next.js] ${data.toString().trim()}`);
    });

    nextServerProcess.stderr?.on('data', (data) => {
      console.error(`[Next.js] Error: ${data.toString().trim()}`);
    });

    nextServerProcess.on('close', (code) => {
      console.log(`[Next.js] Server process exited with code ${code}`);
      nextServerProcess = null;
    });

    process.on('exit', () => {
      if (nextServerProcess) {
        console.log('[Next.js] Killing server process on app exit.');
        nextServerProcess.kill();
      }
    });
  } catch (error) {
    console.error('[Next.js] Failed to start server:', error);
  }
}

function registerIpcHandlers(browserWindow: BrowserWindow): void {
  registerToolHandlers(browserWindow);
  registerTerminalHandlers(browserWindow);
  registerFilesystemHandlers(browserWindow);
  registerGitHandlers();
  registerLinterHandlers();
  registerSearchHandlers();
  registerWebHandlers();
  registerAuthHandlers(browserWindow);
  setupIndexerIPC();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  killAllTerminals();
  killAllBackground();
  if (nextServerProcess) {
    nextServerProcess.kill();
  }
});

app.whenReady().then(async () => {
  const portInUse = await isPortInUse(DESKTOP_PORT);
  if (portInUse) {
    console.log(`[Main] Port ${DESKTOP_PORT} is in use. Assuming web server is already running.`);
  } else {
    await startNextJsServer(DESKTOP_PORT);
  }

  const windowState = restoreWindowState(store);
  mainWindow = createMainWindow(windowState);

  mainWindow.on('resize', () => saveWindowState(store, mainWindow));
  mainWindow.on('move', () => saveWindowState(store, mainWindow));
  mainWindow.on('close', () => saveWindowState(store, mainWindow));

  // Intercept new window requests (e.g., from external links) and open them in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Serve the Next.js app
  const url = `http://127.0.0.1:${DESKTOP_PORT}`;
  mainWindow.loadURL(url).catch((err) => {
    console.error('[Main] Failed to load URL:', err);
    // Optional: Add retry logic or a fallback page
  });

  registerIpcHandlers(mainWindow);

  protocol.registerFileProtocol('file', (request, callback) => {
    const pathname = decodeURI(request.url.replace('file:///', ''));
    callback(pathname);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(restoreWindowState(store));
    }
  });

  createAppMenu(store);
  setupAutoUpdater();

  const workspacePath = store.get('lastOpenedFolder') as string;
  if (workspacePath) {
    const watcher = chokidar.watch(workspacePath, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true
    });

    watcher
      .on('add', path => {
        if (mainWindow) {
          mainWindow.webContents.send('indexer:file-added', { filePath: path });
        }
      })
      .on('change', path => {
        if (mainWindow) {
          mainWindow.webContents.send('indexer:file-changed', { filePath: path });
        }
      })
      .on('unlink', path => {
        if (mainWindow) {
          mainWindow.webContents.send('indexer:file-deleted', { filePath: path });
        }
      });
  }
});
