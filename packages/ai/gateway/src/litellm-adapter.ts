/**
 * Titan AI Gateway - LiteLLM Adapter
 * Universal adapter for all major LLM providers via LiteLLM-compatible API
 */

import ky from 'ky';
import type {
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  StreamChunk,
  Provider,
  Message,
  ToolDefinition,
} from './types.js';
import { parseSSE } from './streaming.js';

export interface LiteLLMConfig {
  apiKeys: Partial<Record<Provider, string>>;
  baseUrls?: Partial<Record<Provider, string>>;
  timeout?: number;
}

const DEFAULT_BASE_URLS: Record<Provider, string> = {
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  minimax: 'https://api.minimax.chat/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1',
  groq: 'https://api.groq.com/openai/v1',
  together: 'https://api.together.xyz/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  mistral: 'https://api.mistral.ai/v1',
  cohere: 'https://api.cohere.ai/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  azure: '', // Configured per deployment
};

export class LiteLLMAdapter {
  private config: LiteLLMConfig;

  constructor(config: LiteLLMConfig) {
    this.config = {
      timeout: 60000,
      ...config,
    };
  }

  /**
   * Send a completion request
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const provider = this.getProviderFromModel(request.model ?? '');
    const baseUrl = this.getBaseUrl(provider);
    const apiKey = this.getApiKey(provider);

    const startTime = Date.now();

    if (provider === 'anthropic') {
      return this.completeAnthropic(request, baseUrl, apiKey, startTime);
    }

    // OpenAI-compatible endpoint
    return this.completeOpenAI(request, baseUrl, apiKey, provider, startTime);
  }

  /**
   * Stream a completion response
   */
  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const provider = this.getProviderFromModel(request.model ?? '');
    const baseUrl = this.getBaseUrl(provider);
    const apiKey = this.getApiKey(provider);

