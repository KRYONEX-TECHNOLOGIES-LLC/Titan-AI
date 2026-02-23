/**
 * Shared Model Registry
 * Centralized list of all supported AI models with VERIFIED OpenRouter model IDs.
 * Imported by /api/models and /api/chat.
 */

export interface ModelInfo {
  id: string;
  providerModelId: string;
  name: string;
  provider: string;
  tier: 'frontier' | 'standard' | 'economy' | 'local';
  contextWindow: number;
  maxOutputTokens: number;
  supportsThinking: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  costPer1MInput: number;
  costPer1MOutput: number;
  description: string;
}

// Legacy IDs used by older Titan builds/settings. Keep these mappings
// so saved preferences and old sessions continue to resolve correctly.
export const MODEL_ID_ALIASES: Record<string, string> = {
  'claude-4.6-opus': 'claude-opus-4.6',
  'claude-4.6-sonnet': 'claude-sonnet-4.6',
  'gemini-2.0-pro': 'gemini-2.5-pro',
  'titan-supreme': 'titan-supreme-protocol',
};

export function normalizeModelId(modelId: string): string {
  const id = (modelId || '').trim();
  if (!id) return id;
  return MODEL_ID_ALIASES[id] || id;
}

export const MODEL_REGISTRY: ModelInfo[] = [
  // ═══ TITAN PROTOCOL (Multi-Agent Governance System) ═══
  // Protocol card pricing is a blended per-1M estimate from current role model mix.
  { id: 'titan-protocol', providerModelId: 'anthropic/claude-opus-4.6', name: 'Titan Protocol', provider: 'Titan AI', tier: 'frontier', contextWindow: 1000000, maxOutputTokens: 32000, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 0.41, costPer1MOutput: 1.88, description: 'Multi-agent governance with mandatory verification. Blended estimate from Qwen3.5-Plus + DeepSeek Reasoner + Qwen3 Coder Next role stack.' },
  { id: 'titan-protocol-v2', providerModelId: 'anthropic/claude-opus-4.6', name: 'Titan Protocol v2 (Parallel)', provider: 'Titan AI', tier: 'frontier', contextWindow: 1000000, maxOutputTokens: 32000, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 0.33, costPer1MOutput: 1.51, description: 'Parallel multi-lane governance using Qwen3.5-Plus (supervisor), Qwen3 Coder Next (workers), DeepSeek Reasoner (verifiers), and Gemini 2.0 Flash (executor).' },
  { id: 'titan-supreme-protocol', providerModelId: 'anthropic/claude-opus-4.6', name: 'Titan Supreme Protocol', provider: 'Titan AI', tier: 'frontier', contextWindow: 1000000, maxOutputTokens: 32000, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 0.33, costPer1MOutput: 1.51, description: 'Supreme 4-role governance with Qwen3.5-Plus overseer, DeepSeek Reasoner operator, Qwen3 Coder Next primary worker, and Gemini 2.0 Flash secondary worker.' },
  { id: 'titan-omega-protocol', providerModelId: 'anthropic/claude-opus-4.6', name: 'Titan Omega Protocol', provider: 'Titan AI', tier: 'frontier', contextWindow: 1000000, maxOutputTokens: 32000, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 0.4, costPer1MOutput: 1.83, description: 'Long-horizon governance using Qwen3.5-Plus architect/high-risk specialist, DeepSeek Reasoner sentinel/operator, Qwen3 Coder Next medium-risk specialist, and Gemini 2.0 Flash low-risk specialist.' },

  // ═══ ANTHROPIC (verified from OpenRouter /api/v1/models) ═══
  { id: 'claude-sonnet-4.6', providerModelId: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', provider: 'Anthropic', tier: 'frontier', contextWindow: 1000000, maxOutputTokens: 64000, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 3, costPer1MOutput: 15, description: 'Latest and most capable Sonnet with 1M context' },
  { id: 'claude-opus-4.6', providerModelId: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6', provider: 'Anthropic', tier: 'frontier', contextWindow: 1000000, maxOutputTokens: 32000, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 15, costPer1MOutput: 75, description: 'Most capable Claude model' },
  { id: 'claude-sonnet-4', providerModelId: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic', tier: 'frontier', contextWindow: 200000, maxOutputTokens: 64000, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 3, costPer1MOutput: 15, description: 'Excellent coding and reasoning' },
  { id: 'claude-opus-4', providerModelId: 'anthropic/claude-opus-4', name: 'Claude Opus 4', provider: 'Anthropic', tier: 'frontier', contextWindow: 200000, maxOutputTokens: 32000, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 15, costPer1MOutput: 75, description: 'Deep reasoning flagship' },
  { id: 'claude-3.7-sonnet', providerModelId: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'Anthropic', tier: 'standard', contextWindow: 200000, maxOutputTokens: 8192, supportsThinking: false, supportsVision: true, supportsTools: true, costPer1MInput: 3, costPer1MOutput: 15, description: 'Great balance of speed and capability' },
  { id: 'claude-3.5-sonnet', providerModelId: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', tier: 'standard', contextWindow: 200000, maxOutputTokens: 8192, supportsThinking: false, supportsVision: true, supportsTools: true, costPer1MInput: 3, costPer1MOutput: 15, description: 'Previous generation Sonnet' },
  { id: 'claude-3.5-haiku', providerModelId: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', provider: 'Anthropic', tier: 'economy', contextWindow: 200000, maxOutputTokens: 8192, supportsThinking: false, supportsVision: true, supportsTools: true, costPer1MInput: 0.8, costPer1MOutput: 4, description: 'Fast and affordable' },

  // ═══ OPENAI ═══
  { id: 'gpt-5.3', providerModelId: 'openai/gpt-5.3', name: 'GPT-5.3', provider: 'OpenAI', tier: 'frontier', contextWindow: 200000, maxOutputTokens: 100000, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 10, costPer1MOutput: 40, description: 'High-capability OpenAI model for advanced coding and reasoning' },
  { id: 'gpt-4o', providerModelId: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', tier: 'standard', contextWindow: 128000, maxOutputTokens: 16384, supportsThinking: false, supportsVision: true, supportsTools: true, costPer1MInput: 2.5, costPer1MOutput: 10, description: 'Multimodal with fast responses' },
  { id: 'gpt-4o-mini', providerModelId: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', tier: 'economy', contextWindow: 128000, maxOutputTokens: 16384, supportsThinking: false, supportsVision: true, supportsTools: true, costPer1MInput: 0.15, costPer1MOutput: 0.6, description: 'Cost-efficient for simple tasks' },
  { id: 'o3', providerModelId: 'openai/o3', name: 'o3', provider: 'OpenAI', tier: 'frontier', contextWindow: 200000, maxOutputTokens: 100000, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 10, costPer1MOutput: 40, description: 'Most capable OpenAI reasoning' },
  { id: 'o3-mini', providerModelId: 'openai/o3-mini', name: 'o3 Mini', provider: 'OpenAI', tier: 'standard', contextWindow: 200000, maxOutputTokens: 100000, supportsThinking: true, supportsVision: false, supportsTools: true, costPer1MInput: 1.1, costPer1MOutput: 4.4, description: 'Fast reasoning model' },
  { id: 'o1', providerModelId: 'openai/o1', name: 'o1', provider: 'OpenAI', tier: 'frontier', contextWindow: 200000, maxOutputTokens: 100000, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 15, costPer1MOutput: 60, description: 'Advanced reasoning' },

  // ═══ GOOGLE ═══
  { id: 'gemini-3.1-pro-preview', providerModelId: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', provider: 'Google', tier: 'frontier', contextWindow: 1000000, maxOutputTokens: 32000, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 2, costPer1MOutput: 12, description: 'Google frontier reasoning model — enhanced agentic coding, multimodal, SWE-bench 55.5' },
  { id: 'gemini-2.5-pro', providerModelId: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Google', tier: 'frontier', contextWindow: 1000000, maxOutputTokens: 65536, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 1.25, costPer1MOutput: 10, description: 'Most capable Gemini with thinking' },
  { id: 'gemini-2.5-flash', providerModelId: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', tier: 'standard', contextWindow: 1000000, maxOutputTokens: 65536, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 0.15, costPer1MOutput: 0.6, description: 'Fast reasoning with huge context' },
  { id: 'gemini-2.0-flash', providerModelId: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', provider: 'Google', tier: 'economy', contextWindow: 1000000, maxOutputTokens: 8192, supportsThinking: false, supportsVision: true, supportsTools: true, costPer1MInput: 0.1, costPer1MOutput: 0.4, description: 'Fast and multimodal' },
  { id: 'gemini-2.0-flash-thinking', providerModelId: 'google/gemini-2.0-flash-thinking-exp', name: 'Gemini 2.0 Flash Thinking', provider: 'Google', tier: 'standard', contextWindow: 1000000, maxOutputTokens: 8192, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 0.075, costPer1MOutput: 0.3, description: 'Flash speed with visible chain-of-thought reasoning' },

  // ═══ DEEPSEEK ═══
  { id: 'deepseek-chat', providerModelId: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek', tier: 'economy', contextWindow: 64000, maxOutputTokens: 8192, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1MInput: 0.14, costPer1MOutput: 0.28, description: 'Excellent code generation' },
  { id: 'deepseek-r1', providerModelId: 'deepseek/deepseek-r1', name: 'DeepSeek R1', provider: 'DeepSeek', tier: 'standard', contextWindow: 64000, maxOutputTokens: 8192, supportsThinking: true, supportsVision: false, supportsTools: true, costPer1MInput: 0.7, costPer1MOutput: 2.5, description: 'Reasoning with chain-of-thought' },
  { id: 'deepseek-reasoner', providerModelId: 'deepseek/deepseek-reasoner', name: 'DeepSeek Reasoner', provider: 'DeepSeek', tier: 'standard', contextWindow: 64000, maxOutputTokens: 8192, supportsThinking: true, supportsVision: false, supportsTools: true, costPer1MInput: 0.7, costPer1MOutput: 2.5, description: 'Chain-of-thought verification with visible reasoning trace' },
  { id: 'deepseek-v3.2', providerModelId: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', provider: 'DeepSeek', tier: 'standard', contextWindow: 163840, maxOutputTokens: 8192, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1MInput: 0.26, costPer1MOutput: 0.38, description: 'GPT-5 class reasoning, gold-medal IMO/IOI performance' },

  // ═══ MISTRAL ═══
  { id: 'mistral-large', providerModelId: 'mistralai/mistral-large', name: 'Mistral Large', provider: 'Mistral', tier: 'standard', contextWindow: 128000, maxOutputTokens: 8192, supportsThinking: false, supportsVision: true, supportsTools: true, costPer1MInput: 2, costPer1MOutput: 6, description: 'European frontier model' },
  { id: 'codestral', providerModelId: 'mistralai/codestral-2508', name: 'Codestral', provider: 'Mistral', tier: 'standard', contextWindow: 256000, maxOutputTokens: 8192, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1MInput: 0.3, costPer1MOutput: 0.9, description: 'Specialized for code' },
  { id: 'mistral-nemo', providerModelId: 'mistralai/mistral-nemo', name: 'Mistral Nemo', provider: 'Mistral', tier: 'economy', contextWindow: 128000, maxOutputTokens: 8192, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1MInput: 0.035, costPer1MOutput: 0.14, description: 'Fast and efficient' },

  // ═══ META ═══
  { id: 'llama-3.3-70b', providerModelId: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'Meta', tier: 'standard', contextWindow: 128000, maxOutputTokens: 8192, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1MInput: 0.35, costPer1MOutput: 0.4, description: 'Open-source powerhouse' },
  { id: 'llama-4-maverick', providerModelId: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', provider: 'Meta', tier: 'frontier', contextWindow: 128000, maxOutputTokens: 8192, supportsThinking: false, supportsVision: true, supportsTools: true, costPer1MInput: 0.3, costPer1MOutput: 0.5, description: 'Latest Llama 4 model' },
  { id: 'llama-4-scout', providerModelId: 'meta-llama/llama-4-scout', name: 'Llama 4 Scout', provider: 'Meta', tier: 'standard', contextWindow: 512000, maxOutputTokens: 8192, supportsThinking: false, supportsVision: true, supportsTools: true, costPer1MInput: 0.15, costPer1MOutput: 0.3, description: 'Long-context Llama 4' },

  // ═══ COHERE ═══
  { id: 'command-r-plus', providerModelId: 'cohere/command-r-plus-08-2024', name: 'Command R+', provider: 'Cohere', tier: 'standard', contextWindow: 128000, maxOutputTokens: 4096, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1MInput: 2.5, costPer1MOutput: 10, description: 'RAG-optimized model' },
  { id: 'command-r', providerModelId: 'cohere/command-r-08-2024', name: 'Command R', provider: 'Cohere', tier: 'economy', contextWindow: 128000, maxOutputTokens: 4096, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1MInput: 0.15, costPer1MOutput: 0.6, description: 'Efficient retrieval model' },

  // ═══ XAI ═══
  { id: 'grok-4', providerModelId: 'x-ai/grok-4', name: 'Grok 4', provider: 'xAI', tier: 'frontier', contextWindow: 256000, maxOutputTokens: 16384, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 3, costPer1MOutput: 15, description: 'Latest xAI reasoning model with 256K context' },
  { id: 'grok-3', providerModelId: 'x-ai/grok-3', name: 'Grok 3', provider: 'xAI', tier: 'standard', contextWindow: 131072, maxOutputTokens: 8192, supportsThinking: false, supportsVision: true, supportsTools: true, costPer1MInput: 3, costPer1MOutput: 15, description: 'Real-time knowledge access' },

  // ═══ QWEN ═══
  { id: 'qwen3-max-thinking', providerModelId: 'qwen/qwen3-max-thinking', name: 'Qwen3 Max Thinking', provider: 'Qwen', tier: 'frontier', contextWindow: 262000, maxOutputTokens: 16384, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 1.2, costPer1MOutput: 6, description: 'Flagship Qwen3 reasoning model — deep multi-step thinking, top-tier factual accuracy and agentic behavior' },
  { id: 'qwen3.5-plus-2026-02-15', providerModelId: 'qwen/qwen3.5-plus-2026-02-15', name: 'Qwen3.5 Plus', provider: 'Qwen', tier: 'frontier', contextWindow: 1000000, maxOutputTokens: 32000, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 0.4, costPer1MOutput: 2.4, description: 'Frontier reasoning with 1M context at economy price' },
  { id: 'qwen3.5-397b-a17b', providerModelId: 'qwen/qwen3.5-397b-a17b-20260216', name: 'Qwen3.5 397B A17B', provider: 'Qwen', tier: 'frontier', contextWindow: 262000, maxOutputTokens: 16384, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1MInput: 0.15, costPer1MOutput: 1, description: 'Massive 397B MoE — SOTA across reasoning, code, vision, and agent tasks at near-economy pricing' },
  { id: 'qwen3-coder', providerModelId: 'qwen/qwen3-coder', name: 'Qwen3 Coder', provider: 'Qwen', tier: 'frontier', contextWindow: 256000, maxOutputTokens: 65536, supportsThinking: true, supportsVision: false, supportsTools: true, costPer1MInput: 0.4, costPer1MOutput: 1.6, description: 'Top-tier open coding model' },
  { id: 'qwen3-coder-next', providerModelId: 'qwen/qwen3-coder-next', name: 'Qwen3 Coder Next', provider: 'Qwen', tier: 'economy', contextWindow: 262000, maxOutputTokens: 16384, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1MInput: 0.12, costPer1MOutput: 0.75, description: 'Purpose-built code generation at near-zero cost' },
  { id: 'qwen-2.5-72b', providerModelId: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', provider: 'Qwen', tier: 'standard', contextWindow: 128000, maxOutputTokens: 8192, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1MInput: 0.35, costPer1MOutput: 0.4, description: 'Strong multilingual model' },
  { id: 'qwen-2.5-coder-72b', providerModelId: 'qwen/qwen-2.5-coder-72b-instruct', name: 'Qwen 2.5 Coder 72B', provider: 'Qwen', tier: 'standard', contextWindow: 128000, maxOutputTokens: 32768, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1MInput: 0.35, costPer1MOutput: 0.4, description: 'Top-tier code generation' },
  { id: 'qwen-2.5-coder-32b', providerModelId: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', provider: 'Qwen', tier: 'standard', contextWindow: 128000, maxOutputTokens: 8192, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1MInput: 0.18, costPer1MOutput: 0.18, description: 'Excellent for coding' },

  // ═══ MINIMAX ═══
  { id: 'minimax-m2.5', providerModelId: 'minimax/minimax-m2.5', name: 'MiniMax M2.5', provider: 'MiniMax', tier: 'frontier', contextWindow: 197000, maxOutputTokens: 66000, supportsThinking: true, supportsVision: false, supportsTools: true, costPer1MInput: 0.3, costPer1MOutput: 1.1, description: 'SOTA coding (80.2% SWE-bench), office productivity — Word/Excel/PowerPoint generation, strong agentic performance' },

  // ═══ LOCAL MODELS (Ollama) ═══
  { id: 'ollama-llama3.2', providerModelId: 'ollama/llama3.2', name: 'Llama 3.2 (Local)', provider: 'Local (Ollama)', tier: 'local', contextWindow: 128000, maxOutputTokens: 8192, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1MInput: 0, costPer1MOutput: 0, description: 'Free local model' },
  { id: 'ollama-qwen2.5-coder', providerModelId: 'ollama/qwen2.5-coder', name: 'Qwen 2.5 Coder (Local)', provider: 'Local (Ollama)', tier: 'local', contextWindow: 32000, maxOutputTokens: 8192, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1MInput: 0, costPer1MOutput: 0, description: 'Free local code model' },
  { id: 'ollama-deepseek-coder', providerModelId: 'ollama/deepseek-coder-v2', name: 'DeepSeek Coder V2 (Local)', provider: 'Local (Ollama)', tier: 'local', contextWindow: 128000, maxOutputTokens: 8192, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1MInput: 0, costPer1MOutput: 0, description: 'Fast local coding assistant' },
];
