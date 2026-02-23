/**
 * Titan AI Gateway - Model Registry
 * Comprehensive registry of all supported models with metadata
 */

import type { ModelDefinition } from './types.js';

export const MODEL_REGISTRY: ModelDefinition[] = [
  // ============================================
  // ANTHROPIC MODELS
  // ============================================
  {
    id: 'claude-sonnet-4.6',
    provider: 'anthropic',
    tier: 'frontier',
    contextWindow: 1050000,
    maxOutputTokens: 64000,
    costPer1MInput: 3.0,
    costPer1MOutput: 15.0,
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'claude-opus-4.6',
    provider: 'anthropic',
    tier: 'frontier',
    contextWindow: 1000000,
    maxOutputTokens: 32000,
    costPer1MInput: 5.0,
    costPer1MOutput: 25.0,
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'claude-opus-4-20250514',
    provider: 'anthropic',
    tier: 'frontier',
    contextWindow: 200000,
    maxOutputTokens: 32000,
    costPer1MInput: 15.0,
    costPer1MOutput: 75.0,
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    tier: 'standard',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    costPer1MInput: 3.0,
    costPer1MOutput: 15.0,
    supportsThinking: false,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    tier: 'economy',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    costPer1MInput: 0.8,
    costPer1MOutput: 4.0,
    supportsThinking: false,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },

  // ============================================
  // OPENAI MODELS
  // ============================================
  {
    id: 'gpt-4o',
    provider: 'openai',
    tier: 'frontier',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    costPer1MInput: 2.5,
    costPer1MOutput: 10.0,
    supportsThinking: false,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    tier: 'economy',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    costPer1MInput: 0.15,
    costPer1MOutput: 0.6,
    supportsThinking: false,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'o1',
    provider: 'openai',
    tier: 'frontier',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    costPer1MInput: 15.0,
    costPer1MOutput: 60.0,
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'o3-mini',
    provider: 'openai',
    tier: 'standard',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    costPer1MInput: 1.1,
    costPer1MOutput: 4.4,
    supportsThinking: true,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
  },

  // ============================================
  // DEEPSEEK MODELS
  // ============================================
  {
    id: 'deepseek-chat',
    provider: 'deepseek',
    tier: 'economy',
    contextWindow: 64000,
    maxOutputTokens: 8192,
    costPer1MInput: 0.14,
    costPer1MOutput: 0.28,
    supportsThinking: false,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'deepseek-r1',
    provider: 'deepseek',
    tier: 'standard',
    contextWindow: 64000,
    maxOutputTokens: 8192,
    costPer1MInput: 0.55,
    costPer1MOutput: 2.19,
    supportsThinking: true,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
  },

  // ============================================
  // GOOGLE MODELS
  // ============================================
  {
    id: 'google-gemini-3.1-pro-preview',
    provider: 'google',
    tier: 'frontier',
    contextWindow: 1000000,
    maxOutputTokens: 32000,
    costPer1MInput: 2.0,
    costPer1MOutput: 12.0,
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gemini-2.0-flash',
    provider: 'google',
    tier: 'standard',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    costPer1MInput: 0.075,
    costPer1MOutput: 0.3,
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gemini-2.0-flash-thinking',
    provider: 'google',
    tier: 'standard',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    costPer1MInput: 0.075,
    costPer1MOutput: 0.3,
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },

  // ============================================
  // QWEN MODELS
  // ============================================
  {
    id: 'qwen3.5-plus-02-15',
    provider: 'qwen',
    tier: 'frontier',
    contextWindow: 1000000,
    maxOutputTokens: 32000,
    costPer1MInput: 0.40,
    costPer1MOutput: 2.40,
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'qwen3.5-397b-a17b',
    provider: 'qwen',
    tier: 'frontier',
    contextWindow: 262000,
    maxOutputTokens: 16384,
    costPer1MInput: 0.15,
    costPer1MOutput: 1.0,
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'qwen3-max-thinking',
    provider: 'qwen',
    tier: 'frontier',
    contextWindow: 262000,
    maxOutputTokens: 16384,
    costPer1MInput: 1.20,
    costPer1MOutput: 6.0,
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'qwen3-coder-next',
    provider: 'qwen',
    tier: 'economy',
    contextWindow: 262000,
    maxOutputTokens: 16384,
    costPer1MInput: 0.12,
    costPer1MOutput: 0.75,
    supportsThinking: false,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
  },

  // ============================================
  // MINIMAX MODELS
  // ============================================
  {
    id: 'minimax-m2.5',
    provider: 'minimax',
    tier: 'frontier',
    contextWindow: 197000,
    maxOutputTokens: 16384,
    costPer1MInput: 0.30,
    costPer1MOutput: 1.10,
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },

  // ============================================
  // MISTRAL MODELS
  // ============================================
  {
    id: 'mistral-large-latest',
    provider: 'mistral',
    tier: 'standard',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    costPer1MInput: 2.0,
    costPer1MOutput: 6.0,
    supportsThinking: false,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'codestral-latest',
    provider: 'mistral',
    tier: 'standard',
    contextWindow: 32000,
    maxOutputTokens: 8192,
    costPer1MInput: 0.3,
    costPer1MOutput: 0.9,
    supportsThinking: false,
    supportsVision: false,
    supportsTools: false,
    supportsStreaming: true,
  },

  // ============================================
  // LOCAL MODELS (Ollama)
  // ============================================
  {
    id: 'llama3.3:70b',
    provider: 'ollama',
    tier: 'local',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    costPer1MInput: 0,
    costPer1MOutput: 0,
    supportsThinking: false,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'qwen2.5-coder:32b',
    provider: 'ollama',
    tier: 'local',
    contextWindow: 32000,
    maxOutputTokens: 8192,
    costPer1MInput: 0,
    costPer1MOutput: 0,
    supportsThinking: false,
    supportsVision: false,
    supportsTools: false,
    supportsStreaming: true,
  },
  {
    id: 'deepseek-coder-v2:16b',
    provider: 'ollama',
    tier: 'local',
    contextWindow: 64000,
    maxOutputTokens: 8192,
    costPer1MInput: 0,
    costPer1MOutput: 0,
    supportsThinking: false,
    supportsVision: false,
    supportsTools: false,
    supportsStreaming: true,
  },
  {
    id: 'starcoder2:3b',
    provider: 'ollama',
    tier: 'local',
    contextWindow: 16000,
    maxOutputTokens: 4096,
    costPer1MInput: 0,
    costPer1MOutput: 0,
    supportsThinking: false,
    supportsVision: false,
    supportsTools: false,
    supportsStreaming: true,
  },
];

/**
 * Get model by ID
 */
export function getModel(modelId: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find(m => m.id === modelId);
}

/**
 * Get models by tier
 */
export function getModelsByTier(tier: ModelDefinition['tier']): ModelDefinition[] {
  return MODEL_REGISTRY.filter(m => m.tier === tier);
}

/**
 * Get models by provider
 */
export function getModelsByProvider(provider: ModelDefinition['provider']): ModelDefinition[] {
  return MODEL_REGISTRY.filter(m => m.provider === provider);
}

/**
 * Get cheapest model that meets requirements
 */
export function getCheapestModel(options: {
  minContextWindow?: number;
  supportsVision?: boolean;
  supportsTools?: boolean;
  supportsThinking?: boolean;
}): ModelDefinition | undefined {
  return MODEL_REGISTRY.filter(m => {
    if (options.minContextWindow && m.contextWindow < options.minContextWindow) return false;
    if (options.supportsVision && !m.supportsVision) return false;
    if (options.supportsTools && !m.supportsTools) return false;
    if (options.supportsThinking && !m.supportsThinking) return false;
    return true;
  }).sort((a, b) => a.costPer1MInput + a.costPer1MOutput - (b.costPer1MInput + b.costPer1MOutput))[0];
}
