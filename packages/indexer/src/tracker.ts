import { CodeEntity, CodeRelationship, EntityType, RelationshipTracker } from './types';

export class UnifiedTracker implements RelationshipTracker {
  private currentFile: string | null = null;
  private readonly entities: Map<string, CodeEntity> = new Map();
  private readonly relationships: CodeRelationship[] = [];
  private readonly embeddings: Map<string, number[]> = new Map();

  startFile(filePath: string): void {
    this.currentFile = filePath;
  }

  addDefinition(filePath: string, name: string, type: EntityType, position: number): void {
    const id = `${filePath}:${name}:${type}`;
    this.entities.set(id, { id, name, type, filePath, position });
  }

  addDependency(sourcePath: string, targetPath: string): void {
    const sourceId = `${sourcePath}:file`;
    const targetId = `${targetPath}:file`;
    
    if (!this.entities.has(sourceId)) {
      this.entities.set(sourceId, {
        id: sourceId,
        name: sourcePath,
        type: 'import',
        filePath: sourcePath,
        position: -1
      });
    }
    
    this.relationships.push({
      source: sourceId,
      target: targetId,
      type: 'imports',
      strength: 1.0
    });
  }

  addRelationship(source: CodeEntity, target: CodeEntity, type: CodeRelationship['type'], strength = 1.0): void {
    this.relationships.push({
      source: source.id,
      target: target.id,
      type,
      strength
    });
  }

  storeEmbedding(entityId: string, embedding: number[]): void {
    this.embeddings.set(entityId, embedding);
  }

  getAllEntities(): CodeEntity[] {
    return Array.from(this.entities.values());
  }

  getRelationships(): CodeRelationship[] {
    return this.relationships;
  }
}