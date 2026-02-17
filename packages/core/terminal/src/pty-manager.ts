/**
 * PTY manager using node-pty
 */

import * as pty from 'node-pty';
import * as os from 'os';
import { EventEmitter } from 'events';
import type { TerminalOptions, TerminalInstance, TerminalOutput } from './types';

export class PTYManager extends EventEmitter {
  private terminals: Map<string, { instance: TerminalInstance; pty: pty.IPty }> = new Map();
  private idCounter: number = 0;

  getDefaultShell(): string {
    if (os.platform() === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }

  async create(options: TerminalOptions = {}): Promise<TerminalInstance> {
    const id = `terminal-${++this.idCounter}`;
    const shell = options.shell || this.getDefaultShell();
    const args = options.args || [];
    const cwd = options.cwd || process.cwd();
    const env = { ...process.env, ...options.env };

    const cols = options.cols || 80;
    const rows = options.rows || 24;

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: env as Record<string, string>,
    });

    const instance: TerminalInstance = {
      id,
      name: options.name || `Terminal ${this.idCounter}`,
      pid: ptyProcess.pid,
      shell,
      cwd,
      isRunning: true,
      createdAt: new Date(),
    };

    this.terminals.set(id, { instance, pty: ptyProcess });

    // Set up event handlers
    ptyProcess.onData((data) => {
      const output: TerminalOutput = {
        terminalId: id,
        data,
        timestamp: new Date(),
        isError: false,
      };
      this.emit('data', output);
      this.emit(`data:${id}`, output);
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      const terminal = this.terminals.get(id);
      if (terminal) {
        terminal.instance.isRunning = false;
      }
      this.emit('exit', { terminalId: id, exitCode, signal });
      this.emit(`exit:${id}`, { exitCode, signal });
    });

    this.emit('created', instance);
    return instance;
  }

  write(terminalId: string, data: string): void {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${terminalId}`);
    }
    terminal.pty.write(data);
  }

  resize(terminalId: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${terminalId}`);
    }
    terminal.pty.resize(cols, rows);
    this.emit('resized', { terminalId, cols, rows });
  }

  async kill(terminalId: string, signal?: string): Promise<void> {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${terminalId}`);
    }

    terminal.pty.kill(signal);
    terminal.instance.isRunning = false;
    this.emit('killed', { terminalId });
  }

  async destroy(terminalId: string): Promise<void> {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) return;

    if (terminal.instance.isRunning) {
      terminal.pty.kill();
    }
    
    this.terminals.delete(terminalId);
    this.emit('destroyed', { terminalId });
  }

  get(terminalId: string): TerminalInstance | undefined {
    return this.terminals.get(terminalId)?.instance;
  }

  getAll(): TerminalInstance[] {
    return Array.from(this.terminals.values()).map(t => t.instance);
  }

  getRunning(): TerminalInstance[] {
    return this.getAll().filter(t => t.isRunning);
  }

  async clear(terminalId: string): Promise<void> {
    // Send clear command based on OS
    if (os.platform() === 'win32') {
      this.write(terminalId, 'cls\r');
    } else {
      this.write(terminalId, 'clear\r');
    }
  }

  sendInterrupt(terminalId: string): void {
    this.write(terminalId, '\x03'); // Ctrl+C
  }

  sendEOF(terminalId: string): void {
    this.write(terminalId, '\x04'); // Ctrl+D
  }

  async executeCommand(terminalId: string, command: string): Promise<void> {
    this.write(terminalId, `${command}\r`);
  }

  async destroyAll(): Promise<void> {
    const ids = Array.from(this.terminals.keys());
    await Promise.all(ids.map(id => this.destroy(id)));
  }
}

/**
 * Creates a PTY manager instance
 */
export function createPTYManager(): PTYManager {
  return new PTYManager();
}
