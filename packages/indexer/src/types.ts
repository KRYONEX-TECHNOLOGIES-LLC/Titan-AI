export type EntityType = 'class' | 'function' | 'variable' | 'interface' | 'type' | 'import' | 'export';

export interface CodeEntity {
  id: string;
  name: string;
  type: EntityType;
  filePath: string;
  position: number;
}

export interface CodeRelationship {
  source: string; // Entity ID
  target: string; // Entity ID or file path
  type: 'inherits' | 'calls' | 'imports' | 'exports' | 'references';
  strength: number;
}

export interface RelationshipTracker {
  startFile(filePath: string): void;
  addDefinition(filePath: string, name: string, type: EntityType, position: number): void;
  addDependency(sourcePath: string, targetPath: string): void;
  addRelationship(source: CodeEntity, target: CodeEntity, type: CodeRelationship['type'], strength?: number): void;
  storeEmbedding(entityId: string, embedding: number[]): void;
  getAllEntities(): CodeEntity[];
  getRelationships(): CodeRelationship[];
}