/**
 * Adaptive AI types
 */

export interface ContextWindow {
  maxTokens: number;
  usedTokens: number;
  availableTokens: number;
  segments: ContextSegment[];
}

export interface ContextSegment {
  id: string;
  type: 'system' | 'user' | 'assistant' | 'code' | 'file' | 'search' | 'memory';
  content: string;
  tokens: number;
  priority: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ShapingStrategy {
  name: string;
  priorityWeights: {
    recency: number;
    relevance: number;
    importance: number;
    userProvided: number;
  };
  compressionRatio: number;
  preserveLastN: number;
}

export interface Task {
  id: string;
  description: string;
  type: 'atomic' | 'composite';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  priority: number;
  dependencies: string[];
  subtasks: Task[];
  estimatedComplexity: number;
  createdAt: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
}

export interface DecompositionResult {
  originalTask: string;
  subtasks: Task[];
  executionOrder: string[];
  parallelGroups: string[][];
  estimatedSteps: number;
}

export interface HorizonPlan {
  id: string;
  goal: string;
  phases: PlanPhase[];
  currentPhase: number;
  checkpoints: Checkpoint[];
  constraints: string[];
  successCriteria: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanPhase {
  id: string;
  name: string;
  description: string;
  tasks: Task[];
  milestones: string[];
  status: 'pending' | 'active' | 'completed' | 'skipped';
}

export interface Checkpoint {
  id: string;
  phaseId: string;
  description: string;
  validationCriteria: string[];
  isReached: boolean;
  reachedAt?: Date;
}

export interface SessionMemory {
  sessionId: string;
  shortTerm: MemoryEntry[];
  workingMemory: MemoryEntry[];
  episodic: EpisodicMemory[];
  semantic: SemanticMemory[];
  procedural: ProceduralMemory[];
}

export interface MemoryEntry {
  id: string;
  content: string;
  type: string;
  importance: number;
  accessCount: number;
  lastAccessed: Date;
  createdAt: Date;
  embedding?: number[];
}

export interface EpisodicMemory {
  id: string;
  episode: string;
  context: string;
  outcome: string;
  timestamp: Date;
  emotionalValence?: number;
}

export interface SemanticMemory {
  id: string;
  concept: string;
  definition: string;
  relationships: { concept: string; relation: string }[];
  confidence: number;
}

export interface ProceduralMemory {
  id: string;
  procedure: string;
  steps: string[];
  conditions: string[];
  successRate: number;
  lastUsed: Date;
}
