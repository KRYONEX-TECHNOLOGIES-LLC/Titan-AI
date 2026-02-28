import { app, BrowserWindow, protocol, ipcMain, shell, dialog } from 'electron';
import * as path from 'path';
import * as http from 'http';

// GPU acceleration + input responsiveness — must be set before app.whenReady()
// app.commandLine.appendSwitch('enable-gpu-rasterization');
// app.commandLine.appendSwitch('enable-zero-copy');
// app.commandLine.appendSwitch('disable-software-rasterization');
// app.commandLine.appendSwitch('disable-renderer-backgrounding');
// app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// Web Speech API: Google's speech service rejects non-Chrome user agents.
// Spoof a standard Chrome UA so webkitSpeechRecognition works in Electron.
app.commandLine.appendSwitch('enable-features', 'WebSpeechAPI');
if (process.platform === 'win32') {
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
import * as fs from 'fs';
import { execSync, spawn, spawnSync } from 'child_process';

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

  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }, 30 * 60 * 1000);
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
  const isDev = !app.isPackaged;

  let command: string;
  let args: string[];
  let cwd: string;
  let env: NodeJS.ProcessEnv;

  if (isDev) {
    // Development: run next dev from the sibling web project directory
    cwd = path.join(__dirname, '../../web');
    command = 'npx';
    args = ['next', 'dev', '-p', String(port)];
    env = process.env;
  } else {
    cwd = path.join(process.resourcesPath, 'web-server', 'apps', 'web');
    command = process.execPath;
    args = [path.join(cwd, 'server.js')];

    // Next.js standalone server.js does NOT auto-load .env files.
    // Try multiple locations, merge all found (later files override earlier ones).
    const dotEnvVars: Record<string, string> = {};
    const envPaths = [
      path.join(cwd, '.env'),                                // bundled by CI via extraResources
      path.join(app.getPath('userData'), '.env'),             // user-provided fallback
      path.join(app.getPath('home'), '.titan', '.env'),       // global Titan config
    ];

    function parseEnvFile(filePath: string): Record<string, string> {
      const vars: Record<string, string> = {};
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        for (const line of raw.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx < 1) continue;
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (val) vars[key] = val;
        }
        console.log(`[Env] Loaded ${Object.keys(vars).length} vars from ${filePath}`);
      } catch {
        console.log(`[Env] Not found: ${filePath}`);
      }
      return vars;
    }

    for (const envPath of envPaths) {
      Object.assign(dotEnvVars, parseEnvFile(envPath));
    }

    const hasLLMKey = !!(dotEnvVars.OPENROUTER_API_KEY || dotEnvVars.TITAN_LITELLM_BASE_URL);
    console.log(`[Env] Total vars loaded: ${Object.keys(dotEnvVars).length}`);
    console.log(`[Env] LLM provider configured: ${hasLLMKey}`);
    console.log(`[Env] OPENROUTER_API_KEY present: ${!!dotEnvVars.OPENROUTER_API_KEY}`);

    if (!hasLLMKey) {
      console.error(`[Env] WARNING: No LLM API key found. The app will not be able to chat.`);
      console.error(`[Env] To fix: create a .env file at ${envPaths[1]} with your OPENROUTER_API_KEY`);
    }

    env = {
      ...dotEnvVars,
      ...process.env,
      ...dotEnvVars,  // dotEnvVars wins over system env for API keys
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      ELECTRON_RUN_AS_NODE: '1',
    };
  }

  console.log(`[Next.js] Starting server (${isDev ? 'dev' : 'prod'})...`);
  console.log(`[Next.js] cwd: ${cwd}`);

  try {
    nextServerProcess = spawn(command, args, {
      cwd,
      stdio: 'pipe',
      shell: isDev && process.platform === 'win32',
      env,
    });

    nextServerProcess.stdout?.on('data', (data) => {
      console.log(`[Next.js] ${data.toString().trim()}`);
    });

    nextServerProcess.stderr?.on('data', (data) => {
      console.error(`[Next.js] ${data.toString().trim()}`);
    });

    nextServerProcess.on('close', (code) => {
      console.log(`[Next.js] Server process exited with code ${code}`);
      nextServerProcess = null;
    });

    process.on('exit', () => {
      if (nextServerProcess) {
        nextServerProcess.kill();
      }
    });
  } catch (error) {
    console.error('[Next.js] Failed to start server:', error);
  }
}

// Poll http://127.0.0.1:{port} until it responds (server ready) or timeout is hit.
function waitForServer(port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        res.destroy();
        resolve();
      });
      req.setTimeout(1000, () => req.destroy());
      req.on('error', () => {
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`Server on port ${port} did not respond within ${timeoutMs}ms`));
        } else {
          setTimeout(check, 500);
        }
      });
    };
    check();
  });
}

