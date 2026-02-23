import { ipcMain } from 'electron';

export function setupIndexerIPC() {
  ipcMain.handle('indexer:start', async () => {
    console.log('[Indexer IPC] Indexer start requested (stub)');
    return { status: 'indexing_started' };
  });

  ipcMain.handle('indexer:query', (_, { entityId }) => {
    console.log('[Indexer IPC] Query entity:', entityId);
    return null;
  });

  ipcMain.handle('indexer:get-relationships', (_, { filePath }) => {
    console.log('[Indexer IPC] Get relationships:', filePath);
    return [];
  });

  ipcMain.on('indexer:file-added', (_, { filePath }) => {
    console.log('[Indexer IPC] File added:', filePath);
  });

  ipcMain.on('indexer:file-changed', (_, { filePath }) => {
    console.log('[Indexer IPC] File changed:', filePath);
  });

  ipcMain.on('indexer:file-deleted', (_, { filePath }) => {
    console.log('[Indexer IPC] File deleted:', filePath);
  });
}