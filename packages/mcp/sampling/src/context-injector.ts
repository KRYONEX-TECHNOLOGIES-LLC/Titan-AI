// MCP Context Injector
// packages/mcp/sampling/src/context-injector.ts

import {
  SamplingRequest,
  SamplingMessage,
  ContextInclusion,
  ResourceContent,
} from './types';

export interface ContextSource {
  id: string;
  name: string;
  type: 'server' | 'file' | 'memory' | 'custom';
  getData(): Promise<ContextData[]>;
}

export interface ContextData {
  uri: string;
  name: string;
  content: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface InjectionConfig {
  maxContextTokens: number;
  priorityOrder: string[]; // Source IDs in priority order
  includeMetadata: boolean;
  truncationStrategy: 'head' | 'tail' | 'middle';
}

export class ContextInjector {
  private sources: Map<string, ContextSource> = new Map();
  private config: InjectionConfig;
  private tokenEstimator: (text: string) => number;

  constructor(
    config: Partial<InjectionConfig> = {},
    tokenEstimator?: (text: string) => number
  ) {
    this.config = {
      maxContextTokens: 8000,
      priorityOrder: [],
      includeMetadata: true,
      truncationStrategy: 'tail',
      ...config,
    };
    this.tokenEstimator = tokenEstimator || this.defaultTokenEstimator;
  }

  registerSource(source: ContextSource): void {
    this.sources.set(source.id, source);
  }

  unregisterSource(sourceId: string): void {
    this.sources.delete(sourceId);
  }

  async injectContext(
    request: SamplingRequest,
    inclusion: ContextInclusion
  ): Promise<SamplingRequest> {
    if (inclusion === 'none') {
      return request;
    }

    const contextData = await this.gatherContext(inclusion);
    if (contextData.length === 0) {
      return request;
    }

    const contextMessages = this.formatContextMessages(contextData);
    const trimmedMessages = this.trimToTokenLimit(contextMessages);

    return {
      ...request,
      messages: [...trimmedMessages, ...request.messages],
    };
  }

  private async gatherContext(inclusion: ContextInclusion): Promise<ContextData[]> {
    const allData: ContextData[] = [];
    const sourceIds = inclusion === 'thisServer'
      ? this.config.priorityOrder.slice(0, 1) // Only first source
      : this.config.priorityOrder.length > 0
        ? this.config.priorityOrder
        : Array.from(this.sources.keys());

    for (const sourceId of sourceIds) {
      const source = this.sources.get(sourceId);
      if (source) {
        try {
          const data = await source.getData();
          allData.push(...data);
        } catch (error) {
          console.error(`Failed to get context from ${sourceId}:`, error);
        }
      }
    }

    return allData;
  }

  private formatContextMessages(data: ContextData[]): SamplingMessage[] {
    const messages: SamplingMessage[] = [];

    for (const item of data) {
      const content: ResourceContent = {
        type: 'resource',
        resource: {
          uri: item.uri,
          mimeType: item.mimeType,
          text: item.content,
        },
      };

      if (this.config.includeMetadata && item.metadata) {
        // Include metadata as a prefix
        const metadataStr = Object.entries(item.metadata)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        
        messages.push({
          role: 'user',
          content: {
            type: 'text',
            text: `[Context from ${item.name}] ${metadataStr}\n${item.content}`,
          },
        });
      } else {
        messages.push({
          role: 'user',
          content: {
            type: 'text',
            text: `[Context from ${item.name}]\n${item.content}`,
          },
        });
      }
    }

    return messages;
  }

  private trimToTokenLimit(messages: SamplingMessage[]): SamplingMessage[] {
    let totalTokens = 0;
    const result: SamplingMessage[] = [];

    for (const message of messages) {
      const text = message.content.type === 'text' ? message.content.text : '';
      const tokens = this.tokenEstimator(text);

      if (totalTokens + tokens <= this.config.maxContextTokens) {
        result.push(message);
        totalTokens += tokens;
      } else {
        // Need to truncate
        const remainingTokens = this.config.maxContextTokens - totalTokens;
        if (remainingTokens > 100) { // Only add if meaningful
          const truncatedText = this.truncateText(text, remainingTokens);
          result.push({
            ...message,
            content: {
              type: 'text',
              text: truncatedText + '\n[...truncated...]',
            },
          });
        }
        break;
      }
    }

    return result;
  }

  private truncateText(text: string, maxTokens: number): string {
    // Rough estimate: 1 token ≈ 4 characters
    const maxChars = maxTokens * 4;

    switch (this.config.truncationStrategy) {
      case 'head':
        return text.slice(-maxChars);
      case 'middle':
        const halfChars = Math.floor(maxChars / 2);
        return text.slice(0, halfChars) + '\n...\n' + text.slice(-halfChars);
      case 'tail':
      default:
        return text.slice(0, maxChars);
    }
  }

  private defaultTokenEstimator(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  setTokenEstimator(estimator: (text: string) => number): void {
    this.tokenEstimator = estimator;
  }

  updateConfig(config: Partial<InjectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): InjectionConfig {
    return { ...this.config };
  }

  getSources(): ContextSource[] {
    return Array.from(this.sources.values());
  }
}

// Built-in context sources
export class FileContextSource implements ContextSource {
  readonly id: string;
  readonly name: string;
  readonly type = 'file' as const;
  private files: Map<string, string> = new Map();

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  addFile(uri: string, content: string): void {
    this.files.set(uri, content);
  }

  removeFile(uri: string): void {
    this.files.delete(uri);
  }

  clearFiles(): void {
    this.files.clear();
  }

  async getData(): Promise<ContextData[]> {
    return Array.from(this.files.entries()).map(([uri, content]) => ({
      uri,
      name: uri.split('/').pop() || uri,
      content,
      mimeType: this.guessMimeType(uri),
    }));
  }

  private guessMimeType(uri: string): string {
    const ext = uri.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      ts: 'text/typescript',
      tsx: 'text/typescript',
      js: 'text/javascript',
      jsx: 'text/javascript',
      json: 'application/json',
      md: 'text/markdown',
      py: 'text/x-python',
      rs: 'text/x-rust',
      go: 'text/x-go',
    };
    return mimeTypes[ext || ''] || 'text/plain';
  }
}

export class MemoryContextSource implements ContextSource {
  readonly id: string;
  readonly name: string;
  readonly type = 'memory' as const;
  private memory: ContextData[] = [];

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  addMemory(data: Omit<ContextData, 'uri'>): void {
    this.memory.push({
      ...data,
      uri: `memory://${this.id}/${Date.now()}`,
    });
  }

  clearMemory(): void {
    this.memory = [];
  }

  async getData(): Promise<ContextData[]> {
    return [...this.memory];
  }
}
