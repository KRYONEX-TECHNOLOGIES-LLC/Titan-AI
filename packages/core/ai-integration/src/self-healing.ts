/**
 * Self-Healing Service
 *
 * AI-powered automatic error fixing
 */

import { EventEmitter } from 'events';
import type { SelfHealingRequest, SelfHealingResult } from './types';
import type { TextEdit, Range } from '@titan/editor-core';

export interface SelfHealingConfig {
  enabled: boolean;
  autoApply: boolean;
  minConfidence: number;
  maxAttempts: number;
  supportedErrors: string[];
}

export interface HealingAttempt {
  id: string;
  request: SelfHealingRequest;
  result?: SelfHealingResult;
  status: 'pending' | 'healing' | 'success' | 'failed';
  attempts: number;
  error?: string;
}

export class SelfHealingService extends EventEmitter {
  private config: SelfHealingConfig;
  private attempts = new Map<string, HealingAttempt>();
  private healingQueue: SelfHealingRequest[] = [];
  private isProcessing = false;

  constructor(config: Partial<SelfHealingConfig> = {}) {
    super();
    this.config = {
      enabled: config.enabled ?? true,
      autoApply: config.autoApply ?? false,
      minConfidence: config.minConfidence ?? 0.8,
      maxAttempts: config.maxAttempts ?? 3,
      supportedErrors: config.supportedErrors ?? [
        'build',
        'lint',
        'test',
        'runtime',
      ],
    };
  }

  /**
   * Request healing for an error
   */
  async heal(request: SelfHealingRequest): Promise<SelfHealingResult> {
    if (!this.config.enabled) {
      return {
        fixed: false,
        explanation: 'Self-healing is disabled',
        confidence: 0,
      };
    }

    if (!this.config.supportedErrors.includes(request.errorType)) {
      return {
        fixed: false,
        explanation: `Error type '${request.errorType}' is not supported`,
        confidence: 0,
      };
    }

    const attemptId = `heal-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const attempt: HealingAttempt = {
      id: attemptId,
      request,
      status: 'pending',
      attempts: 0,
    };

    this.attempts.set(attemptId, attempt);
    this.emit('healingRequested', attempt);

    try {
      attempt.status = 'healing';
      this.emit('healingStarted', attempt);

      const result = await this.performHealing(request, attempt);
      attempt.result = result;

      if (result.fixed) {
        attempt.status = 'success';
        this.emit('healingSuccess', attempt);

        // Auto-apply if configured and confidence is high enough
        if (
          this.config.autoApply &&
          result.confidence >= this.config.minConfidence &&
          result.edits
        ) {
          this.emit('applyEdits', result.edits);
        }
      } else {
        attempt.status = 'failed';
        this.emit('healingFailed', attempt);
      }

      return result;
    } catch (error) {
      attempt.status = 'failed';
      attempt.error = error instanceof Error ? error.message : String(error);
      this.emit('healingError', attempt, error);

      return {
        fixed: false,
        explanation: `Healing failed: ${attempt.error}`,
        confidence: 0,
      };
    }
  }

  /**
   * Perform the healing process
   */
  private async performHealing(
    request: SelfHealingRequest,
    attempt: HealingAttempt
  ): Promise<SelfHealingResult> {
    attempt.attempts++;

    // Build healing prompt
    const prompt = this.buildHealingPrompt(request);

    // This would call the AI gateway in production
    // For now, return a placeholder
    return {
      fixed: false,
      explanation: 'Healing attempted but no fix found',
      confidence: 0,
    };
  }

  /**
   * Build healing prompt
   */
  private buildHealingPrompt(request: SelfHealingRequest): string {
    const parts: string[] = [];

    parts.push(`Error Type: ${request.errorType}`);
    parts.push('');
    parts.push('Error Message:');
    parts.push(request.error);
    parts.push('');

    if (request.stackTrace) {
      parts.push('Stack Trace:');
      parts.push(request.stackTrace);
      parts.push('');
    }

    parts.push('Context:');
    parts.push('```');
    parts.push(request.context);
    parts.push('```');

    parts.push('');
    parts.push('Please analyze the error and provide a fix.');
    parts.push('Return the corrected code in a code block.');

    return parts.join('\n');
  }

  /**
   * Queue a healing request
   */
  queueHealing(request: SelfHealingRequest): void {
    this.healingQueue.push(request);
    this.processQueue();
  }

  /**
   * Process the healing queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.healingQueue.length === 0) return;

    this.isProcessing = true;

    while (this.healingQueue.length > 0) {
      const request = this.healingQueue.shift()!;
      await this.heal(request);
    }

    this.isProcessing = false;
  }

  /**
   * Get healing attempt status
   */
  getAttempt(id: string): HealingAttempt | undefined {
    return this.attempts.get(id);
  }

  /**
   * Get all attempts
   */
  getAllAttempts(): HealingAttempt[] {
    return Array.from(this.attempts.values());
  }

  /**
   * Clear completed attempts
   */
  clearCompleted(): void {
    for (const [id, attempt] of this.attempts) {
      if (attempt.status === 'success' || attempt.status === 'failed') {
        this.attempts.delete(id);
      }
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SelfHealingConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('configUpdated', this.config);
  }

  /**
   * Check if error is supported
   */
  isSupported(errorType: string): boolean {
    return this.config.supportedErrors.includes(errorType);
  }
}