function registerRecentFoldersHandlers(): void {
  ipcMain.handle('recent-folders:get', () => {
    return (store.get('recentFolders') as string[]) || [];
  });

  ipcMain.handle('recent-folders:add', (_event, folderPath: string) => {
    const current = (store.get('recentFolders') as string[]) || [];
    const filtered = current.filter((p: string) => p !== folderPath);
    const updated = [folderPath, ...filtered].slice(0, 20);
    store.set('recentFolders', updated);
    store.set('lastOpenedFolder', folderPath);
    return updated;
  });
}

function registerIpcHandlers(browserWindow: BrowserWindow): void {
  registerToolHandlers(ipcMain, browserWindow);
  registerTerminalHandlers(ipcMain, browserWindow);
  registerFilesystemHandlers(ipcMain, browserWindow);
  registerGitHandlers(ipcMain);
  registerLinterHandlers(ipcMain, browserWindow);
  registerSearchHandlers(ipcMain);
  registerWebHandlers(ipcMain);
  registerAuthHandlers(ipcMain, browserWindow);
  registerRecentFoldersHandlers();
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

const LOADING_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0a0a0a;display:flex;flex-direction:column;align-items:center;
       justify-content:center;height:100vh;
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#fff;
       -webkit-app-region:drag}
  .logo{font-size:2.8rem;font-weight:800;letter-spacing:4px;margin-bottom:.5rem;
        background:linear-gradient(135deg,#7c3aed,#a78bfa);-webkit-background-clip:text;
        -webkit-text-fill-color:transparent}
  .sub{font-size:.85rem;color:#555;margin-bottom:2.5rem;letter-spacing:1px}
  .spinner{width:32px;height:32px;border:3px solid #1e1e1e;border-top-color:#7c3aed;
           border-radius:50%;animation:spin .75s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
</style></head>
<body>
  <div class="logo">TITAN</div>
  <div class="sub">Starting up...</div>
  <div class="spinner"></div>
</body>
</html>`)}`;

async function extractWebServerIfNeeded(): Promise<void> {
  if (!app.isPackaged) return;

  const tarFile = path.join(process.resourcesPath, 'web-server-standalone.tar');
  const webServerDir = path.join(process.resourcesPath, 'web-server');
  const serverJs = path.join(webServerDir, 'apps', 'web', 'server.js');

  if (!fs.existsSync(tarFile)) {
    if (!fs.existsSync(serverJs)) {
      dialog.showErrorBox(
        'Titan — Missing Files',
        'The web server files are missing and no archive was found.\n\nPlease reinstall Titan Desktop from titan.kryonextech.com.',
      );
    }
    return;
  }

  console.log('[Main] Found web-server-standalone.tar — extracting web server...');
  console.log(`[Main] Archive: ${tarFile}`);
  console.log(`[Main] Target:  ${webServerDir}`);

  fs.mkdirSync(webServerDir, { recursive: true });

  try {
    const result = spawnSync('tar', ['-xf', tarFile, '-C', webServerDir], {
      timeout: 300000,
      windowsHide: true,
      stdio: 'ignore',
    });
    if (result.status !== 0) {
      throw new Error(`tar exited with code ${result.status}`);
    }

    if (!fs.existsSync(serverJs)) {
      throw new Error(`Extraction finished but server.js not found at: ${serverJs}`);
    }

    console.log('[Main] Web server extracted successfully.');

    try { fs.unlinkSync(tarFile); } catch {}
    console.log('[Main] Cleaned up tar archive.');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Main] Extraction failed:', msg);
    dialog.showErrorBox(
      'Titan — Extraction Failed',
      `Could not extract the web server archive.\n\n${msg}\n\nPlease try reinstalling Titan Desktop.`,
    );
  }
}

app.whenReady().then(async () => {
  await extractWebServerIfNeeded();

  const portInUse = await isPortInUse(DESKTOP_PORT);
  if (portInUse) {
    // Kill orphaned servers from a previous crashed instance so we always boot a fresh one
    console.log(`[Main] Port ${DESKTOP_PORT} in use — killing stale process...`);
    try {
      if (process.platform === 'win32') {
        const out = execSync(`netstat -ano | findstr :${DESKTOP_PORT}`, { encoding: 'utf8', timeout: 5000 });
        const pids = [...new Set(out.split('\n').map(l => l.trim().split(/\s+/).pop()).filter(Boolean))];
        for (const pid of pids) {
          try { execSync(`taskkill /F /PID ${pid}`, { timeout: 3000 }); } catch { /* already gone */ }
        }
      } else {
        execSync(`lsof -ti :${DESKTOP_PORT} | xargs kill -9`, { timeout: 5000 });
      }
      await new Promise(r => setTimeout(r, 500));
    } catch {
      console.log('[Main] Could not kill stale process — proceeding anyway.');
    }
  }
  await startNextJsServer(DESKTOP_PORT);

  const windowState = restoreWindowState(store);
  mainWindow = createMainWindow(windowState);

  // Show branded loading screen immediately — window is never black while server boots
  mainWindow.loadURL(LOADING_HTML).catch(() => {});

  // Debounce window state saves — writing to disk on every pixel of resize is wasteful
  let windowStateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSaveWindowState = () => {
    if (windowStateDebounceTimer) clearTimeout(windowStateDebounceTimer);
    windowStateDebounceTimer = setTimeout(() => {
      if (mainWindow) saveWindowState(mainWindow, store);
    }, 500);
  };
  mainWindow.on('resize', debouncedSaveWindowState);
  mainWindow.on('move', debouncedSaveWindowState);
  mainWindow.on('close', () => { if (mainWindow) saveWindowState(mainWindow, store); });

  // Intercept new window requests (e.g., from external links) and open them in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // DevTools shortcut — F12 or Ctrl+Shift+I even in production
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  // Forward only warnings and errors from the renderer — forwarding every LOG
  // causes heavy IPC overhead that freezes the UI during rapid React re-renders.
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level < 1) return;
    const tag = level === 1 ? 'WARN' : 'ERR';
    console.log(`[Renderer:${tag}] ${message}  (${sourceId}:${line})`);
  });

  // Catch navigation failures so the user never stares at a blank screen
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Main] did-fail-load: ${errorCode} ${errorDescription} at ${validatedURL}`);
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

  createAppMenu(mainWindow);

  // Wait for the Next.js server to be ready before navigating to it
  const appUrl = `http://127.0.0.1:${DESKTOP_PORT}/editor`;
  try {
    console.log('[Main] Waiting for Next.js server to be ready...');
    await waitForServer(DESKTOP_PORT, 60000);
    console.log('[Main] Server ready.');
  } catch (err) {
    console.error('[Main] Server did not start in time:', err);
    // Proceed anyway — maybe it's slow but alive
  }

  // Load the app URL with retries so a slow boot doesn't leave a dead window
  const loadWithRetry = async (retries = 5, delayMs = 1500): Promise<void> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (!mainWindow) return;
        await mainWindow.loadURL(appUrl);
        console.log('[Main] App loaded successfully.');
        // Delay auto-updater so the popup never appears over a loading/blank screen
        setTimeout(() => setupAutoUpdater(), 5000);
        return;
      } catch (err) {
        console.error(`[Main] loadURL attempt ${attempt}/${retries} failed:`, err);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }
    console.error('[Main] All loadURL attempts failed — showing diagnostic page.');
    if (mainWindow) {
      const errPage = `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;display:flex;flex-direction:column;align-items:center;justify-content:center;
     height:100vh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#e0e0e0;padding:2rem}
h1{color:#ef4444;margin-bottom:1rem;font-size:1.5rem}
p{max-width:480px;text-align:center;line-height:1.6;margin-bottom:.5rem;font-size:.9rem;color:#999}
code{background:#1e1e1e;padding:2px 6px;border-radius:4px;font-size:.85rem}
.btn{margin-top:1.5rem;padding:.6rem 1.4rem;border:1px solid #333;border-radius:6px;background:#111;color:#fff;
     cursor:pointer;font-size:.85rem;-webkit-app-region:no-drag}
.btn:hover{background:#222}
</style></head><body>
<h1>Titan could not start</h1>
<p>The built-in web server did not respond on <code>127.0.0.1:${DESKTOP_PORT}</code>.</p>
<p>Try closing any other Titan instances and restarting. Press <code>F12</code> to open DevTools for more detail.</p>
<button class="btn" onclick="location.reload()">Retry</button>
</body></html>`)}`;
      mainWindow.loadURL(errPage).catch(() => {});
    }
  };

  await loadWithRetry();

  const workspacePath = store.get('lastOpenedFolder') as string;
  if (workspacePath) {
    const watcher = chokidar.watch(workspacePath, {
      ignored: [
        /(^|[/\\])\../,
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        '**/dist/**',
        '**/out/**',
        '**/build/**',
        '**/.turbo/**',
        '**/*.tsbuildinfo',
        '**/*.lock',
        '**/coverage/**',
        '**/__pycache__/**',
      ],
      persistent: true,
      ignoreInitial: true,
      depth: 4,
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    });

    // Batch file-change events to avoid flooding the renderer with IPC messages.
    let pendingEvents: Array<{ type: string; filePath: string }> = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const queueFsEvent = (type: string, filePath: string) => {
      pendingEvents.push({ type, filePath });
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          flushTimer = null;
          if (!mainWindow) { pendingEvents = []; return; }
          for (const ev of pendingEvents) {
            mainWindow.webContents.send(`indexer:file-${ev.type}`, { filePath: ev.filePath });
          }
          pendingEvents = [];
        }, 200);
      }
    };

    watcher
      .on('add', p => queueFsEvent('added', p))
      .on('change', p => queueFsEvent('changed', p))
      .on('unlink', p => queueFsEvent('deleted', p));
  }
});
