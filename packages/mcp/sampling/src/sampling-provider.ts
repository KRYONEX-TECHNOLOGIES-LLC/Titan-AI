// MCP Sampling Provider
// packages/mcp/sampling/src/sampling-provider.ts

import { EventEmitter } from 'events';
import {
  SamplingRequest,
  SamplingResponse,
  SamplingProvider,
  ModelPreferences,
  SamplingContent,
  TextContent,
} from './types';

export interface SamplingProviderConfig {
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  retryAttempts: number;
}

export class DefaultSamplingProvider extends EventEmitter implements SamplingProvider {
  private config: SamplingProviderConfig;
  private modelHandler: ModelHandler | null = null;
  private requestQueue: Map<string, QueuedRequest> = new Map();

  constructor(config: Partial<SamplingProviderConfig> = {}) {
    super();
    this.config = {
      defaultModel: 'claude-4.6-sonnet',
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 60000,
      retryAttempts: 2,
      ...config,
    };
  }

  setModelHandler(handler: ModelHandler): void {
    this.modelHandler = handler;
  }

  async handleSamplingRequest(request: SamplingRequest): Promise<SamplingResponse> {
    this.emit('request:start', { requestId: request.id });

    const queuedRequest: QueuedRequest = {
      request,
      attempts: 0,
      startTime: Date.now(),
    };
    this.requestQueue.set(request.id, queuedRequest);

    try {
      const response = await this.executeWithRetry(queuedRequest);
      this.emit('request:complete', { requestId: request.id, response });
      return response;
    } catch (error) {
      this.emit('request:error', { requestId: request.id, error });
      throw error;
    } finally {
      this.requestQueue.delete(request.id);
    }
  }

  private async executeWithRetry(queuedRequest: QueuedRequest): Promise<SamplingResponse> {
    const { request } = queuedRequest;
    let lastError: Error | null = null;

    while (queuedRequest.attempts < this.config.retryAttempts) {
      queuedRequest.attempts++;

      try {
        const model = this.selectModel(request.modelPreferences);
        const response = await this.callModel(request, model);
        return response;
      } catch (error) {
        lastError = error as Error;
        this.emit('request:retry', {
          requestId: request.id,
          attempt: queuedRequest.attempts,
          error: lastError,
        });

        // Exponential backoff
        await this.delay(Math.pow(2, queuedRequest.attempts) * 1000);
      }
    }

    throw lastError || new Error('Max retry attempts exceeded');
  }

  private selectModel(preferences?: ModelPreferences): string {
    if (!preferences?.hints?.length) {
      return this.config.defaultModel;
    }

    // Use the first hint that specifies a name
    const hintWithName = preferences.hints.find(h => h.name);
    if (hintWithName?.name) {
      return hintWithName.name;
    }

    // Select based on priorities
    if (preferences.costPriority !== undefined && preferences.costPriority < 0.3) {
      return 'deepseek-v3'; // Cheaper model
    }

    if (preferences.speedPriority !== undefined && preferences.speedPriority > 0.7) {
      return 'claude-3.5-sonnet'; // Faster model
    }

    if (preferences.intelligencePriority !== undefined && preferences.intelligencePriority > 0.8) {
      return 'claude-4.6-opus'; // Most capable model
    }

    return this.config.defaultModel;
  }

  private async callModel(request: SamplingRequest, model: string): Promise<SamplingResponse> {
    if (!this.modelHandler) {
      // Fallback mock response if no handler set
      return this.createMockResponse(request, model);
    }

    const response = await this.modelHandler.complete({
      model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: this.extractTextContent(m.content),
      })),
      systemPrompt: request.systemPrompt,
      maxTokens: request.maxTokens || this.config.maxTokens,
      temperature: request.temperature ?? this.config.temperature,
      stopSequences: request.stopSequences,
    });

    return {
      id: this.generateId(),
      requestId: request.id,
      model,
      stopReason: response.stopReason || 'endTurn',
      content: {
        type: 'text',
        text: response.text,
      },
      usage: response.usage,
      metadata: {
        latency: Date.now() - (this.requestQueue.get(request.id)?.startTime || Date.now()),
      },
    };
  }

  private extractTextContent(content: SamplingContent): string {
    if (content.type === 'text') {
      return content.text;
    }
    if (content.type === 'resource' && content.resource.text) {
      return content.resource.text;
    }
    return '';
  }

  private createMockResponse(request: SamplingRequest, model: string): SamplingResponse {
    return {
      id: this.generateId(),
      requestId: request.id,
      model,
      stopReason: 'endTurn',
      content: {
        type: 'text',
        text: `[Mock response for request ${request.id}]`,
      },
      usage: {
        inputTokens: 100,
        outputTokens: 50,
      },
    };
  }

  cancelRequest(requestId: string): boolean {
    const queued = this.requestQueue.get(requestId);
    if (queued) {
      this.requestQueue.delete(requestId);
      this.emit('request:cancel', { requestId });
      return true;
    }
    return false;
  }

  getQueueStatus(): QueueStatus {
    const requests = Array.from(this.requestQueue.values());
    return {
      total: requests.length,
      pending: requests.filter(r => r.attempts === 0).length,
      retrying: requests.filter(r => r.attempts > 0).length,
      averageWaitTime: requests.length > 0
        ? requests.reduce((sum, r) => sum + (Date.now() - r.startTime), 0) / requests.length
        : 0,
    };
  }

  private generateId(): string {
    return `sample-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

interface QueuedRequest {
  request: SamplingRequest;
  attempts: number;
  startTime: number;
}

interface QueueStatus {
  total: number;
  pending: number;
  retrying: number;
  averageWaitTime: number;
}

export interface ModelHandler {
  complete(params: {
    model: string;
    messages: { role: string; content: string }[];
    systemPrompt?: string;
    maxTokens: number;
    temperature: number;
    stopSequences?: string[];
  }): Promise<{
    text: string;
    stopReason?: 'endTurn' | 'stopSequence' | 'maxTokens';
    usage?: { inputTokens: number; outputTokens: number };
  }>;
}
