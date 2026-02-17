/**
 * Command Registry
 *
 * Manages editor commands
 */

import { EventEmitter } from 'events';
import type { Command } from './types';

export type CommandHandler = (...args: unknown[]) => unknown | Promise<unknown>;

export interface RegisteredCommand {
  id: string;
  handler: CommandHandler;
  title?: string;
  category?: string;
  keybinding?: string;
}

export class CommandRegistry extends EventEmitter {
  private commands = new Map<string, RegisteredCommand>();
  private disposables: Array<() => void> = [];

  /**
   * Register a command
   */
  register(
    id: string,
    handler: CommandHandler,
    options: { title?: string; category?: string; keybinding?: string } = {}
  ): () => void {
    if (this.commands.has(id)) {
      throw new Error(`Command '${id}' is already registered`);
    }

    const command: RegisteredCommand = {
      id,
      handler,
      title: options.title,
      category: options.category,
      keybinding: options.keybinding,
    };

    this.commands.set(id, command);
    this.emit('commandRegistered', command);

    const dispose = () => {
      this.commands.delete(id);
      this.emit('commandUnregistered', id);
    };

    this.disposables.push(dispose);
    return dispose;
  }

  /**
   * Execute a command
   */
  async execute(id: string, ...args: unknown[]): Promise<unknown> {
    const command = this.commands.get(id);

    if (!command) {
      throw new Error(`Command '${id}' not found`);
    }

    this.emit('commandExecuting', id, args);

    try {
      const result = await command.handler(...args);
      this.emit('commandExecuted', id, args, result);
      return result;
    } catch (error) {
      this.emit('commandFailed', id, args, error);
      throw error;
    }
  }

  /**
   * Check if command exists
   */
  has(id: string): boolean {
    return this.commands.has(id);
  }

  /**
   * Get command info
   */
  get(id: string): RegisteredCommand | undefined {
    return this.commands.get(id);
  }

  /**
   * Get all commands
   */
  getAll(): RegisteredCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get commands by category
   */
  getByCategory(category: string): RegisteredCommand[] {
    return this.getAll().filter((c) => c.category === category);
  }

  /**
   * Get command IDs
   */
  getIds(): string[] {
    return Array.from(this.commands.keys());
  }

  /**
   * Dispose all commands
   */
  dispose(): void {
    for (const dispose of this.disposables) {
      dispose();
    }
    this.disposables = [];
    this.commands.clear();
  }
}

/**
 * Built-in command IDs for Titan AI
 */
export const TitanCommands = {
  // AI Commands
  AI_CHAT_OPEN: 'titan.ai.chat.open',
  AI_CHAT_CLOSE: 'titan.ai.chat.close',
  AI_INLINE_EDIT: 'titan.ai.inline.edit',
  AI_GENERATE_CODE: 'titan.ai.generate.code',
  AI_EXPLAIN_CODE: 'titan.ai.explain.code',
  AI_FIX_ERROR: 'titan.ai.fix.error',
  AI_REFACTOR: 'titan.ai.refactor',
  AI_WRITE_TESTS: 'titan.ai.write.tests',
  AI_WRITE_DOCS: 'titan.ai.write.docs',

  // Agent Commands
  AGENT_START: 'titan.agent.start',
  AGENT_STOP: 'titan.agent.stop',
  AGENT_STATUS: 'titan.agent.status',

  // Editor Commands
  EDITOR_FORMAT: 'titan.editor.format',
  EDITOR_SAVE_ALL: 'titan.editor.saveAll',
  EDITOR_CLOSE_ALL: 'titan.editor.closeAll',

  // Search Commands
  SEARCH_SEMANTIC: 'titan.search.semantic',
  SEARCH_SYMBOLS: 'titan.search.symbols',
  SEARCH_FILES: 'titan.search.files',

  // Terminal Commands
  TERMINAL_NEW: 'titan.terminal.new',
  TERMINAL_RUN: 'titan.terminal.run',

  // Git Commands
  GIT_STATUS: 'titan.git.status',
  GIT_COMMIT: 'titan.git.commit',
  GIT_PUSH: 'titan.git.push',
  GIT_PULL: 'titan.git.pull',
} as const;
