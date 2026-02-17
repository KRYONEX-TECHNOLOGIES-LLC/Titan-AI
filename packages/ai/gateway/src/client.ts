/**
 * Titan AI Gateway - Main Client
 * Unified interface for all LLM providers
 */

import type {
  GatewayConfig,
  IGatewayClient,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  StreamChunk,
  ModelDefinition,
  Provider,
} from './types.js';
import { LiteLLMAdapter } from './litellm-adapter.js';
import { OpenRouterAdapter } from './openrouter-adapter.js';
import { OllamaAdapter } from './ollama-adapter.js';
import { MODEL_REGISTRY } from './model-registry.js';

export class GatewayClient implements IGatewayClient {
  private config: GatewayConfig;
  private litellm: LiteLLMAdapter;
  private openrouter: OpenRouterAdapter;
  private ollama: OllamaAdapter;

  constructor(config: GatewayConfig) {
    this.config = {
      timeout: 60000,
      maxRetries: 3,
      retryDelay: 1000,
      ...config,
    };

    this.litellm = new LiteLLMAdapter({
      apiKeys: config.apiKeys,
      baseUrls: config.baseUrls,
      timeout: this.config.timeout,
    });

    this.openrouter = new OpenRouterAdapter({
      apiKey: config.apiKeys.openrouter,
      timeout: this.config.timeout,
    });

    this.ollama = new OllamaAdapter({
      baseUrl: config.baseUrls?.ollama ?? 'http://localhost:11434',
      timeout: this.config.timeout,
    });
  }

  /**
   * Send a completion request to the appropriate provider
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model ?? this.config.defaultModel;
    const modelDef = this.getModel(model);
    const provider = request.config?.provider ?? modelDef?.provider ?? this.config.defaultProvider;

    const startTime = Date.now();

    try {
      const response = await this.routeRequest(provider, request, model);
      response.latencyMs = Date.now() - startTime;
      return response;
    } catch (error) {
      // Attempt fallback on failure
      if (this.config.maxRetries && this.config.maxRetries > 0) {
        return this.handleRetry(request, model, error as Error);
      }
      throw error;
    }
  }

  /**
   * Stream a completion response
   */
  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const model = request.model ?? this.config.defaultModel;
    const modelDef = this.getModel(model);
    const provider = request.config?.provider ?? modelDef?.provider ?? this.config.defaultProvider;

    const adapter = this.getAdapter(provider);
    yield* adapter.stream({ ...request, model, stream: true });
  }

  /**
   * Generate embeddings
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    // Use OpenAI for embeddings by default
    const model = request.model ?? 'text-embedding-3-small';

    if (model.startsWith('voyage-')) {
      // Voyage AI embeddings
      return this.litellm.embed({ ...request, model });
    }

    // Default to OpenAI
    return this.litellm.embed({ ...request, model });
  }

  /**
   * List all available models
   */
  async listModels(): Promise<ModelDefinition[]> {
    return MODEL_REGISTRY;
  }

  /**
   * Get a specific model definition
   */
  getModel(modelId: string): ModelDefinition | undefined {
    return MODEL_REGISTRY.find(m => m.id === modelId);
  }

  /**
   * Route request to appropriate adapter
   */
  private async routeRequest(
    provider: Provider,
    request: CompletionRequest,
    model: string
  ): Promise<CompletionResponse> {
    const adapter = this.getAdapter(provider);
    return adapter.complete({ ...request, model });
  }

  /**
   * Get the appropriate adapter for a provider
   */
  private getAdapter(provider: Provider): LiteLLMAdapter | OpenRouterAdapter | OllamaAdapter {
    switch (provider) {
      case 'ollama':
        return this.ollama;
      case 'openrouter':
        return this.openrouter;
      default:
        return this.litellm;
    }
  }

  /**
   * Handle retry logic with exponential backoff
   */
  private async handleRetry(
    request: CompletionRequest,
    model: string,
    error: Error,
    attempt = 1
  ): Promise<CompletionResponse> {
    if (attempt >= (this.config.maxRetries ?? 3)) {
      throw error;
    }

    const delay = (this.config.retryDelay ?? 1000) * Math.pow(2, attempt - 1);
    await new Promise(resolve => setTimeout(resolve, delay));

    // Try fallback model if available
    const modelDef = this.getModel(model);
    if (modelDef) {
      const fallbackModel = this.getFallbackModel(modelDef);
      if (fallbackModel) {
        console.warn(
          `[Gateway] Retrying with fallback model: ${fallbackModel.id} (attempt ${attempt + 1})`
        );
        return this.complete({
          ...request,
          model: fallbackModel.id,
          config: { ...request.config, provider: fallbackModel.provider },
        });
      }
    }

    // Retry with same model
    return this.complete(request);
  }

  /**
   * Get fallback model for a given model
   */
  private getFallbackModel(model: ModelDefinition): ModelDefinition | undefined {
    // Find a model from a different provider with similar capabilities
    return MODEL_REGISTRY.find(
      m =>
        m.id !== model.id &&
        m.provider !== model.provider &&
        m.tier === model.tier &&
        m.supportsTools === model.supportsTools
    );
  }
}

/**
 * Create a gateway client with default configuration
 */
export function createGatewayClient(config: Partial<GatewayConfig> = {}): GatewayClient {
  return new GatewayClient({
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    apiKeys: {},
    ...config,
  });
}
