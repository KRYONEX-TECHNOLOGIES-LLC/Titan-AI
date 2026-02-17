/**
 * Session memory management for persistent AI context
 */

import { EventEmitter } from 'events';
import type { SessionMemory, MemoryEntry, EpisodicMemory, SemanticMemory, ProceduralMemory } from './types';

export interface SessionMemoryConfig {
  maxShortTermEntries: number;
  maxWorkingMemoryEntries: number;
  maxEpisodicMemories: number;
  maxSemanticMemories: number;
  maxProceduralMemories: number;
  decayRate: number;
  consolidationThreshold: number;
}

export class SessionMemoryManager extends EventEmitter {
  private config: SessionMemoryConfig;
  private memory: SessionMemory;
  private idCounter: number = 0;

  constructor(sessionId: string, config: Partial<SessionMemoryConfig> = {}) {
    super();
    this.config = {
      maxShortTermEntries: config.maxShortTermEntries ?? 100,
      maxWorkingMemoryEntries: config.maxWorkingMemoryEntries ?? 20,
      maxEpisodicMemories: config.maxEpisodicMemories ?? 50,
      maxSemanticMemories: config.maxSemanticMemories ?? 200,
      maxProceduralMemories: config.maxProceduralMemories ?? 50,
      decayRate: config.decayRate ?? 0.1,
      consolidationThreshold: config.consolidationThreshold ?? 3,
    };

    this.memory = {
      sessionId,
      shortTerm: [],
      workingMemory: [],
      episodic: [],
      semantic: [],
      procedural: [],
    };
  }

  // Short-term memory operations
  addToShortTerm(content: string, type: string, importance: number = 5): MemoryEntry {
    const entry: MemoryEntry = {
      id: `mem-${++this.idCounter}`,
      content,
      type,
      importance,
      accessCount: 0,
      lastAccessed: new Date(),
      createdAt: new Date(),
    };

    this.memory.shortTerm.push(entry);

    // Enforce limit
    while (this.memory.shortTerm.length > this.config.maxShortTermEntries) {
      const removed = this.memory.shortTerm.shift();
      this.emit('memory:evicted', { type: 'shortTerm', entry: removed });
    }

    this.emit('memory:added', { type: 'shortTerm', entry });
    return entry;
  }

  // Working memory operations
  promoteToWorkingMemory(entryId: string): MemoryEntry | null {
    const entryIndex = this.memory.shortTerm.findIndex(e => e.id === entryId);
    if (entryIndex === -1) return null;

    const entry = this.memory.shortTerm[entryIndex];
    entry.accessCount++;
    entry.lastAccessed = new Date();

    // Move to working memory if not already there
    if (!this.memory.workingMemory.find(e => e.id === entryId)) {
      this.memory.workingMemory.push(entry);

      // Enforce limit
      while (this.memory.workingMemory.length > this.config.maxWorkingMemoryEntries) {
        const removed = this.findLeastImportant(this.memory.workingMemory);
        if (removed) {
          this.memory.workingMemory = this.memory.workingMemory.filter(e => e.id !== removed.id);
          this.emit('memory:evicted', { type: 'workingMemory', entry: removed });
        }
      }

      this.emit('memory:promoted', { from: 'shortTerm', to: 'workingMemory', entry });
    }

    return entry;
  }

  private findLeastImportant(entries: MemoryEntry[]): MemoryEntry | null {
    if (entries.length === 0) return null;

    return entries.reduce((least, current) => {
      const leastScore = this.calculateMemoryScore(least);
      const currentScore = this.calculateMemoryScore(current);
      return currentScore < leastScore ? current : least;
    });
  }

  private calculateMemoryScore(entry: MemoryEntry): number {
    const age = (Date.now() - entry.createdAt.getTime()) / 1000 / 60; // minutes
    const recency = (Date.now() - entry.lastAccessed.getTime()) / 1000 / 60;
    
    return (
      entry.importance * 0.4 +
      entry.accessCount * 0.3 +
      Math.exp(-recency / 60) * 0.2 +
      Math.exp(-age / 120) * 0.1
    );
  }

  // Episodic memory operations
  recordEpisode(episode: string, context: string, outcome: string): EpisodicMemory {
    const memory: EpisodicMemory = {
      id: `ep-${++this.idCounter}`,
      episode,
      context,
      outcome,
      timestamp: new Date(),
    };

    this.memory.episodic.push(memory);

    // Enforce limit
    while (this.memory.episodic.length > this.config.maxEpisodicMemories) {
      this.memory.episodic.shift();
    }

    this.emit('episode:recorded', memory);
    return memory;
  }

  recallEpisodes(query: string, limit: number = 5): EpisodicMemory[] {
    // Simple keyword matching (would use embeddings in production)
    const queryLower = query.toLowerCase();
    
    return this.memory.episodic
      .filter(ep => 
        ep.episode.toLowerCase().includes(queryLower) ||
        ep.context.toLowerCase().includes(queryLower)
      )
      .slice(-limit);
  }

