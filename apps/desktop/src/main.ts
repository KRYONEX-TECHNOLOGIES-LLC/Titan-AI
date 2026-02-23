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
import { createMainWindow, restoreWindowState, saveWindowState } from './window/main-window.js';

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

async function startNextServer(port: number): Promise<void> {
  const { spawn } = await import('child_process');
  const isDev = !app.isPackaged;

  // If something is already listening on this port (e.g. a stale server from a
  // previous crash), skip spawning — the existing server will be reused.
  const portOccupied = await isPortInUse(port);
  if (portOccupied) {
    console.log(`[Next.js] Port ${port} already in use — reusing existing server.`);
    return;
  }

  // Dev: apps/desktop/dist/../../web => apps/web/
  // Packaged: Next.js standalone copies the monorepo structure, so server.js lives at
  //           resources/web-server/apps/web/server.js (mirrors outputFileTracingRoot layout)
  const webDir = isDev
    ? path.join(__dirname, '..', '..', 'web')
    : path.join(process.resourcesPath, 'web-server', 'apps', 'web');

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PORT: String(port),
      HOSTNAME: 'localhost',
      NODE_ENV: isDev ? 'development' : 'production',
      ELECTRON: 'true',
      NEXTAUTH_URL: `http://localhost:${port}`,
      AUTH_TRUST_HOST: 'true',
    };

    if (isDev) {
      const nextArgs = ['next', 'dev', '-p', String(port), '--turbopack'];
      nextServerProcess = spawn('npx', nextArgs, {
        cwd: webDir,
        env,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      // Use Electron's own bundled Node (process.execPath) to run the standalone server.
      // ELECTRON_RUN_AS_NODE=1 is critical: without it, process.execPath launches a full
      // Electron window instead of behaving as Node, causing infinite window spawning.
      // Use relative path — absolute paths with spaces (e.g. "C:\Program Files\...")
      // get split by Electron's ELECTRON_RUN_AS_NODE argument parser on Windows.
      nextServerProcess = spawn(process.execPath, ['./server.js'], {
        cwd: webDir,
        env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }

    let resolved = false;

    nextServerProcess.stdout?.on('error', () => {});
    nextServerProcess.stderr?.on('error', () => {});
    nextServerProcess.stdin?.on('error', () => {});

    nextServerProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      console.log('[Next.js]', output);
      if (!resolved && (output.includes('Ready') || output.includes('started server') || output.includes('Listening on'))) {
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
    }, 8000);
  });
}

