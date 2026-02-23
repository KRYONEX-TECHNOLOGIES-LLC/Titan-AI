/**
 * Titan AI Gateway - Type Definitions
 */

import { z } from 'zod';

// Provider types
export type Provider =
  | 'anthropic'
  | 'openai'
  | 'deepseek'
  | 'minimax'
  | 'openrouter'
  | 'ollama'
  | 'groq'
  | 'together'
  | 'fireworks'
  | 'mistral'
  | 'cohere'
  | 'google'
  | 'azure'
  | 'qwen';

// Model tiers for routing
export type ModelTier = 'frontier' | 'standard' | 'economy' | 'local';

// Message roles
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

// Message content types
export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    mediaType?: string;
    data?: string;
    url?: string;
  };
}

export type MessageContent = string | (TextContent | ImageContent)[];

// Chat message
export interface Message {
  role: MessageRole;
  content: MessageContent;
  name?: string;
  toolCallId?: string;
}

// Tool definition
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// Tool call
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// Effort levels for adaptive thinking (Claude Opus)
export type EffortLevel = 'low' | 'medium' | 'high' | 'max';

// Model configuration
export interface ModelConfig {
  provider: Provider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  thinking?: boolean;
  thinkingBudget?: number;
  /** Effort level for Claude Opus adaptive thinking */
  effort?: EffortLevel;
}

// Model definition for registry
export interface ModelDefinition {
  id: string;
  provider: Provider;
  tier: ModelTier;
  contextWindow: number;
  maxOutputTokens: number;
  costPer1MInput: number;
  costPer1MOutput: number;
  supportsThinking: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
}

// Completion request
export interface CompletionRequest {
  messages: Message[];
  model?: string;
  config?: Partial<ModelConfig>;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  stream?: boolean;
}

// Completion response
export interface CompletionResponse {
  id: string;
  model: string;
  provider: Provider;
  content: string;
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    thinkingTokens?: number;
  };
  thinking?: string;
  latencyMs: number;
}

// Streaming chunk
export interface StreamChunk {
  id: string;
  delta: {
    content?: string;
    toolCalls?: Partial<ToolCall>[];
    thinking?: string;
  };
  finishReason?: CompletionResponse['finishReason'];
}

// Embedding request
export interface EmbeddingRequest {
  input: string | string[];
  model?: string;
  dimensions?: number;
}

// Embedding response
export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

// Gateway client configuration
export interface GatewayConfig {
  defaultProvider: Provider;
  defaultModel: string;
  apiKeys: Partial<Record<Provider, string>>;
  baseUrls?: Partial<Record<Provider, string>>;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

// Gateway client interface
export interface IGatewayClient {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  listModels(): Promise<ModelDefinition[]>;
  getModel(modelId: string): ModelDefinition | undefined;
}

// Zod schemas for validation
export const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.union([
    z.string(),
    z.array(
      z.union([
        z.object({ type: z.literal('text'), text: z.string() }),
        z.object({
          type: z.literal('image'),
          source: z.object({
            type: z.enum(['base64', 'url']),
            mediaType: z.string().optional(),
            data: z.string().optional(),
            url: z.string().optional(),
          }),
        }),
      ])
    ),
  ]),
  name: z.string().optional(),
  toolCallId: z.string().optional(),
});

export const CompletionRequestSchema = z.object({
  messages: z.array(MessageSchema),
  model: z.string().optional(),
  config: z
    .object({
      provider: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().positive().optional(),
      topP: z.number().min(0).max(1).optional(),
      stop: z.array(z.string()).optional(),
      thinking: z.boolean().optional(),
      thinkingBudget: z.number().positive().optional(),
    })
    .optional(),
  stream: z.boolean().optional(),
});
