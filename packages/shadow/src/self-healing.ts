/**
 * Titan AI Shadow - Self-Healing Loop
 * Automatic error detection and correction
 */

import type {
  ExecutionResult,
  ExecutionError,
  HealingAction,
  HealingConfig,
  HealingPattern,
} from './types.js';

export class SelfHealingLoop {
  private config: HealingConfig;
  private patterns: HealingPattern[];

  constructor(config: Partial<HealingConfig> = {}) {
    this.config = {
      maxIterations: 3,
      autoFix: true,
      patterns: [],
      ...config,
    };

    this.patterns = [
      ...this.config.patterns,
      ...this.getDefaultPatterns(),
    ];
  }

  /**
   * Analyze errors and suggest healing actions
   */
  analyzeErrors(errors: ExecutionError[]): HealingAction[] {
    const actions: HealingAction[] = [];

    for (const error of errors) {
      for (const pattern of this.patterns) {
        if (pattern.errorType === error.type) {
          if (pattern.errorPattern.test(error.message)) {
            if (pattern.fix) {
              actions.push(pattern.fix(error));
            } else {
              actions.push({
                type: pattern.action,
                description: `Auto-fix for: ${error.message}`,
              });
            }
            break;
          }
        }
      }
    }

    return actions;
  }

  /**
   * Run self-healing loop
   */
  async heal(
    execute: () => Promise<ExecutionResult>,
    applyFix: (action: HealingAction) => Promise<void>
  ): Promise<{ success: boolean; iterations: number; actions: HealingAction[] }> {
    let iterations = 0;
    const allActions: HealingAction[] = [];

    while (iterations < this.config.maxIterations) {
      iterations++;

      const result = await execute();

      if (result.success) {
        return { success: true, iterations, actions: allActions };
      }

      // Analyze errors
      const actions = this.analyzeErrors(result.errors);

      if (actions.length === 0) {
        // No fixable errors found
        return { success: false, iterations, actions: allActions };
      }

      // Apply fixes
      for (const action of actions) {
        if (action.type === 'fix' && this.config.autoFix) {
          await applyFix(action);
          allActions.push(action);
        } else if (action.type === 'retry') {
          // Just retry
          allActions.push(action);
        } else if (action.type === 'skip') {
          // Skip this error
          allActions.push(action);
        } else if (action.type === 'rollback') {
          // Rollback would be handled by caller
          return { success: false, iterations, actions: [...allActions, action] };
        }
      }
    }

    return { success: false, iterations, actions: allActions };
  }

  /**
   * Get default healing patterns
   */
  private getDefaultPatterns(): HealingPattern[] {
    return [
      // Missing import
      {
        errorPattern: /Cannot find module '(.+)'/,
        errorType: 'build',
        action: 'fix',
        fix: error => {
          const match = error.message.match(/Cannot find module '(.+)'/);
          return {
            type: 'fix',
            description: `Install missing module: ${match?.[1]}`,
            command: `pnpm add ${match?.[1]}`,
          };
        },
      },
      // Missing dependency
      {
        errorPattern: /Cannot find package '(.+)'/,
        errorType: 'build',
        action: 'fix',
        fix: error => {
          const match = error.message.match(/Cannot find package '(.+)'/);
          return {
            type: 'fix',
            description: `Install missing package: ${match?.[1]}`,
            command: `pnpm add ${match?.[1]}`,
          };
        },
      },
      // Type error - property does not exist
      {
        errorPattern: /Property '(.+)' does not exist on type/,
        errorType: 'build',
        action: 'fix',
        fix: error => ({
          type: 'fix',
          description: 'Add missing property or fix type',
          changes: error.file
            ? [{ path: error.file, action: 'modify', content: '' }]
            : undefined,
        }),
      },
      // ESLint auto-fixable
      {
        errorPattern: /Run.+--fix/,
        errorType: 'lint',
        action: 'fix',
        fix: () => ({
          type: 'fix',
          description: 'Run ESLint with --fix',
          command: 'pnpm lint:fix',
        }),
      },
      // Test timeout
      {
        errorPattern: /Timeout/i,
        errorType: 'test',
        action: 'retry',
      },
      // Out of memory
      {
        errorPattern: /heap out of memory/i,
        errorType: 'runtime',
        action: 'rollback',
      },
    ];
  }

  /**
   * Add custom healing pattern
   */
  addPattern(pattern: HealingPattern): void {
    this.patterns.unshift(pattern);
  }

  /**
   * Get suggested fix for an error
   */
  getSuggestedFix(error: ExecutionError): string | null {
    for (const pattern of this.patterns) {
      if (
        pattern.errorType === error.type &&
        pattern.errorPattern.test(error.message) &&
        pattern.fix
      ) {
        const action = pattern.fix(error);
        return action.description;
      }
    }
    return null;
  }
}
