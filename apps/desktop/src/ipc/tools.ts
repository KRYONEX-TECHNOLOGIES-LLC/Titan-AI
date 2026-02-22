import { IpcMain, BrowserWindow } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

function contentHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

const backgroundProcs = new Map<string, ChildProcess>();

const SERVER_PATTERNS = [
  /\bpython\b.*\.py\b/i,
  /\buvicorn\b/i,
  /\bgunicorn\b/i,
  /\bflask\s+run\b/i,
  /\bnpm\s+(start|run\s+(dev|start|serve))\b/i,
  /\bnpx\s+(vite|next\s+dev|serve|react-scripts\s+start|webpack\s+serve)\b/i,
  /\bnode\b.*\.(js|mjs|ts)\b/i,
  /\byarn\s+(start|dev)\b/i,
  /\bpnpm\s+(start|dev|run\s+(dev|start))\b/i,
  /\brails\s+server\b/i,
  /\bcargo\s+run\b/i,
  /\bgo\s+run\b/i,
  /\bjava\s+-jar\b/i,
  /\bdocker\s+compose\s+up\b/i,
];

function looksLikeServer(command: string): boolean {
  return SERVER_PATTERNS.some(p => p.test(command));
}

function resolveWindowsShell(): { shellPath: string; isPowerShell: boolean } {
  const systemRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';

  const candidates = [
    path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
  ];

  for (const candidate of candidates) {
    try { if (fs.existsSync(candidate)) return { shellPath: candidate, isPowerShell: true }; } catch {}
  }

  const cmd = path.join(systemRoot, 'System32', 'cmd.exe');
  return { shellPath: cmd, isPowerShell: false };
}

