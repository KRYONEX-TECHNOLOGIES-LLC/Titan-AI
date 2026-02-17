/**
 * Titan AI Gateway - OpenRouter Adapter
 * Access 500+ models through a single API
 */

import ky from 'ky';
import type {
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
} from './types.js';
import { parseSSE } from './streaming.js';

export interface OpenRouterConfig {
  apiKey?: string;
  timeout?: number;
  siteUrl?: string;
  siteName?: string;
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterAdapter {
  private config: OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    this.config = {
      timeout: 60000,
      siteName: 'Titan AI',
      ...config,
    };
  }

  /**
   * Send a completion request via OpenRouter
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();

    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
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
      .post(`${OPENROUTER_BASE_URL}/chat/completions`, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': this.config.siteUrl ?? 'https://titan-ai.dev',
          'X-Title': this.config.siteName ?? 'Titan AI',
          'Content-Type': 'application/json',
        },
        json: body,
        timeout: this.config.timeout,
      })
      .json<{
        id: string;
        model: string;
        choices: Array<{
          message: {
            content: string;
            tool_calls?: Array<{
              id: string;
              type: string;
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason: string;
        }>;
        usage: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      }>();

    const choice = response.choices[0];

    return {
      id: response.id,
      model: response.model,
      provider: 'openrouter',
      content: choice?.message.content ?? '',
      toolCalls: choice?.message.tool_calls?.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: tc.function,
      })),
      finishReason: this.mapFinishReason(choice?.finish_reason ?? 'stop'),
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Stream a completion response
   */
  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: request.config?.maxTokens,
      temperature: request.config?.temperature,
      stream: true,
    };

    Object.keys(body).forEach(key => {
      if (body[key] === undefined) delete body[key];
    });

    const response = await ky.post(`${OPENROUTER_BASE_URL}/chat/completions`, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'HTTP-Referer': this.config.siteUrl ?? 'https://titan-ai.dev',
        'X-Title': this.config.siteName ?? 'Titan AI',
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
            ? this.mapFinishReason(choice.finish_reason)
            : undefined,
        };
      }
    }
  }

  /**
   * List available models on OpenRouter
   */
  async listModels(): Promise<
    Array<{
      id: string;
      name: string;
      contextLength: number;
      pricing: { prompt: number; completion: number };
    }>
  > {
    const response = await ky
      .get(`${OPENROUTER_BASE_URL}/models`, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        timeout: this.config.timeout,
      })
      .json<{
        data: Array<{
          id: string;
          name: string;
          context_length: number;
          pricing: { prompt: string; completion: string };
        }>;
      }>();

    return response.data.map(m => ({
      id: m.id,
      name: m.name,
      contextLength: m.context_length,
      pricing: {
        prompt: parseFloat(m.pricing.prompt) * 1000000,
        completion: parseFloat(m.pricing.completion) * 1000000,
      },
    }));
  }

  /**
   * Get current credit balance
   */
  async getCredits(): Promise<{ credits: number; usage: number }> {
    const response = await ky
      .get('https://openrouter.ai/api/v1/auth/key', {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        timeout: this.config.timeout,
      })
      .json<{
        data: {
          limit: number;
          usage: number;
        };
      }>();

    return {
      credits: response.data.limit - response.data.usage,
      usage: response.data.usage,
    };
  }

  /**
   * Map finish reason to standard format
   */
  private mapFinishReason(reason: string): CompletionResponse['finishReason'] {
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
