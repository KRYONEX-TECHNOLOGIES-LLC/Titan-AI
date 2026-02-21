import { IpcMain, BrowserWindow } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as os from 'os';
import * as fs from 'fs';

interface TerminalSession {
  id: string;
  mode: 'pty' | 'spawn';
  pty?: import('node-pty').IPty;
  proc?: ChildProcess;
}

const terminals = new Map<string, TerminalSession>();
let nodePtyAvailable: boolean | null = null;

async function tryLoadNodePty(): Promise<typeof import('node-pty') | null> {
  if (nodePtyAvailable === false) return null;
  try {
    const pty = await import('node-pty');
    nodePtyAvailable = true;
    return pty;
  } catch (err) {
    console.warn('[Terminal] node-pty not available, using spawn fallback:', (err as Error).message);
    nodePtyAvailable = false;
    return null;
  }
}

function getDefaultShell(): string {
  if (process.platform === 'win32') return 'powershell.exe';
  return process.env.SHELL || '/bin/bash';
}

function getShellArgs(shell: string): string[] {
  if (process.platform === 'win32' && shell.toLowerCase().includes('powershell')) {
    return ['-NoLogo', '-NoExit'];
  }
  return [];
}

function safeCwd(cwd?: string): string {
  const target = cwd ?? os.homedir();
  try {
    if (fs.existsSync(target)) return target;
  } catch {}
  return os.homedir();
}

export function registerTerminalHandlers(ipcMain: IpcMain, win: BrowserWindow): void {

  ipcMain.handle('terminal:create', async (_e, id: string, _shell?: string, cwd?: string) => {
    if (terminals.has(id)) {
      killSession(terminals.get(id)!);
      terminals.delete(id);
    }

    const shell = getDefaultShell();
    const shellArgs = getShellArgs(shell);
    const resolvedCwd = safeCwd(cwd);

    const pty = await tryLoadNodePty();

    if (pty) {
      try {
        const ptyProcess = pty.spawn(shell, shellArgs, {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd: resolvedCwd,
          env: process.env as Record<string, string>,
        });

        const session: TerminalSession = { id, mode: 'pty', pty: ptyProcess };
        terminals.set(id, session);

        ptyProcess.onData((data) => {
          safeSend(win, `terminal:data:${id}`, data);
        });

        ptyProcess.onExit(({ exitCode }) => {
          terminals.delete(id);
          safeSend(win, `terminal:exit:${id}`, exitCode);
        });

        return { success: true, mode: 'pty' };
      } catch (err) {
        console.warn('[Terminal] node-pty spawn failed, falling back to spawn:', (err as Error).message);
        nodePtyAvailable = false;
      }
    }

    const proc = spawn(shell, shellArgs.filter(a => a !== '-NoExit'), {
      cwd: resolvedCwd,
      env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    const session: TerminalSession = { id, mode: 'spawn', proc };
    terminals.set(id, session);

    proc.stdout?.on('data', (data: Buffer) => {
      safeSend(win, `terminal:data:${id}`, data.toString());
    });

    proc.stderr?.on('data', (data: Buffer) => {
      safeSend(win, `terminal:data:${id}`, data.toString());
    });

    proc.on('exit', (code) => {
      terminals.delete(id);
      safeSend(win, `terminal:exit:${id}`, code ?? 0);
    });

    proc.on('error', (err) => {
      safeSend(win, `terminal:data:${id}`, `\r\n[Terminal error: ${err.message}]\r\n`);
      terminals.delete(id);
      safeSend(win, `terminal:exit:${id}`, 1);
    });

    return { success: true, mode: 'spawn' };
  });

  ipcMain.handle('terminal:write', async (_e, id: string, data: string) => {
    const session = terminals.get(id);
    if (!session) return;
    try {
      if (session.mode === 'pty' && session.pty) {
        session.pty.write(data);
      } else if (session.mode === 'spawn' && session.proc?.stdin) {
        session.proc.stdin.write(data);
      }
    } catch (err) {
      console.error(`[Terminal] Write failed for ${id}:`, err);
    }
  });

  ipcMain.handle('terminal:resize', async (_e, id: string, cols: number, rows: number) => {
    const session = terminals.get(id);
    if (!session) return;
    if (cols < 2 || rows < 2 || cols > 500 || rows > 200) return;
    try {
      if (session.mode === 'pty' && session.pty) {
        session.pty.resize(cols, rows);
      }
    } catch (err) {
      console.error(`[Terminal] Resize failed for ${id}:`, err);
    }
  });

  ipcMain.handle('terminal:kill', async (_e, id: string) => {
    const session = terminals.get(id);
    if (session) {
      killSession(session);
      terminals.delete(id);
    }
  });
}

function safeSend(win: BrowserWindow, channel: string, ...args: unknown[]) {
  if (!win.isDestroyed()) {
    try { win.webContents.send(channel, ...args); } catch {}
  }
}

function killSession(session: TerminalSession) {
  try {
    if (session.mode === 'pty' && session.pty) {
      session.pty.kill();
    } else if (session.mode === 'spawn' && session.proc) {
      session.proc.kill();
    }
  } catch {}
}

export function killAllTerminals(): void {
  for (const [id, session] of terminals) {
    killSession(session);
    terminals.delete(id);
  }
}