export function registerToolHandlers(ipcMain: IpcMain, win?: BrowserWindow): void {

  ipcMain.handle('tools:readFile', async (_e, filePath: string, opts?: { lineOffset?: number; lineLimit?: number }) => {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${resolved}`);
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    const lines = content.split('\n');

    if (opts?.lineOffset !== undefined || opts?.lineLimit !== undefined) {
      const offset = opts.lineOffset ?? 0;
      const limit = opts.lineLimit ?? lines.length;
      const sliced = lines.slice(offset, offset + limit);
      return { content: sliced.join('\n'), lineCount: lines.length };
    }
    return { content, lineCount: lines.length };
  });

  ipcMain.handle('tools:editFile', async (_e, filePath: string, oldStr: string, newStr: string) => {
    const pathResolved = path.resolve(filePath);
    if (!fs.existsSync(pathResolved)) {
      throw new Error(`File not found: ${pathResolved}`);
    }
    const beforeContent = fs.readFileSync(pathResolved, 'utf-8');
    const beforeHash = contentHash(beforeContent);
    if (!beforeContent.includes(oldStr)) {
      throw new Error(`old_string not found in file. Make sure it matches exactly, including whitespace.`);
    }
    const newContent = beforeContent.replace(oldStr, newStr);
    fs.writeFileSync(pathResolved, newContent, 'utf-8');
    const afterReadback = fs.readFileSync(pathResolved, 'utf-8');
    const afterHash = contentHash(afterReadback);
    const bytesWritten = Buffer.byteLength(newContent, 'utf-8');
    return {
      success: true,
      newContent: afterReadback,
      pathResolved,
      beforeHash,
      afterHash,
      changed: true,
      bytesWritten,
    };
  });

  ipcMain.handle('tools:createFile', async (_e, filePath: string, content: string) => {
    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, content, 'utf-8');
    return { success: true };
  });

  ipcMain.handle('tools:deleteFile', async (_e, filePath: string) => {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${resolved}`);
    }
    fs.unlinkSync(resolved);
    return { success: true };
  });

  ipcMain.handle('tools:listDir', async (_e, dirPath: string) => {
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Directory not found: ${resolved}`);
    }
    const items = fs.readdirSync(resolved, { withFileTypes: true });
    const entries = items.map(item => {
      const fullPath = path.join(resolved, item.name);
      let size = 0;
      try { size = fs.statSync(fullPath).size; } catch {}
      return {
        name: item.name,
        type: item.isDirectory() ? 'directory' : 'file',
        size,
      };
    });
    return { entries };
  });

  ipcMain.handle('tools:grep', async (_e, pattern: string, dirPath: string, opts?: { include?: string; maxResults?: number }) => {
    const resolved = path.resolve(dirPath);
    const maxResults = opts?.maxResults ?? 200;

    return new Promise((resolve) => {
      const args = ['--json', '-n', '--max-count', String(maxResults)];
      if (opts?.include) {
        args.push('--glob', opts.include);
      }
      args.push(pattern, resolved);

      const rg = spawn('rg', args, { shell: true });
      let output = '';
      let stderr = '';

      rg.stdout.on('data', (data: Buffer) => { output += data.toString(); });
      rg.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

      rg.on('close', () => {
        const matches: Array<{ file: string; line: number; content: string }> = [];
        const lines = output.trim().split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'match') {
              matches.push({
                file: path.relative(resolved, parsed.data.path.text),
                line: parsed.data.line_number,
                content: parsed.data.lines.text.trimEnd(),
              });
            }
          } catch {}
        }

        if (matches.length === 0 && stderr) {
          resolve({ matches: [], error: stderr });
          return;
        }
        resolve({ matches });
      });

      rg.on('error', () => {
        resolve(grepFallback(pattern, resolved, maxResults));
      });
    });
  });

  ipcMain.handle('tools:glob', async (_e, pattern: string, dirPath: string, opts?: { ignore?: string[] }) => {
    const fg = await import('fast-glob');
    const resolved = path.resolve(dirPath);
    const files = await fg.default(pattern, {
      cwd: resolved,
      ignore: opts?.ignore ?? ['**/node_modules/**', '**/.git/**'],
      dot: false,
      onlyFiles: true,
    });
    return { files };
  });

  ipcMain.handle('tools:runCommand', async (_e, command: string, cwd?: string) => {
    const resolved = cwd ? path.resolve(cwd) : process.cwd();
    const isWindows = process.platform === 'win32';
    const { shellPath, isPowerShell } = isWindows
      ? resolveWindowsShell()
      : { shellPath: '/bin/bash', isPowerShell: false };
    const isServer = looksLikeServer(command);
    const timeout = isServer ? 15000 : 120000;

    if (win && !win.isDestroyed()) {
      try { win.webContents.send('tools:commandStarted', { command, cwd: resolved }); } catch {}
    }

    return new Promise((resolve) => {
      const args = isWindows
        ? isPowerShell
          ? ['-NoProfile', '-NonInteractive', '-Command', command]
          : ['/d', '/s', '/c', command]
        : ['-c', command];

      const proc = spawn(shellPath, args, {
        cwd: resolved,
        env: { ...process.env, FORCE_COLOR: '0' },
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let finished = false;

      const finish = (exitCode: number, extra?: string) => {
        if (finished) return;
        finished = true;

        if (stdout.length > 50000) stdout = stdout.slice(-40000);
        if (stderr.length > 20000) stderr = stderr.slice(-15000);

        const output = extra ? stdout + '\n' + extra : stdout;

        if (win && !win.isDestroyed()) {
          try {
            win.webContents.send('tools:commandOutput', {
              command,
              stdout: output.slice(0, 2000),
              stderr: stderr.slice(0, 500),
              exitCode,
            });
          } catch {}
        }

        resolve({ stdout: output, stderr, exitCode });
      };

      proc.stdout.on('data', (d: Buffer) => {
        stdout += d.toString();
      });
      proc.stderr.on('data', (d: Buffer) => {
        stderr += d.toString();
      });

      proc.on('close', (code) => {
        finish(code ?? 0);
      });
      proc.on('error', (err) => {
        stderr += '\n' + err.message;
        finish(1);
      });

      const timer = setTimeout(() => {
        if (finished) return;

        if (isServer && stdout.length > 0) {
          const procId = `bg-${Date.now()}`;
          backgroundProcs.set(procId, proc);
          finish(0, `[Server started and running in background (pid: ${proc.pid}). Output above shows startup logs.]`);
        } else {
          try { proc.kill(); } catch {}
          finish(124, isServer
            ? `[Command timed out after ${timeout / 1000}s. If this is a server, it may need manual startup from the terminal.]`
            : `[Command timed out after ${timeout / 1000}s]`);
        }
      }, timeout);

      proc.on('close', () => clearTimeout(timer));
    });
  });

  ipcMain.handle('tools:killBackground', async (_e, pid?: number) => {
    if (pid) {
      for (const [id, proc] of backgroundProcs) {
        if (proc.pid === pid) {
          try { proc.kill(); } catch {}
          backgroundProcs.delete(id);
          return { killed: true };
        }
      }
    }
    return { killed: false };
  });

  ipcMain.handle('tools:readLints', async (_e, filePath: string) => {
    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);
    const ext = path.extname(resolved);

    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      return runEslint(resolved, dir);
    }
    return { diagnostics: [] };
  });

  ipcMain.handle('tools:semanticSearch', async (_e, _query: string, _dirPath: string) => {
    return { results: [], message: 'Semantic search requires workspace indexing. Use grep for text-based search.' };
  });
}

async function runEslint(filePath: string, cwd: string): Promise<{ diagnostics: Array<{ file: string; line: number; column: number; severity: string; message: string; source: string }> }> {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['eslint', '--format', 'json', filePath], {
      cwd,
      shell: true,
      timeout: 15000,
    });

    let output = '';
    proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    proc.on('close', () => {
      try {
        const results = JSON.parse(output);
        const diagnostics = results.flatMap((r: { filePath: string; messages: Array<{ line: number; column: number; severity: number; message: string; ruleId: string }> }) =>
          r.messages.map((m) => ({
            file: path.relative(cwd, r.filePath),
            line: m.line,
            column: m.column,
            severity: m.severity === 2 ? 'error' : 'warning',
            message: m.message,
            source: m.ruleId || 'eslint',
          }))
        );
        resolve({ diagnostics });
      } catch {
        resolve({ diagnostics: [] });
      }
    });
    proc.on('error', () => resolve({ diagnostics: [] }));
  });
}

function grepFallback(pattern: string, dirPath: string, maxResults: number): { matches: Array<{ file: string; line: number; content: string }> } {
  const matches: Array<{ file: string; line: number; content: string }> = [];
  const regex = new RegExp(pattern, 'gi');

  function walk(dir: string) {
    if (matches.length >= maxResults) return;
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (matches.length >= maxResults) break;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
          if (['node_modules', '.git', 'dist', '.next', 'out'].includes(item.name)) continue;
          walk(full);
        } else if (item.isFile()) {
          try {
            const content = fs.readFileSync(full, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
              if (regex.test(lines[i]!)) {
                matches.push({
                  file: path.relative(dirPath, full),
                  line: i + 1,
                  content: lines[i]!.trim(),
                });
              }
              regex.lastIndex = 0;
            }
          } catch {}
        }
      }
    } catch {}
  }

  walk(dirPath);
  return { matches };
}

export function killAllBackground(): void {
  for (const [id, proc] of backgroundProcs) {
    try { proc.kill(); } catch {}
    backgroundProcs.delete(id);
  }
}
