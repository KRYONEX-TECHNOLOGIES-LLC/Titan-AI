import { app, BrowserWindow, session } from 'electron';
import * as path from 'path';

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = { get: (key: string, fallback?: any) => any; set: (key: string, value: any) => void };

export function createMainWindow(state: WindowState): BrowserWindow {
  // Grant microphone/media permissions for speech recognition and audio input
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'microphone', 'audio-capture', 'clipboard-read', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'microphone', 'audio-capture', 'clipboard-read', 'clipboard-sanitized-write'];
    return allowed.includes(permission);
  });

  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 800,
    minHeight: 600,
    title: 'Titan AI',
    // In packaged mode __dirname is inside the asar archive; resources live at process.resourcesPath.
    // Windows also requires .ico (not .png) for proper taskbar and Start menu icon display.
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.ico')
      : path.join(__dirname, '..', '..', 'resources', 'icon.ico'),
    show: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      backgroundThrottling: false,
      v8CacheOptions: 'bypassHeatCheckAndEagerCompile',
    },
  });

  if (state.isMaximized) {
    win.maximize();
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}

export function restoreWindowState(store: AnyStore): WindowState {
  const defaults: WindowState = { width: 1400, height: 900, isMaximized: false };
  const saved = store.get('windowState', defaults) as WindowState;

  return {
    width: saved.width || defaults.width,
    height: saved.height || defaults.height,
    x: saved.x,
    y: saved.y,
    isMaximized: saved.isMaximized ?? false,
  };
}

export function saveWindowState(win: BrowserWindow, store: AnyStore): void {
  const isMaximized = win.isMaximized();
  const bounds = win.getBounds();

  store.set('windowState', {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized,
  });
}
