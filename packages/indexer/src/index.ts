import { UnifiedTracker } from './tracker';
import { ASTParser } from './ast-parser';
import { CodeEmbedder } from './embeddings';
import { VectorDB } from './db';
import { watch } from 'chokidar';
import path from 'path';
import fs from 'fs';

export class CodeIndexer {
  private readonly tracker = new UnifiedTracker();
  private readonly parser = new ASTParser(this.tracker);
  private readonly embedder = new CodeEmbedder(this.tracker);
  private readonly db = new VectorDB();
  
  private indexedEntities: Map<string, any> = new Map();
  
  async queryEntity(entityId: string) {
    return this.indexedEntities.get(entityId) || null;
  }
  
  getFileRelationships(filePath: string) {
    return this.tracker.getRelationships().filter(
      rel => rel.source.includes(filePath) || rel.target.includes(filePath)
    );
  }
  
  async initialize() {
    await this.db.initialize();
    
    // Set up file system watcher
    watch(['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'], {
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      persistent: true,
      ignoreInitial: false
    })
    .on('add', (filePath) => this.indexFile(filePath))
    .on('change', (filePath) => this.indexFile(filePath))
    .on('unlink', (filePath) => this.removeFile(filePath));
  }

  private async indexFile(filePath: string) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      this.parser.parseFile(filePath, content);
      await this.embedder.generateEmbeddings();
      await this.db.storeRelationships(this.tracker);
      console.log(`Indexed ${filePath}`);
    } catch (error) {
      console.error(`Failed to index ${filePath}:`, error);
    }
  }

  private removeFile(filePath: string) {
    // TODO: Implement removal logic
    console.log(`File removed: ${filePath}`);
  }
}