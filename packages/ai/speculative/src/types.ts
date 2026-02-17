/**
 * Titan AI Speculative - Type Definitions
 */

// Block types for speculative editing
export type BlockType = 'character' | 'token' | 'line' | 'multi-line' | 'function' | 'file';

// Draft prediction result
export interface DraftPrediction {
  tokens: string[];
  confidence: number[];
  blockType: BlockType;
  speculativeCount: number;
  latencyMs: number;
}

// Verification result from target model
export interface VerificationResult {
  accepted: boolean[];
  acceptanceRate: number;
  finalOutput: string;
  reusedTokens: number;
  generatedTokens: number;
  corrections: TokenCorrection[];
  latencyMs: number;
}

// Token correction during verification
export interface TokenCorrection {
  position: number;
  draft: string;
  corrected: string;
  reason?: string;
}

// EfficientEdit configuration
export interface EfficientEditConfig {
  draftModel: string;           // e.g., "starcoder2:3b"
  targetModel: string;          // e.g., "claude-sonnet-4-20250514"
  speculativeCount: number;     // Number of tokens to speculate (3-12)
  redundancyThreshold: number;  // Threshold for reuse (0.0-1.0)
  maxIterations: number;        // Max draft-verify cycles
  acceptanceTarget: number;     // Target acceptance rate (0.7+)
  enableCaching: boolean;       // Cache successful patterns
  blockTypeHint?: BlockType;    // Hint for block type
}

// Speculation request
export interface SpeculationRequest {
  prefix: string;               // Code before cursor
  suffix?: string;              // Code after cursor (for fill-in)
  context?: string;             // Additional context
  language: string;             // Programming language
  maxTokens?: number;           // Max tokens to generate
  stopSequences?: string[];     // Stop generation on these
}

// Speculation response
export interface SpeculationResponse {
  completion: string;
  acceptanceRate: number;
  totalTokens: number;
  reusedTokens: number;
  generatedTokens: number;
  iterations: number;
  totalLatencyMs: number;
  draftLatencyMs: number;
  verifyLatencyMs: number;
  cacheHit: boolean;
}

// Edit operation types
export type EditOperation = 'insert' | 'replace' | 'delete';

// Edit region in code
export interface EditRegion {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  operation: EditOperation;
  content: string;
}

// Redundancy analysis result
export interface RedundancyAnalysis {
  reusableSegments: ReusableSegment[];
  totalCharacters: number;
  reusableCharacters: number;
  reusabilityRatio: number;
}

// Reusable code segment
export interface ReusableSegment {
  start: number;
  end: number;
  content: string;
  confidence: number;
}

// Cache entry for successful patterns
export interface PatternCacheEntry {
  pattern: string;
  completion: string;
  language: string;
  acceptanceRate: number;
  useCount: number;
  lastUsed: number;
}

// Speculative engine statistics
export interface SpeculativeStats {
  totalRequests: number;
  totalTokensGenerated: number;
  totalTokensReused: number;
  averageAcceptanceRate: number;
  averageLatencyMs: number;
  cacheHitRate: number;
  byLanguage: Record<string, {
    requests: number;
    acceptanceRate: number;
  }>;
}

// Acceptance rate tuning parameters
export interface TuningParameters {
  speculativeCount: number;
  temperature: number;
  topP: number;
  topK: number;
}

// Tuning history entry
export interface TuningHistoryEntry {
  timestamp: number;
  parameters: TuningParameters;
  acceptanceRate: number;
  latencyMs: number;
}
