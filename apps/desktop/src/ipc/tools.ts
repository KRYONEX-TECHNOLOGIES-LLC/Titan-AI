import { IpcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export function registerToolHandlers(ipcMain: IpcMain): void {

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
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${resolved}`);
    }
    let content = fs.readFileSync(resolved, 'utf-8');
    if (!content.includes(oldStr)) {
      throw new Error(`old_string not found in file. Make sure it matches exactly, including whitespace.`);
    }
    content = content.replace(oldStr, newStr);
    fs.writeFileSync(resolved, content, 'utf-8');
    return { success: true, newContent: content };
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
      const stat = fs.statSync(fullPath);
      return {
        name: item.name,
        type: item.isDirectory() ? 'directory' : 'file',
        size: stat.size,
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
          } catch {
            // ripgrep JSON parse failure -- fall back to regex
          }
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

    return new Promise((resolve) => {
      const proc = spawn(command, {
        cwd: resolved,
        shell: true,
        timeout: 120000,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      let stdout = '';
      let stderr = '';
      let finished = false;

      proc.stdout.on('data', (d: Buffer) => {
        stdout += d.toString();
        if (stdout.length > 50000) {
          stdout = stdout.slice(-40000);
        }
      });
      proc.stderr.on('data', (d: Buffer) => {
        stderr += d.toString();
        if (stderr.length > 20000) {
          stderr = stderr.slice(-15000);
        }
      });

      proc.on('close', (code) => {
        if (finished) return;
        finished = true;
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      });
      proc.on('error', (err) => {
        if (finished) return;
        finished = true;
        resolve({ stdout, stderr: stderr + '\n' + err.message, exitCode: 1 });
      });
    });
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
          } catch { /* binary file or permission error */ }
        }
      }
    } catch { /* permission error */ }
  }

  walk(dirPath);
  return { matches };
}