    if (provider === 'anthropic') {
      yield* this.streamAnthropic(request, baseUrl, apiKey);
    } else {
      yield* this.streamOpenAI(request, baseUrl, apiKey);
    }
  }

  /**
   * Generate embeddings
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const provider = this.getProviderFromModel(request.model ?? 'text-embedding-3-small');
    const baseUrl = this.getBaseUrl(provider);
    const apiKey = this.getApiKey(provider);

    const input = Array.isArray(request.input) ? request.input : [request.input];

    const response = await ky
      .post(`${baseUrl}/embeddings`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        json: {
          model: request.model ?? 'text-embedding-3-small',
          input,
          dimensions: request.dimensions,
        },
        timeout: this.config.timeout,
      })
      .json<{
        data: Array<{ embedding: number[]; index: number }>;
        model: string;
        usage: { prompt_tokens: number; total_tokens: number };
      }>();

    return {
      embeddings: response.data.sort((a, b) => a.index - b.index).map(d => d.embedding),
      model: response.model,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        totalTokens: response.usage.total_tokens,
      },
    };
  }

  /**
   * Anthropic-specific completion
   */
  private async completeAnthropic(
    request: CompletionRequest,
    baseUrl: string,
    apiKey: string,
    startTime: number
  ): Promise<CompletionResponse> {
    const systemMessage = request.messages.find(m => m.role === 'system');
    const otherMessages = request.messages.filter(m => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.config?.maxTokens ?? 8192,
      messages: otherMessages.map(this.formatAnthropicMessage),
    };

    if (systemMessage) {
      body.system = typeof systemMessage.content === 'string' 
        ? systemMessage.content 
        : systemMessage.content.map(c => c.type === 'text' ? c.text : '').join('');
    }

    if (request.config?.temperature !== undefined) {
      body.temperature = request.config.temperature;
    }

    if (request.config?.thinking || request.config?.effort) {
      // Map effort levels to token budgets
      const effortToBudget: Record<string, number> = {
        low: 5000,
        medium: 25000,
        high: 100000,
        max: 128000,
      };

      const budget = request.config?.effort
        ? effortToBudget[request.config.effort] ?? 10000
        : request.config?.thinkingBudget ?? 10000;

      body.thinking = {
        type: 'enabled',
        budget_tokens: budget,
      };
    }

    if (request.tools?.length) {
      body.tools = request.tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    const response = await ky
      .post(`${baseUrl}/messages`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        json: body,
        timeout: this.config.timeout,
      })
      .json<{
        id: string;
        model: string;
        content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
        stop_reason: string;
        usage: { input_tokens: number; output_tokens: number; thinking_tokens?: number };
        thinking?: string;
      }>();

    const textContent = response.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    const toolCalls = response.content
      .filter(c => c.type === 'tool_use')
      .map(c => ({
        id: c.id!,
        type: 'function' as const,
        function: {
          name: c.name!,
          arguments: JSON.stringify(c.input),
        },
      }));

    return {
      id: response.id,
      model: response.model,
      provider: 'anthropic',
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: this.mapAnthropicStopReason(response.stop_reason),
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        thinkingTokens: response.usage.thinking_tokens,
      },
      thinking: response.thinking,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * OpenAI-compatible completion
   */
  private async completeOpenAI(
    request: CompletionRequest,
    baseUrl: string,
    apiKey: string,
    provider: Provider,
    startTime: number
  ): Promise<CompletionResponse> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map(this.formatOpenAIMessage),
      max_tokens: request.config?.maxTokens,
      temperature: request.config?.temperature,
      top_p: request.config?.topP,
      frequency_penalty: request.config?.frequencyPenalty,
      presence_penalty: request.config?.presencePenalty,
      stop: request.config?.stop,
    };

    if (request.tools?.length) {
      body.tools = request.tools;
      body.tool_choice = request.toolChoice ?? 'auto';
    }

    // Remove undefined values
    Object.keys(body).forEach(key => {
      if (body[key] === undefined) {
        delete body[key];
      }
    });

    const response = await ky
      .post(`${baseUrl}/chat/completions`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        json: body,
        timeout: this.config.timeout,
      })
      .json<{
        id: string;
        model: string;
        choices: Array<{
          message: { content: string; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> };
          finish_reason: string;
        }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      }>();

    const choice = response.choices[0];

    return {
      id: response.id,
      model: response.model,
      provider,
      content: choice?.message.content ?? '',
      toolCalls: choice?.message.tool_calls?.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: tc.function,
      })),
      finishReason: this.mapOpenAIFinishReason(choice?.finish_reason ?? 'stop'),
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Stream Anthropic response
   */
  private async *streamAnthropic(
    request: CompletionRequest,
    baseUrl: string,
    apiKey: string
  ): AsyncIterable<StreamChunk> {
    const systemMessage = request.messages.find(m => m.role === 'system');
    const otherMessages = request.messages.filter(m => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.config?.maxTokens ?? 8192,
      messages: otherMessages.map(this.formatAnthropicMessage),
      stream: true,
    };

    if (systemMessage) {
      body.system = typeof systemMessage.content === 'string'
        ? systemMessage.content
        : systemMessage.content.map(c => c.type === 'text' ? c.text : '').join('');
    }

    const response = await ky.post(`${baseUrl}/messages`, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      json: body,
      timeout: this.config.timeout,
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    let messageId = '';
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const event = JSON.parse(data);
            if (event.type === 'message_start') {
              messageId = event.message.id;
            } else if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                yield {
                  id: messageId,
                  delta: { content: event.delta.text },
                };
              }
            } else if (event.type === 'message_stop') {
              yield {
                id: messageId,
                delta: {},
                finishReason: 'stop',
              };
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  /**
   * Stream OpenAI-compatible response
   */
  private async *streamOpenAI(
    request: CompletionRequest,
    baseUrl: string,
    apiKey: string
  ): AsyncIterable<StreamChunk> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map(this.formatOpenAIMessage),
      max_tokens: request.config?.maxTokens,
      temperature: request.config?.temperature,
      stream: true,
    };

    Object.keys(body).forEach(key => {
      if (body[key] === undefined) delete body[key];
    });

    const response = await ky.post(`${baseUrl}/chat/completions`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      json: body,
      timeout: this.config.timeout,
    });

    for await (const chunk of parseSSE(response)) {
      if (chunk.choices?.[0]) {
        const choice = chunk.choices[0];
        yield {
          id: chunk.id,
          delta: {
            content: choice.delta?.content,
          },
          finishReason: choice.finish_reason
            ? this.mapOpenAIFinishReason(choice.finish_reason)
            : undefined,
        };
      }
    }
  }

  /**
   * Format message for Anthropic API
   */
  private formatAnthropicMessage(message: Message) {
    return {
      role: message.role === 'tool' ? 'user' : message.role,
      content:
        typeof message.content === 'string'
          ? message.content
          : message.content.map(c => {
              if (c.type === 'text') return { type: 'text', text: c.text };
              if (c.type === 'image') {
                return {
                  type: 'image',
                  source: c.source,
                };
              }
              return c;
            }),
    };
  }

  /**
   * Format message for OpenAI API
   */
  private formatOpenAIMessage(message: Message) {
    return {
      role: message.role,
      content: message.content,
      name: message.name,
      tool_call_id: message.toolCallId,
    };
  }

  /**
   * Get provider from model name
   */
  private getProviderFromModel(model: string): Provider {
    if (model.startsWith('claude')) return 'anthropic';
    if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
    if (model.startsWith('deepseek')) return 'deepseek';
    if (model.startsWith('gemini')) return 'google';
    if (model.startsWith('mistral') || model.startsWith('codestral')) return 'mistral';
    if (model.includes('llama') || model.includes('qwen') || model.includes('starcoder')) return 'ollama';
    return 'openai'; // Default fallback
  }

  /**
   * Get base URL for provider
   */
  private getBaseUrl(provider: Provider): string {
    return this.config.baseUrls?.[provider] ?? DEFAULT_BASE_URLS[provider];
  }

  /**
   * Get API key for provider
   */
  private getApiKey(provider: Provider): string {
    const key = this.config.apiKeys[provider];
    if (!key && provider !== 'ollama') {
      throw new Error(`No API key configured for provider: ${provider}`);
    }
    return key ?? '';
  }

  /**
   * Map Anthropic stop reason to our format
   */
  private mapAnthropicStopReason(reason: string): CompletionResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }

  /**
   * Map OpenAI finish reason to our format
   */
  private mapOpenAIFinishReason(reason: string): CompletionResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
      case 'function_call':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
