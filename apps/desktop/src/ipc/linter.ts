import { IpcMain, BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface Diagnostic {
  file: string;
  line: number;
  column: number;
  severity: string;
  message: string;
  source: string;
}

export function registerLinterHandlers(ipcMain: IpcMain, _win: BrowserWindow): void {

  ipcMain.handle('linter:getDiagnostics', async (_e, filePath: string) => {
    const resolved = path.resolve(filePath);
    const ext = path.extname(resolved);
    const dir = findProjectRoot(path.dirname(resolved));

    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      const eslintDiag = await runEslintDiag(resolved, dir);
      if (eslintDiag.length > 0) return eslintDiag;
      return await runTscDiag(resolved, dir);
    }

    if (['.py'].includes(ext)) {
      return await runPythonLint(resolved, dir);
    }

    return [];
  });
}

function findProjectRoot(startDir: string): string {
  let current = startDir;
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'package.json')) ||
        fs.existsSync(path.join(current, 'pyproject.toml')) ||
        fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return startDir;
}

function runEslintDiag(filePath: string, cwd: string): Promise<Diagnostic[]> {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['eslint', '--format', 'json', '--no-error-on-unmatched-pattern', filePath], {
      cwd,
      shell: true,
      timeout: 15000,
    });

    let output = '';
    proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    proc.on('close', () => {
      try {
        const results = JSON.parse(output);
        const diagnostics: Diagnostic[] = [];
        for (const r of results) {
          for (const m of r.messages) {
            diagnostics.push({
              file: path.relative(cwd, r.filePath),
              line: m.line ?? 1,
              column: m.column ?? 1,
              severity: m.severity === 2 ? 'error' : 'warning',
              message: m.message,
              source: m.ruleId || 'eslint',
            });
          }
        }
        resolve(diagnostics);
      } catch {
        resolve([]);
      }
    });
    proc.on('error', () => resolve([]));
  });
}

function runTscDiag(filePath: string, cwd: string): Promise<Diagnostic[]> {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
      cwd,
      shell: true,
      timeout: 30000,
    });

    let output = '';
    proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { output += d.toString(); });

    proc.on('close', () => {
      const diagnostics: Diagnostic[] = [];
      const regex = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)$/gm;
      let match;
      while ((match = regex.exec(output)) !== null) {
        const diagFile = match[1]!;
        const relTarget = path.relative(cwd, filePath);
        if (diagFile === relTarget || diagFile === filePath) {
          diagnostics.push({
            file: diagFile,
            line: parseInt(match[2]!, 10),
            column: parseInt(match[3]!, 10),
            severity: match[4]!,
            message: match[5]!,
            source: 'typescript',
          });
        }
      }
      resolve(diagnostics);
    });
    proc.on('error', () => resolve([]));
  });
}

function runPythonLint(filePath: string, cwd: string): Promise<Diagnostic[]> {
  return new Promise((resolve) => {
    const proc = spawn('ruff', ['check', '--output-format', 'json', filePath], {
      cwd,
      shell: true,
      timeout: 10000,
    });

    let output = '';
    proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });

    proc.on('close', () => {
      try {
        const results = JSON.parse(output);
        const diagnostics: Diagnostic[] = results.map((r: { filename: string; location: { row: number; column: number }; code: string; message: string }) => ({
          file: path.relative(cwd, r.filename),
          line: r.location.row,
          column: r.location.column,
          severity: 'warning',
          message: r.message,
          source: r.code,
        }));
        resolve(diagnostics);
      } catch {
        resolve([]);
      }
    });
    proc.on('error', () => resolve([]));
  });
}
