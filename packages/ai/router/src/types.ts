/**
 * Titan AI Router - Type Definitions
 */

import type { ModelDefinition, Provider, Message } from '@titan/ai-gateway';

// Task complexity levels
export type TaskComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'frontier';

// Task types
export type TaskType =
  | 'completion'          // Code completion
  | 'chat'                // General chat
  | 'edit'                // Code editing
  | 'refactor'            // Code refactoring
  | 'debug'               // Debugging
  | 'explain'             // Code explanation
  | 'test'                // Test generation
  | 'documentation'       // Documentation
  | 'security-review'     // Security analysis
  | 'architecture'        // Architecture planning
  | 'long-horizon';       // Multi-step reasoning

// Routing decision
export interface RoutingDecision {
  model: ModelDefinition;
  provider: Provider;
  reason: string;
  estimatedCost: number;
  estimatedLatency: number;
  fallbacks: ModelDefinition[];
  confidence: number;
}

// Task analysis result
export interface TaskAnalysis {
  complexity: TaskComplexity;
  type: TaskType;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  requiresVision: boolean;
  requiresTools: boolean;
  requiresThinking: boolean;
  requiresLargeContext: boolean;
  contextTokens: number;
}

// Cascade configuration
export interface CascadeConfig {
  frontier: ModelDefinition;      // Claude 4.6 Opus / GPT-5
  standard: ModelDefinition;      // Claude 4.6 Sonnet / GPT-4o
  economy: ModelDefinition;       // DeepSeek / GPT-4o-mini
  local: ModelDefinition;         // Ollama Llama 3
  thresholds: {
    trivialMaxTokens: number;     // Max tokens for trivial tasks
    simpleMaxTokens: number;      // Max tokens for simple tasks
    moderateMaxTokens: number;    // Max tokens for moderate tasks
    complexMinTokens: number;     // Min tokens requiring complex model
    frontierMinTokens: number;    // Min tokens requiring frontier model
  };
}

// Router configuration
export interface RouterConfig {
  cascade: CascadeConfig;
  costBudget?: {
    daily: number;
    perRequest: number;
  };
  preferLocal: boolean;
  preferSpeed: boolean;
  allowFrontier: boolean;
}

// Usage tracking
export interface UsageMetrics {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  byModel: Record<string, {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }>;
  byTaskType: Record<TaskType, number>;
}

// Rate limit state
export interface RateLimitState {
  provider: Provider;
  model: string;
  retryAfter: number;
  timestamp: number;
}

// Fallback result
export interface FallbackResult {
  success: boolean;
  model: ModelDefinition;
  attemptsCount: number;
  totalLatency: number;
}

// Context scaling result
export interface ContextScalingResult {
  originalTokens: number;
  scaledTokens: number;
  truncated: boolean;
  strategy: 'none' | 'tail' | 'middle' | 'summarize';
  fitsInContext: boolean;
}
