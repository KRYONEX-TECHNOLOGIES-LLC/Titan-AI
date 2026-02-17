/**
 * Context types
 */

export interface ContextItem {
  id: string;
  type: ContextType;
  content: string;
  source: string;
  tokens: number;
  relevance: number;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export type ContextType = 
  | 'file'
  | 'selection'
  | 'definition'
  | 'reference'
  | 'diagnostic'
  | 'conversation'
  | 'search'
  | 'memory'
  | 'tool_result';

export interface ContextWindow {
  maxTokens: number;
  usedTokens: number;
  items: ContextItem[];
}

export interface WindowConfig {
  maxTokens: number;
  reservedForResponse: number;
  priorityWeights: PriorityWeights;
  compressionEnabled: boolean;
}

export interface PriorityWeights {
  recency: number;
  relevance: number;
  importance: number;
  userExplicit: number;
}

export interface RelevanceConfig {
  semanticWeight: number;
  syntacticWeight: number;
  recencyDecay: number;
  accessBoost: number;
}

export interface ContextRequest {
  query: string;
  currentFile?: string;
  selection?: string;
  conversationHistory?: string[];
  maxItems?: number;
  types?: ContextType[];
}

export interface ContextResult {
  items: ContextItem[];
  totalTokens: number;
  truncated: boolean;
  relevanceScores: Map<string, number>;
}

export interface ContextProvider {
  id: string;
  name: string;
  types: ContextType[];
  priority: number;
  getContext(request: ContextRequest): Promise<ContextItem[]>;
}
