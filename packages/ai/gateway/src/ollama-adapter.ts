/**
 * Titan AI Gateway - Ollama Adapter
 * Local model inference via Ollama
 */

import ky from 'ky';
import type {
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  StreamChunk,
} from './types.js';

export interface OllamaConfig {
  baseUrl?: string;
  timeout?: number;
}

export class OllamaAdapter {
  private baseUrl: string;
  private timeout: number;

  constructor(config: OllamaConfig = {}) {
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
    this.timeout = config.timeout ?? 120000; // Local inference can be slow
  }

  /**
   * Send a completion request to Ollama
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();

    // Convert to Ollama format
    const messages = request.messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : 
        m.content.map(c => c.type === 'text' ? c.text : '').join(''),
    }));

    const response = await ky
      .post(`${this.baseUrl}/api/chat`, {
        json: {
          model: request.model,
          messages,
          stream: false,
          options: {
            temperature: request.config?.temperature,
            top_p: request.config?.topP,
            top_k: request.config?.topK,
            num_predict: request.config?.maxTokens,
            stop: request.config?.stop,
          },
        },
        timeout: this.timeout,
      })
      .json<{
        model: string;
        message: { role: string; content: string };
        done: boolean;
        total_duration: number;
        prompt_eval_count: number;
        eval_count: number;
      }>();

    return {
      id: `ollama-${Date.now()}`,
      model: response.model,
      provider: 'ollama',
      content: response.message.content,
      finishReason: 'stop',
      usage: {
        promptTokens: response.prompt_eval_count ?? 0,
        completionTokens: response.eval_count ?? 0,
        totalTokens: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
      },
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Stream a completion response from Ollama
   */
  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const messages = request.messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content :
        m.content.map(c => c.type === 'text' ? c.text : '').join(''),
    }));

    const response = await ky.post(`${this.baseUrl}/api/chat`, {
      json: {
        model: request.model,
        messages,
        stream: true,
        options: {
          temperature: request.config?.temperature,
          top_p: request.config?.topP,
          num_predict: request.config?.maxTokens,
        },
      },
      timeout: this.timeout,
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    const id = `ollama-${Date.now()}`;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const chunk = JSON.parse(line) as {
            message?: { content: string };
            done: boolean;
          };

          if (chunk.message?.content) {
            yield {
              id,
              delta: { content: chunk.message.content },
            };
          }

          if (chunk.done) {
            yield {
              id,
              delta: {},
              finishReason: 'stop',
            };
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    }
  }

  /**
   * Generate embeddings using Ollama
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    const model = request.model ?? 'nomic-embed-text';

    const embeddings: number[][] = [];

    for (const input of inputs) {
      const response = await ky
        .post(`${this.baseUrl}/api/embeddings`, {
          json: {
            model,
            prompt: input,
          },
          timeout: this.timeout,
        })
        .json<{ embedding: number[] }>();

      embeddings.push(response.embedding);
    }

    return {
      embeddings,
      model,
      usage: {
        promptTokens: 0, // Ollama doesn't report token usage for embeddings
        totalTokens: 0,
      },
    };
  }

  /**
   * List available models in Ollama
   */
  async listModels(): Promise<
    Array<{
      name: string;
      size: number;
      digest: string;
      modifiedAt: string;
    }>
  > {
    const response = await ky
      .get(`${this.baseUrl}/api/tags`, {
        timeout: this.timeout,
      })
      .json<{
        models: Array<{
          name: string;
          size: number;
          digest: string;
          modified_at: string;
        }>;
      }>();

    return response.models.map(m => ({
      name: m.name,
      size: m.size,
      digest: m.digest,
      modifiedAt: m.modified_at,
    }));
  }

  /**
   * Pull a model from Ollama library
   */
  async pullModel(name: string): Promise<void> {
    await ky.post(`${this.baseUrl}/api/pull`, {
      json: { name, stream: false },
      timeout: 600000, // 10 minutes for large models
    });
  }

  /**
   * Check if Ollama is running
   */
  async isRunning(): Promise<boolean> {
    try {
      await ky.get(`${this.baseUrl}/api/tags`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get model info
   */
  async getModelInfo(name: string): Promise<{
    modelfile: string;
    parameters: string;
    template: string;
  }> {
    const response = await ky
      .post(`${this.baseUrl}/api/show`, {
        json: { name },
        timeout: this.timeout,
      })
      .json<{
        modelfile: string;
        parameters: string;
        template: string;
      }>();

    return response;
  }
}
