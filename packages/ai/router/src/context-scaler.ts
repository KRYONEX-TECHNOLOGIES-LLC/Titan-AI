/**
 * Titan AI Router - Context Scaler
 * Intelligent context window management and scaling
 */

import type { Message, ModelDefinition } from '@titan/ai-gateway';
import type { ContextScalingResult } from './types.js';

export interface ContextScalerConfig {
  reserveOutputTokens: number;
  maxChunkSize: number;
  overlapTokens: number;
}

export class ContextScaler {
  private config: ContextScalerConfig;

  constructor(config: Partial<ContextScalerConfig> = {}) {
    this.config = {
      reserveOutputTokens: 8192,
      maxChunkSize: 4000,
      overlapTokens: 200,
      ...config,
    };
  }

  /**
   * Scale messages to fit within model's context window
   */
  scaleToFit(
    messages: Message[],
    model: ModelDefinition
  ): { messages: Message[]; result: ContextScalingResult } {
    const availableTokens = model.contextWindow - this.config.reserveOutputTokens;
    const totalTokens = this.estimateTokens(messages);

    // Check if already fits
    if (totalTokens <= availableTokens) {
      return {
        messages,
        result: {
          originalTokens: totalTokens,
          scaledTokens: totalTokens,
          truncated: false,
          strategy: 'none',
          fitsInContext: true,
        },
      };
    }

    // Try different strategies
    const strategies: Array<{
      name: ContextScalingResult['strategy'];
      apply: () => Message[];
    }> = [
      { name: 'tail', apply: () => this.truncateTail(messages, availableTokens) },
      { name: 'middle', apply: () => this.truncateMiddle(messages, availableTokens) },
    ];

    for (const strategy of strategies) {
      const scaled = strategy.apply();
      const scaledTokens = this.estimateTokens(scaled);

      if (scaledTokens <= availableTokens) {
        return {
          messages: scaled,
          result: {
            originalTokens: totalTokens,
            scaledTokens,
            truncated: true,
            strategy: strategy.name,
            fitsInContext: true,
          },
        };
      }
    }

    // Last resort: aggressive truncation
    const aggressive = this.aggressiveTruncate(messages, availableTokens);
    return {
      messages: aggressive,
      result: {
        originalTokens: totalTokens,
        scaledTokens: this.estimateTokens(aggressive),
        truncated: true,
        strategy: 'tail',
        fitsInContext: true,
      },
    };
  }

  /**
   * Truncate from the tail (oldest messages first)
   */
  private truncateTail(messages: Message[], maxTokens: number): Message[] {
    const result: Message[] = [];
    let tokens = 0;

    // Always keep system message
    const systemMsg = messages.find(m => m.role === 'system');
    if (systemMsg) {
      result.push(systemMsg);
      tokens += this.estimateMessageTokens(systemMsg);
    }

    // Add messages from the end
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const msg = nonSystemMessages[i];
      const msgTokens = this.estimateMessageTokens(msg);

      if (tokens + msgTokens <= maxTokens) {
        result.unshift(msg);
        tokens += msgTokens;
      } else {
        break;
      }
    }

    // Ensure system message is first
    if (systemMsg && result[0] !== systemMsg) {
      const idx = result.indexOf(systemMsg);
      if (idx > 0) {
        result.splice(idx, 1);
        result.unshift(systemMsg);
      }
    }

    return result;
  }

  /**
   * Truncate from the middle (keep first and last)
   */
  private truncateMiddle(messages: Message[], maxTokens: number): Message[] {
    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    let tokens = systemMsg ? this.estimateMessageTokens(systemMsg) : 0;
    const result: Message[] = systemMsg ? [systemMsg] : [];

    if (nonSystemMessages.length === 0) {
      return result;
    }

    // Always keep first and last non-system messages
    const first = nonSystemMessages[0];
    const last = nonSystemMessages[nonSystemMessages.length - 1];

    if (first) {
      result.push(first);
      tokens += this.estimateMessageTokens(first);
    }

    if (last && last !== first) {
      tokens += this.estimateMessageTokens(last);
    }

    // Add messages from the end working backwards
    const remaining = nonSystemMessages.slice(1, -1);
    const toAdd: Message[] = [];

    for (let i = remaining.length - 1; i >= 0; i--) {
      const msg = remaining[i];
      const msgTokens = this.estimateMessageTokens(msg);

      if (tokens + msgTokens <= maxTokens) {
        toAdd.unshift(msg);
        tokens += msgTokens;
      } else {
        // Add truncation marker
        toAdd.unshift({
          role: 'system',
          content: `[${i + 1} earlier messages truncated for context]`,
        });
        break;
      }
    }

    result.push(...toAdd);

    if (last && last !== first) {
      result.push(last);
    }

    return result;
  }

  /**
   * Aggressive truncation - only keep essential messages
   */
  private aggressiveTruncate(messages: Message[], maxTokens: number): Message[] {
    const result: Message[] = [];
    let tokens = 0;

    // Keep system message (truncated if needed)
    const systemMsg = messages.find(m => m.role === 'system');
    if (systemMsg) {
      const truncatedSystem = this.truncateMessage(systemMsg, maxTokens * 0.2);
      result.push(truncatedSystem);
      tokens += this.estimateMessageTokens(truncatedSystem);
    }

    // Keep last user message
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length > 0) {
      const lastUser = userMessages[userMessages.length - 1];
      const truncatedUser = this.truncateMessage(lastUser, maxTokens * 0.6);
      result.push(truncatedUser);
      tokens += this.estimateMessageTokens(truncatedUser);
    }

    // Keep last assistant message if space
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    if (assistantMessages.length > 0) {
      const lastAssistant = assistantMessages[assistantMessages.length - 1];
      const assistantTokens = this.estimateMessageTokens(lastAssistant);

      if (tokens + assistantTokens <= maxTokens) {
        result.splice(result.length - 1, 0, lastAssistant);
      }
    }

    return result;
  }

  /**
   * Truncate a single message to fit token limit
   */
  private truncateMessage(message: Message, maxTokens: number): Message {
    const content = this.extractContent(message);
    const currentTokens = Math.ceil(content.length / 4);

    if (currentTokens <= maxTokens) {
      return message;
    }

    const targetChars = maxTokens * 4;
    const truncated = content.slice(0, targetChars - 50) + '\n...[truncated]';

    return {
      ...message,
      content: truncated,
    };
  }

  /**
   * Estimate tokens for all messages
   */
  estimateTokens(messages: Message[]): number {
    return messages.reduce(
      (total, msg) => total + this.estimateMessageTokens(msg),
      0
    );
  }

  /**
   * Estimate tokens for a single message
   */
  private estimateMessageTokens(message: Message): number {
    const content = this.extractContent(message);
    // Rough estimate: ~4 chars per token + overhead
    return Math.ceil(content.length / 4) + 4;
  }

  /**
   * Extract text content from message
   */
  private extractContent(message: Message): string {
    if (typeof message.content === 'string') {
      return message.content;
    }
    return message.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join(' ');
  }

  /**
   * Check if messages fit in model context
   */
  fitsInContext(messages: Message[], model: ModelDefinition): boolean {
    const availableTokens = model.contextWindow - this.config.reserveOutputTokens;
    const totalTokens = this.estimateTokens(messages);
    return totalTokens <= availableTokens;
  }

  /**
   * Get optimal chunk size for a model
   */
  getChunkSize(model: ModelDefinition): number {
    const maxChunk = Math.floor(model.contextWindow * 0.4);
    return Math.min(maxChunk, this.config.maxChunkSize);
  }
}
