import { IpcMain, BrowserWindow } from 'electron';
import * as os from 'os';

interface TerminalSession {
  pty: import('node-pty').IPty;
  id: string;
}

const terminals = new Map<string, TerminalSession>();

export function registerTerminalHandlers(ipcMain: IpcMain, win: BrowserWindow): void {

  ipcMain.handle('terminal:create', async (_e, id: string, shell?: string, cwd?: string) => {
    if (terminals.has(id)) {
      terminals.get(id)!.pty.kill();
      terminals.delete(id);
    }

    const pty = await import('node-pty');
    const defaultShell = shell ?? getDefaultShell();
    const defaultCwd = cwd ?? os.homedir();

    const ptyProcess = pty.spawn(defaultShell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: defaultCwd,
      env: process.env as Record<string, string>,
    });

    terminals.set(id, { pty: ptyProcess, id });

    ptyProcess.onData((data) => {
      if (!win.isDestroyed()) {
        win.webContents.send(`terminal:data:${id}`, data);
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      terminals.delete(id);
      if (!win.isDestroyed()) {
        win.webContents.send(`terminal:exit:${id}`, exitCode);
      }
    });

    return { success: true };
  });

  ipcMain.handle('terminal:write', async (_e, id: string, data: string) => {
    const session = terminals.get(id);
    if (!session) throw new Error(`Terminal ${id} not found`);
    try {
      session.pty.write(data);
    } catch (err) {
      console.error(`[Terminal] Write failed for ${id}:`, err);
    }
  });

  ipcMain.handle('terminal:resize', async (_e, id: string, cols: number, rows: number) => {
    const session = terminals.get(id);
    if (!session) throw new Error(`Terminal ${id} not found`);
    try {
      session.pty.resize(cols, rows);
    } catch (err) {
      console.error(`[Terminal] Resize failed for ${id}:`, err);
    }
  });

  ipcMain.handle('terminal:kill', async (_e, id: string) => {
    const session = terminals.get(id);
    if (session) {
      session.pty.kill();
      terminals.delete(id);
    }
  });
}

function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

export function killAllTerminals(): void {
  for (const [id, session] of terminals) {
    session.pty.kill();
    terminals.delete(id);
  }
}
