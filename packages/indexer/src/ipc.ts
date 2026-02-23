import { ipcMain } from 'electron';
import { CodeIndexer } from './index';

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
}