function openAuthPopup(authUrl: string, parent: BrowserWindow): void {
  const popup = new BrowserWindow({
    width: 520,
    height: 720,
    parent,
    modal: true,
    title: 'Sign In — Titan AI',
    backgroundColor: '#0a0a14',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  popup.setMenuBarVisibility(false);
  popup.loadURL(authUrl);

  const emitOAuthError = (message: string) => {
    const safeMessage = JSON.stringify(message || 'OAuth sign-in failed.');
    const script = `window.dispatchEvent(new CustomEvent('titan-oauth-error', { detail: { message: ${safeMessage} } }));`;
    parent.webContents.executeJavaScript(script).catch(() => {});
  };

  const interceptCallback = (event: Electron.Event, navUrl: string) => {
    if (navUrl.startsWith(`http://localhost:${DESKTOP_PORT}/auth/callback`)) {
      event.preventDefault();
      popup.close();
      parent.loadURL(navUrl);
    }
  };

  popup.webContents.on('will-navigate', interceptCallback);
  popup.webContents.on('will-redirect', interceptCallback);

  popup.webContents.on('did-finish-load', async () => {
    const currentUrl = popup.webContents.getURL();
    if (!currentUrl.includes('.supabase.co/auth')) return;

    try {
      const bodyText = await popup.webContents.executeJavaScript('document.body?.innerText || ""');
      const raw = typeof bodyText === 'string' ? bodyText.trim() : '';
      if (!raw.startsWith('{') || !raw.endsWith('}')) return;

      const parsed = JSON.parse(raw) as {
        error_description?: string;
        msg?: string;
        error?: string;
      };
      const errMsg =
        parsed.error_description ||
        parsed.msg ||
        parsed.error ||
        'OAuth provider is not configured correctly.';
      popup.close();
      emitOAuthError(errMsg);
    } catch {
      // Non-JSON body or cross-origin read error means the provider page loaded normally.
    }
  });

  popup.webContents.on('did-fail-load', () => {
    popup.close();
    emitOAuthError('OAuth sign-in failed to load. Please try again.');
  });
}

function setupOAuthInterceptor(win: BrowserWindow): void {
  win.webContents.on('will-navigate', (event, url) => {
    if (
      url.includes('.supabase.co/auth/v1/authorize') ||
      url.includes('accounts.google.com/o/oauth2') ||
      url.includes('appleid.apple.com/auth/authorize')
    ) {
      event.preventDefault();
      openAuthPopup(url, win);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.includes('.supabase.co/auth') ||
      url.includes('accounts.google.com') ||
      url.includes('appleid.apple.com')
    ) {
      openAuthPopup(url, win);
      return { action: 'deny' };
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });
}

const LOADING_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Titan AI</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a14;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}.wrap{text-align:center}.logo{font-size:1.8rem;font-weight:700;margin-bottom:.75rem;letter-spacing:-.02em}.sub{color:#8b8ba8;font-size:.9rem;margin-bottom:2rem}.dots span{display:inline-block;width:8px;height:8px;border-radius:50%;background:#6c5ce7;margin:0 4px;animation:bounce 1.2s infinite}.dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-10px)}}</style></head><body><div class="wrap"><div class="logo">Titan AI</div><div class="sub">Starting up…</div><div class="dots"><span></span><span></span><span></span></div></div></body></html>`;

const ERROR_HTML = (port: number) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Titan AI — Error</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a14;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}.wrap{text-align:center;max-width:440px;padding:0 1.5rem}.title{font-size:1.6rem;font-weight:700;margin-bottom:.75rem}.msg{color:#8b8ba8;font-size:.9rem;line-height:1.6;margin-bottom:2rem}button{background:#6c5ce7;color:#fff;border:none;padding:.7rem 2rem;border-radius:8px;font-size:.95rem;cursor:pointer}button:hover{background:#5a4bd1}</style></head><body><div class="wrap"><div class="title">Unable to start</div><div class="msg">Titan AI's internal server could not start on port ${port}.<br>Close any other copies of the app and try again.</div><button onclick="window.location.reload()">Restart</button></div></body></html>`;

async function loadWithRetry(win: BrowserWindow, url: string, maxRetries = 5): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await win.loadURL(url);
      return;
    } catch {
      console.log(`[Main] loadURL attempt ${attempt}/${maxRetries} failed, retrying in 500ms...`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }
  console.error(`[Main] All ${maxRetries} loadURL attempts failed for ${url}`);
  await win.loadURL(`data:text/html,${encodeURIComponent(ERROR_HTML(DESKTOP_PORT))}`);
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
  setupOAuthInterceptor(mainWindow);

  // Show a loading screen immediately so the user sees the app right away
  // instead of waiting up to 15 s with nothing on screen.
  await mainWindow.loadURL(`data:text/html,${encodeURIComponent(LOADING_HTML)}`);
}

function registerAllIPC(win: BrowserWindow): void {
  registerToolHandlers(ipcMain, win);
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

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle('shell:showItemInFolder', async (_e, itemPath: string) => {
    if (itemPath) {
      shell.showItemInFolder(itemPath);
    }
  });
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'titan-ai',
    privileges: { secure: true, standard: true, supportFetchAPI: true },
  },
]);

// When a second instance tries to launch, bring the existing window to front instead.
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  try {
    app.setName('Titan AI');
    if (process.platform === 'win32') {
      // Must match electron-builder appId exactly — Windows uses this to associate
      // the taskbar icon, Start menu entry, and window grouping.
      app.setAppUserModelId('com.kryonex.titan-desktop');
    }

    // Show the window immediately with a loading screen so the user
    // always sees something — no more invisible 15-second wait.
    await createWindow();

    console.log(`Starting Next.js on port ${DESKTOP_PORT}...`);
    await startNextServer(DESKTOP_PORT);
    console.log('Next.js server ready');

    // Navigate the already-visible window to the real app.
    if (mainWindow) {
      await loadWithRetry(mainWindow, `http://localhost:${DESKTOP_PORT}/editor`);
    }

    setupAutoUpdater();
  } catch (err) {
    console.error('Failed to start:', err);
    dialog.showErrorBox(
      'Titan AI — Startup Failed',
      `The internal server could not start.\n\nError: ${err instanceof Error ? err.message : String(err)}\n\nPlease close any other copies of Titan AI and try again.`
    );
    app.quit();
  }
});

function killServerProcess() {
  if (!nextServerProcess) return;
  const pid = nextServerProcess.pid;
  nextServerProcess.removeAllListeners();
  try {
    if (process.platform === 'win32' && pid) {
      // Force-kill the entire process tree on Windows — .kill() only sends
      // SIGTERM which Node/Windows silently ignores, leaving zombie processes.
      require('child_process').execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } else {
      nextServerProcess.kill('SIGKILL');
    }
  } catch {
    // Process may already be gone — that's fine
  }
  nextServerProcess = null;
}

app.on('window-all-closed', () => {
  killServerProcess();
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
  killAllTerminals();
  killAllBackground();
  killServerProcess();
});

// Final safety net: if the main process exits for any reason, take the server with it
process.on('exit', () => {
  killServerProcess();
});
