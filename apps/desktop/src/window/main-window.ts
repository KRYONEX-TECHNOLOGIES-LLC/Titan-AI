import { BrowserWindow } from 'electron';
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
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 800,
    minHeight: 600,
    title: 'Titan AI',
    icon: path.join(__dirname, '..', 'resources', 'icon.png'),
    show: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
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
