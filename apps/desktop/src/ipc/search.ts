import { IpcMain } from 'electron';
import * as path from 'path';

export function registerSearchHandlers(ipcMain: IpcMain): void {

  ipcMain.handle('search:glob', async (_e, pattern: string, cwd: string, opts?: { ignore?: string[] }) => {
    const fg = await import('fast-glob');
    const resolved = path.resolve(cwd);
    const files = await fg.default(pattern, {
      cwd: resolved,
      ignore: opts?.ignore ?? ['**/node_modules/**', '**/.git/**', '**/.next/**', '**/dist/**'],
      dot: false,
      onlyFiles: true,
    });
    return files;
  });

  ipcMain.handle('search:semantic', async (_e, _query: string, _cwd: string) => {
    return [];
  });
}
