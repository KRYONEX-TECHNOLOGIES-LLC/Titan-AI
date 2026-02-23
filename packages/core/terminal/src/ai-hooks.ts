/**
 * AI hooks for terminal integration
 */

import { EventEmitter } from 'events';
import type { AIHookConfig, TerminalError, CommandExecution, CapturedOutput } from './types';

export interface AIHookRequest {
  type: 'fix' | 'suggest' | 'analyze' | 'explain';
  terminalId: string;
  command?: string;
  output?: string;
  error?: TerminalError;
  context?: Record<string, unknown>;
}

export interface AIHookResponse {
  type: AIHookRequest['type'];
  success: boolean;
  suggestion?: string;
  fixedCommand?: string;
  explanation?: string;
  confidence: number;
  alternatives?: string[];
}

export type AIHookHandler = (request: AIHookRequest) => Promise<AIHookResponse>;

export class AIHooks extends EventEmitter {
  private config: AIHookConfig;
  private handler: AIHookHandler | null = null;
  private pendingRequests: Map<string, AIHookRequest> = new Map();
  private requestCounter: number = 0;

  constructor(config: Partial<AIHookConfig> = {}) {
    super();
    this.config = {
      enableAutoFix: true,
      enableCommandSuggestions: true,
      enableOutputAnalysis: true,
      maxOutputCapture: 10000,
      confidenceThreshold: 0.7,
      ...config,
    };
  }

  /**
   * Register the AI handler
   */
  setHandler(handler: AIHookHandler): void {
    this.handler = handler;
  }

  /**
   * Process a command execution for AI analysis
   */
  async processExecution(execution: CommandExecution): Promise<AIHookResponse | null> {
    if (!this.handler) return null;

    // Check for errors that might need fixing
    if (execution.exitCode && execution.exitCode !== 0 && this.config.enableAutoFix) {
      return this.requestFix(execution);
    }

    // Analyze output if enabled
    if (this.config.enableOutputAnalysis && execution.output) {
      return this.requestAnalysis(execution);
    }

    return null;
  }

  /**
   * Request a fix for a failed command
   */
  async requestFix(execution: CommandExecution): Promise<AIHookResponse | null> {
    if (!this.handler) return null;

    const request: AIHookRequest = {
      type: 'fix',
      terminalId: execution.terminalId,
      command: execution.command,
      output: this.truncateOutput(execution.output),
      context: {
        exitCode: execution.exitCode,
        errorOutput: execution.errorOutput,
      },
    };

    return this.sendRequest(request);
  }

  /**
   * Request command suggestions
   */
  async requestSuggestion(
    terminalId: string,
    partialCommand: string,
    context?: Record<string, unknown>
  ): Promise<AIHookResponse | null> {
    if (!this.handler || !this.config.enableCommandSuggestions) return null;

    const request: AIHookRequest = {
      type: 'suggest',
      terminalId,
      command: partialCommand,
      ...(context && { context }),
    };

    return this.sendRequest(request);
  }

  /**
   * Request output analysis
   */
  async requestAnalysis(execution: CommandExecution): Promise<AIHookResponse | null> {
    if (!this.handler || !this.config.enableOutputAnalysis) return null;

    const request: AIHookRequest = {
      type: 'analyze',
      terminalId: execution.terminalId,
      command: execution.command,
      output: this.truncateOutput(execution.output),
    };

    return this.sendRequest(request);
  }

  /**
   * Request command explanation
   */
  async requestExplanation(
    terminalId: string,
    command: string
  ): Promise<AIHookResponse | null> {
    if (!this.handler) return null;

    const request: AIHookRequest = {
      type: 'explain',
      terminalId,
      command,
    };

    return this.sendRequest(request);
  }

  /**
   * Handle captured output with errors
   */
  async handleErrors(capture: CapturedOutput): Promise<AIHookResponse[]> {
    if (!this.handler || !this.config.enableAutoFix) return [];

    const responses: AIHookResponse[] = [];

    for (const error of capture.errors) {
      const request: AIHookRequest = {
        type: 'fix',
        terminalId: capture.terminalId,
        error,
        output: this.truncateOutput(capture.strippedOutput),
      };

      const response = await this.sendRequest(request);
      if (response) {
        responses.push(response);
      }
    }

    return responses;
  }

  private async sendRequest(request: AIHookRequest): Promise<AIHookResponse | null> {
    if (!this.handler) return null;

    const requestId = `req-${++this.requestCounter}`;
    this.pendingRequests.set(requestId, request);

    try {
      this.emit('request:start', { requestId, request });
      
      const response = await this.handler(request);
      
      this.emit('request:complete', { requestId, request, response });

      // Only emit suggestions above confidence threshold
      if (response.confidence >= this.config.confidenceThreshold) {
        this.emit('suggestion', { request, response });
      }

      return response;
    } catch (error) {
      this.emit('request:error', { requestId, request, error });
      return null;
    } finally {
      this.pendingRequests.delete(requestId);
    }
  }

  private truncateOutput(output: string): string {
    if (output.length <= this.config.maxOutputCapture) {
      return output;
    }
    
    // Keep the end of the output (usually more relevant for errors)
    return '...\n' + output.slice(-this.config.maxOutputCapture);
  }

  /**
   * Apply a suggested fix
   */
  async applyFix(
    terminalId: string,
    response: AIHookResponse,
    executeCallback: (terminalId: string, command: string) => Promise<void>
  ): Promise<boolean> {
    if (!response.fixedCommand) {
      return false;
    }

    if (response.confidence < this.config.confidenceThreshold) {
      this.emit('fix:skipped', { terminalId, response, reason: 'Low confidence' });
      return false;
    }

    try {
      this.emit('fix:applying', { terminalId, command: response.fixedCommand });
      await executeCallback(terminalId, response.fixedCommand);
      this.emit('fix:applied', { terminalId, command: response.fixedCommand });
      return true;
    } catch (error) {
      this.emit('fix:failed', { terminalId, error });
      return false;
    }
  }

  getPendingRequests(): AIHookRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  updateConfig(config: Partial<AIHookConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config:updated', this.config);
  }

  getConfig(): AIHookConfig {
    return { ...this.config };
  }
}

/**
 * Creates an AI hooks instance
 */
export function createAIHooks(config?: Partial<AIHookConfig>): AIHooks {
  return new AIHooks(config);
}
