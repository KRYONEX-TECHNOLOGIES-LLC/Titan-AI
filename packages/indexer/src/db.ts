import { ChromaClient } from 'chromadb';
import sqlite3 from 'sqlite3';
import { RelationshipTracker } from './types';

export class VectorDB {
  private chroma = new ChromaClient();
  private sql = new sqlite3.Database('.titan/index.db');

  async initialize() {
    await this.chroma.reset();
    
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS code_relationships (
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        type TEXT NOT NULL,
        strength REAL DEFAULT 1.0,
        PRIMARY KEY (source, target)
      );

      CREATE TABLE IF NOT EXISTS embeddings (
        entity_id TEXT PRIMARY KEY,
        vector BLOB NOT NULL
      );
    `);
  }

  async storeRelationships(tracker: RelationshipTracker) {
    const relationships = tracker.getRelationships();
    
    this.sql.serialize(() => {
      const stmt = this.sql.prepare(
        'INSERT OR REPLACE INTO code_relationships VALUES (?, ?, ?, ?)'
      );

      relationships.forEach((rel) => {
        stmt.run(rel.source, rel.target, rel.type, rel.strength);
      });

      stmt.finalize();
    });
  }
}