  // Semantic memory operations
  addSemanticKnowledge(concept: string, definition: string, relationships: { concept: string; relation: string }[] = []): SemanticMemory {
    // Check if concept already exists
    const existing = this.memory.semantic.find(s => s.concept === concept);
    if (existing) {
      existing.definition = definition;
      existing.relationships = [...existing.relationships, ...relationships];
      existing.confidence = Math.min(existing.confidence + 0.1, 1.0);
      return existing;
    }

    const memory: SemanticMemory = {
      id: `sem-${++this.idCounter}`,
      concept,
      definition,
      relationships,
      confidence: 0.5,
    };

    this.memory.semantic.push(memory);

    // Enforce limit
    while (this.memory.semantic.length > this.config.maxSemanticMemories) {
      const leastConfident = this.memory.semantic.reduce((min, curr) =>
        curr.confidence < min.confidence ? curr : min
      );
      this.memory.semantic = this.memory.semantic.filter(s => s.id !== leastConfident.id);
    }

    this.emit('semantic:added', memory);
    return memory;
  }

  lookupConcept(concept: string): SemanticMemory | null {
    return this.memory.semantic.find(s => 
      s.concept.toLowerCase() === concept.toLowerCase()
    ) ?? null;
  }

  // Procedural memory operations
  learnProcedure(procedure: string, steps: string[], conditions: string[] = []): ProceduralMemory {
    const existing = this.memory.procedural.find(p => p.procedure === procedure);
    if (existing) {
      existing.steps = steps;
      existing.conditions = conditions;
      existing.lastUsed = new Date();
      return existing;
    }

    const memory: ProceduralMemory = {
      id: `proc-${++this.idCounter}`,
      procedure,
      steps,
      conditions,
      successRate: 0.5,
      lastUsed: new Date(),
    };

    this.memory.procedural.push(memory);

    // Enforce limit
    while (this.memory.procedural.length > this.config.maxProceduralMemories) {
      const oldest = this.memory.procedural.reduce((old, curr) =>
        curr.lastUsed < old.lastUsed ? curr : old
      );
      this.memory.procedural = this.memory.procedural.filter(p => p.id !== oldest.id);
    }

    this.emit('procedure:learned', memory);
    return memory;
  }

  executeProcedure(procedureId: string, success: boolean): void {
    const proc = this.memory.procedural.find(p => p.id === procedureId);
    if (proc) {
      proc.lastUsed = new Date();
      // Update success rate with exponential moving average
      proc.successRate = proc.successRate * 0.9 + (success ? 0.1 : 0);
      this.emit('procedure:executed', { procedure: proc, success });
    }
  }

  lookupProcedure(name: string): ProceduralMemory | null {
    return this.memory.procedural.find(p =>
      p.procedure.toLowerCase().includes(name.toLowerCase())
    ) ?? null;
  }

  // Memory consolidation
  consolidate(): void {
    // Move frequently accessed short-term to working memory
    for (const entry of this.memory.shortTerm) {
      if (entry.accessCount >= this.config.consolidationThreshold) {
        this.promoteToWorkingMemory(entry.id);
      }
    }

    // Apply decay to short-term memory
    this.memory.shortTerm = this.memory.shortTerm.filter(entry => {
      const age = (Date.now() - entry.lastAccessed.getTime()) / 1000 / 60;
      const decayedImportance = entry.importance * Math.exp(-this.config.decayRate * age / 60);
      return decayedImportance > 1;
    });

    this.emit('memory:consolidated');
  }

  // Retrieval
  getMemory(): SessionMemory {
    return { ...this.memory };
  }

  getWorkingMemory(): MemoryEntry[] {
    return [...this.memory.workingMemory];
  }

  searchAll(query: string): {
    shortTerm: MemoryEntry[];
    working: MemoryEntry[];
    episodic: EpisodicMemory[];
    semantic: SemanticMemory[];
    procedural: ProceduralMemory[];
  } {
    const queryLower = query.toLowerCase();

    return {
      shortTerm: this.memory.shortTerm.filter(e => e.content.toLowerCase().includes(queryLower)),
      working: this.memory.workingMemory.filter(e => e.content.toLowerCase().includes(queryLower)),
      episodic: this.memory.episodic.filter(e =>
        e.episode.toLowerCase().includes(queryLower) ||
        e.context.toLowerCase().includes(queryLower)
      ),
      semantic: this.memory.semantic.filter(s =>
        s.concept.toLowerCase().includes(queryLower) ||
        s.definition.toLowerCase().includes(queryLower)
      ),
      procedural: this.memory.procedural.filter(p =>
        p.procedure.toLowerCase().includes(queryLower)
      ),
    };
  }

  clear(): void {
    this.memory.shortTerm = [];
    this.memory.workingMemory = [];
    this.memory.episodic = [];
    this.memory.semantic = [];
    this.memory.procedural = [];
    this.emit('memory:cleared');
  }

  // Serialization
  serialize(): string {
    return JSON.stringify(this.memory);
  }

  deserialize(data: string): void {
    this.memory = JSON.parse(data);
    this.emit('memory:restored');
  }
}

/**
 * Creates a session memory manager
 */
export function createSessionMemory(sessionId: string, config?: Partial<SessionMemoryConfig>): SessionMemoryManager {
  return new SessionMemoryManager(sessionId, config);
}
