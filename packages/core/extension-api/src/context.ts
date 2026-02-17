/**
 * Extension Context
 *
 * Context management for extensions
 */

import { EventEmitter } from 'events';

export interface ContextKey<T> {
  key: string;
  get(): T | undefined;
  set(value: T): void;
  reset(): void;
}

export class ContextKeyService extends EventEmitter {
  private context = new Map<string, unknown>();

  /**
   * Create a context key
   */
  createKey<T>(key: string, defaultValue?: T): ContextKey<T> {
    if (defaultValue !== undefined) {
      this.context.set(key, defaultValue);
    }

    return {
      key,
      get: () => this.getValue<T>(key),
      set: (value: T) => this.setValue(key, value),
      reset: () => this.deleteKey(key),
    };
  }

  /**
   * Get a value
   */
  getValue<T>(key: string): T | undefined {
    return this.context.get(key) as T | undefined;
  }

  /**
   * Set a value
   */
  setValue(key: string, value: unknown): void {
    const oldValue = this.context.get(key);
    this.context.set(key, value);

    if (oldValue !== value) {
      this.emit('contextChanged', key, value, oldValue);
    }
  }

  /**
   * Delete a key
   */
  deleteKey(key: string): void {
    if (this.context.has(key)) {
      const oldValue = this.context.get(key);
      this.context.delete(key);
      this.emit('contextChanged', key, undefined, oldValue);
    }
  }

  /**
   * Check if key exists
   */
  hasKey(key: string): boolean {
    return this.context.has(key);
  }

  /**
   * Evaluate a when clause
   */
  evaluateWhen(expression: string): boolean {
    if (!expression) return true;

    try {
      return this.evaluateExpression(expression);
    } catch {
      return false;
    }
  }

  /**
   * Evaluate a boolean expression
   */
  private evaluateExpression(expression: string): boolean {
    // Simple expression parser
    expression = expression.trim();

    // Handle NOT
    if (expression.startsWith('!')) {
      return !this.evaluateExpression(expression.slice(1));
    }

    // Handle parentheses
    if (expression.startsWith('(') && expression.endsWith(')')) {
      return this.evaluateExpression(expression.slice(1, -1));
    }

    // Handle AND
    const andParts = this.splitByOperator(expression, '&&');
    if (andParts.length > 1) {
      return andParts.every((part) => this.evaluateExpression(part));
    }

    // Handle OR
    const orParts = this.splitByOperator(expression, '||');
    if (orParts.length > 1) {
      return orParts.some((part) => this.evaluateExpression(part));
    }

    // Handle comparison operators
    const eqMatch = expression.match(/^(\S+)\s*==\s*(.+)$/);
    if (eqMatch) {
      const value = this.getValue(eqMatch[1]);
      const compare = this.parseValue(eqMatch[2]);
      return value === compare;
    }

    const neqMatch = expression.match(/^(\S+)\s*!=\s*(.+)$/);
    if (neqMatch) {
      const value = this.getValue(neqMatch[1]);
      const compare = this.parseValue(neqMatch[2]);
      return value !== compare;
    }

    // Handle simple key check
    const value = this.getValue(expression);
    return Boolean(value);
  }

  /**
   * Split expression by operator respecting parentheses
   */
  private splitByOperator(expression: string, operator: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < expression.length; i++) {
      const char = expression[i];

      if (char === '(') depth++;
      else if (char === ')') depth--;

      if (depth === 0 && expression.slice(i, i + operator.length) === operator) {
        parts.push(current.trim());
        current = '';
        i += operator.length - 1;
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts;
  }

  /**
   * Parse a value string
   */
  private parseValue(value: string): unknown {
    value = value.trim();

    // String
    if ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))) {
      return value.slice(1, -1);
    }

    // Boolean
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Number
    const num = parseFloat(value);
    if (!isNaN(num)) return num;

    // Key reference
    return this.getValue(value);
  }

  /**
   * Get all keys
   */
  getKeys(): string[] {
    return Array.from(this.context.keys());
  }

  /**
   * Clear all context
   */
  clear(): void {
    this.context.clear();
    this.emit('contextCleared');
  }
}

/**
 * Built-in context keys for Titan AI
 */
export const TitanContextKeys = {
  // Editor state
  EDITOR_HAS_SELECTION: 'editorHasSelection',
  EDITOR_LANGUAGE_ID: 'editorLangId',
  EDITOR_READ_ONLY: 'editorReadonly',
  EDITOR_HAS_FOCUS: 'editorFocus',

  // AI state
  AI_CHAT_VISIBLE: 'titanAIChatVisible',
  AI_GENERATING: 'titanAIGenerating',
  AI_AGENT_RUNNING: 'titanAgentRunning',

  // Workspace state
  WORKSPACE_HAS_GIT: 'gitEnabled',
  WORKSPACE_HAS_UNCOMMITTED: 'gitHasUncommitted',

  // Panel state
  PANEL_VISIBLE: 'panelVisible',
  TERMINAL_FOCUS: 'terminalFocus',
} as const;
