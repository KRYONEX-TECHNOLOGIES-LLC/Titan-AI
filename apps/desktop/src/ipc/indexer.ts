import { ipcMain } from 'electron';
import { CodeIndexer } from '@titan/indexer';

export function setupIndexerIPC() {
  const indexer = new CodeIndexer();
  
  ipcMain.handle('indexer:start', async () => {
    await indexer.initialize();
    return { status: 'indexing_started' };
  });
  
  ipcMain.handle('indexer:query', (_, { entityId }) => {
    return indexer.queryEntity(entityId);
  });
  
  ipcMain.handle('indexer:get-relationships', (_, { filePath }) => {
    return indexer.getFileRelationships(filePath);
  });

  ipcMain.on('indexer:file-added', (_, { filePath }) => {
    console.log('[Indexer IPC] File added:', filePath);
    // In a real implementation, you would call a method on the indexer like:
    // indexer.processFile(filePath);
  });

  ipcMain.on('indexer:file-changed', (_, { filePath }) => {
    console.log('[Indexer IPC] File changed:', filePath);
    // indexer.processFile(filePath);
  });

  ipcMain.on('indexer:file-deleted', (_, { filePath }) => {
    console.log('[Indexer IPC] File deleted:', filePath);
    // indexer.removeFile(filePath);
  });
}