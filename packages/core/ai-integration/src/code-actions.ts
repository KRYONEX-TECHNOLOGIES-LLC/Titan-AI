/**
 * AI Code Actions
 *
 * AI-powered code actions and quick fixes
 */

import { EventEmitter } from 'events';
import type { CodeActionRequest, AICodeAction } from './types';
import type { Range, TextEdit, Diagnostic } from '@titan/editor-core';

export interface CodeActionConfig {
  enableQuickFix: boolean;
  enableRefactor: boolean;
  enableGenerate: boolean;
  maxSuggestions: number;
}

export class AICodeActionProvider extends EventEmitter {
  private config: CodeActionConfig;

  constructor(config: Partial<CodeActionConfig> = {}) {
    super();
    this.config = {
      enableQuickFix: config.enableQuickFix ?? true,
      enableRefactor: config.enableRefactor ?? true,
      enableGenerate: config.enableGenerate ?? true,
      maxSuggestions: config.maxSuggestions ?? 5,
    };
  }

  /**
   * Get code actions for a range
   */
  async getCodeActions(request: CodeActionRequest): Promise<AICodeAction[]> {
    const actions: AICodeAction[] = [];

    // Quick fixes for diagnostics
    if (this.config.enableQuickFix && request.diagnostics.length > 0) {
      const quickFixes = await this.getQuickFixes(request);
      actions.push(...quickFixes);
    }

    // Refactoring actions
    if (this.config.enableRefactor) {
      const refactors = this.getRefactorActions(request);
      actions.push(...refactors);
    }

    // Generation actions
    if (this.config.enableGenerate) {
      const generates = this.getGenerateActions(request);
      actions.push(...generates);
    }

    return actions.slice(0, this.config.maxSuggestions);
  }

  /**
   * Get quick fix actions for diagnostics
   */
  private async getQuickFixes(request: CodeActionRequest): Promise<AICodeAction[]> {
    const fixes: AICodeAction[] = [];

    for (const diagnostic of request.diagnostics) {
      fixes.push({
        title: `Fix: ${diagnostic.slice(0, 50)}...`,
        kind: 'quickfix',
        command: {
          command: 'titan.ai.fix.error',
          arguments: [request.uri, request.range, diagnostic],
        },
        isPreferred: true,
      });
    }

    return fixes;
  }

  /**
   * Get refactoring actions
   */
  private getRefactorActions(request: CodeActionRequest): AICodeAction[] {
    return [
      {
        title: 'Refactor with AI',
        kind: 'refactor',
        command: {
          command: 'titan.ai.refactor',
          arguments: [request.uri, request.range],
        },
      },
      {
        title: 'Extract to function',
        kind: 'refactor.extract',
        command: {
          command: 'titan.ai.extract.function',
          arguments: [request.uri, request.range],
        },
      },
      {
        title: 'Improve code quality',
        kind: 'refactor.rewrite',
        command: {
          command: 'titan.ai.improve',
          arguments: [request.uri, request.range],
        },
      },
    ];
  }

  /**
   * Get generation actions
   */
  private getGenerateActions(request: CodeActionRequest): AICodeAction[] {
    return [
      {
        title: 'Generate tests',
        kind: 'source.generateTests',
        command: {
          command: 'titan.ai.write.tests',
          arguments: [request.uri, request.range],
        },
      },
      {
        title: 'Generate documentation',
        kind: 'source.generateDocs',
        command: {
          command: 'titan.ai.write.docs',
          arguments: [request.uri, request.range],
        },
      },
      {
        title: 'Explain code',
        kind: 'source.explain',
        command: {
          command: 'titan.ai.explain.code',
          arguments: [request.uri, request.range],
        },
      },
    ];
  }

  /**
   * Execute a code action
   */
  async executeAction(action: AICodeAction): Promise<void> {
    this.emit('actionExecuting', action);

    try {
      if (action.edits) {
        // Apply edits directly
        this.emit('applyEdits', action.edits);
      }

      if (action.command) {
        // Execute command
        this.emit('executeCommand', action.command);
      }

      this.emit('actionExecuted', action);
    } catch (error) {
      this.emit('actionFailed', action, error);
      throw error;
    }
  }

  /**
   * Get preferred action
   */
  getPreferredAction(actions: AICodeAction[]): AICodeAction | undefined {
    return actions.find((a) => a.isPreferred);
  }

  /**
   * Filter actions by kind
   */
  filterByKind(actions: AICodeAction[], kind: string): AICodeAction[] {
    return actions.filter((a) => a.kind?.startsWith(kind));
  }
}
