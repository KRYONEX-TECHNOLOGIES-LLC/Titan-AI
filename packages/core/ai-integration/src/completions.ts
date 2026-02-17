/**
 * AI Completions
 *
 * AI-powered code completions
 */

import { EventEmitter } from 'events';
import type { CompletionRequest, AICompletion, CompletionContext } from './types';

export interface CompletionConfig {
  enabled: boolean;
  debounceMs: number;
  maxCompletions: number;
  minPrefixLength: number;
  triggerCharacters: string[];
}

export class AICompletionProvider extends EventEmitter {
  private config: CompletionConfig;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRequest: CompletionRequest | null = null;

  constructor(config: Partial<CompletionConfig> = {}) {
    super();
    this.config = {
      enabled: config.enabled ?? true,
      debounceMs: config.debounceMs ?? 150,
      maxCompletions: config.maxCompletions ?? 10,
      minPrefixLength: config.minPrefixLength ?? 2,
      triggerCharacters: config.triggerCharacters ?? ['.', '(', '[', '{', ' '],
    };
  }

  /**
   * Request completions
   */
  async requestCompletions(request: CompletionRequest): Promise<AICompletion[]> {
    if (!this.config.enabled) return [];

    // Check minimum prefix
    if (request.prefix.length < this.config.minPrefixLength) {
      return [];
    }

    // Debounce
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        this.lastRequest = request;
        this.emit('completionRequested', request);

        try {
          const completions = await this.generateCompletions(request);
          this.emit('completionGenerated', completions);
          resolve(completions);
        } catch (error) {
          this.emit('completionFailed', error);
          resolve([]);
        }
      }, this.config.debounceMs);
    });
  }

  /**
   * Generate completions
   */
  private async generateCompletions(request: CompletionRequest): Promise<AICompletion[]> {
    // This would call the AI gateway in production
    // For now, return placeholder completions
    return [];
  }

  /**
   * Build completion prompt
   */
  buildCompletionPrompt(request: CompletionRequest): string {
    const parts: string[] = [];

    // Language hint
    parts.push(`Language: ${request.language}`);
    parts.push('');

    // File context
    parts.push('Code context:');
    parts.push('```');
    parts.push(request.prefix);
    parts.push('<CURSOR>');
    parts.push(request.suffix);
    parts.push('```');

    // Symbols in scope
    if (request.context?.symbols?.length) {
      parts.push('');
      parts.push('Available symbols:');
      parts.push(request.context.symbols.join(', '));
    }

    return parts.join('\n');
  }

  /**
   * Parse completion response
   */
  parseCompletionResponse(response: string): AICompletion[] {
    // Extract completions from response
    const completions: AICompletion[] = [];

    // Try to extract code blocks
    const codeBlocks = response.match(/```[\w]*\n([\s\S]*?)\n```/g) || [];

    for (const block of codeBlocks) {
      const code = block.replace(/```[\w]*\n|```/g, '').trim();
      if (code) {
        completions.push({
          text: code,
          displayText: code.split('\n')[0],
        });
      }
    }

    // If no code blocks, try line-by-line
    if (completions.length === 0) {
      const lines = response.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        completions.push({
          text: line.trim(),
          displayText: line.trim(),
        });
      }
    }

    return completions.slice(0, this.config.maxCompletions);
  }

  /**
   * Should trigger completion
   */
  shouldTrigger(char: string, prefix: string): boolean {
    if (!this.config.enabled) return false;

    // Check trigger characters
    if (this.config.triggerCharacters.includes(char)) {
      return true;
    }

    // Check minimum prefix
    return prefix.length >= this.config.minPrefixLength;
  }

  /**
   * Cancel pending completion
   */
  cancel(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.emit('completionCancelled');
  }

  /**
   * Accept a completion
   */
  acceptCompletion(completion: AICompletion): void {
    this.emit('completionAccepted', completion);
  }

  /**
   * Reject all completions
   */
  rejectCompletions(): void {
    this.emit('completionsRejected');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CompletionConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('configUpdated', this.config);
  }
}
