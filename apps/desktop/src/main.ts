import { app, BrowserWindow, protocol, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as http from 'http';
import Store from 'electron-store';
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

async function startNextServer(port: number): Promise<void> {
  const { spawn } = await import('child_process');
  const webDir = path.join(__dirname, '..', '..', 'web');

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      ELECTRON: 'true',
      NEXTAUTH_URL: `http://localhost:${port}`,
      AUTH_TRUST_HOST: 'true',
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

  mainWindow.loadURL(`http://localhost:${DESKTOP_PORT}/editor`);
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

app.whenReady().then(async () => {
  try {
    app.setName('Titan AI');
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.kryonex.titan-ai');
    }
    console.log(`Starting Next.js on port ${DESKTOP_PORT}...`);
    await startNextServer(DESKTOP_PORT);
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
  killAllTerminals();
  killAllBackground();
  if (nextServerProcess) {
    nextServerProcess.kill();
    nextServerProcess = null;
  }
});
