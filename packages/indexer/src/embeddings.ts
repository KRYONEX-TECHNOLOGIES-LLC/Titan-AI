import { SpeculativeEmbedder } from '@titan/ai-speculative';
import type { RelationshipTracker } from './types';

export class CodeEmbedder {
  private readonly embedder = new SpeculativeEmbedder();
  private readonly tracker: RelationshipTracker;

  constructor(tracker: RelationshipTracker) {
    this.tracker = tracker;
  }

  async generateEmbeddings() {
    const entities = this.tracker.getAllEntities();
    
    for (const entity of entities) {
      const embedding = await this.embedder.generate(
        `CODE_ENTITY:${entity.type}:${entity.name}`,
        {
          dimensions: 1536,
          model: 'text-embedding-3-large'
        }
      );
      
      this.tracker.storeEmbedding(entity.id, embedding);
    }
  }
}
