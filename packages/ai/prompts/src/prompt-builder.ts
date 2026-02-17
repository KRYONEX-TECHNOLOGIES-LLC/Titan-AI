/**
 * Fluent prompt builder for constructing complex prompts
 */

import type { Message, PromptConfig, PromptContext } from './types';
import { TITAN_CORE_SYSTEM } from './system-prompts';

export class PromptBuilder {
  private systemPrompt: string = '';
  private messages: Message[] = [];
  private context: PromptContext = {};
  private config: PromptConfig = {};

  static create(): PromptBuilder {
    return new PromptBuilder();
  }

  system(prompt: string): PromptBuilder {
    this.systemPrompt = prompt;
    return this;
  }

  useDefaultSystem(): PromptBuilder {
    this.systemPrompt = TITAN_CORE_SYSTEM;
    return this;
  }

  appendSystem(content: string): PromptBuilder {
    this.systemPrompt += '\n\n' + content;
    return this;
  }

  user(content: string): PromptBuilder {
    this.messages.push({
      role: 'user',
      content,
      timestamp: new Date(),
    });
    return this;
  }

  assistant(content: string): PromptBuilder {
    this.messages.push({
      role: 'assistant',
      content,
      timestamp: new Date(),
    });
    return this;
  }

  addMessage(role: Message['role'], content: string): PromptBuilder {
    this.messages.push({
      role,
      content,
      timestamp: new Date(),
    });
    return this;
  }

  addMessages(messages: Message[]): PromptBuilder {
    this.messages.push(...messages);
    return this;
  }

  withCode(code: string, language?: string): PromptBuilder {
    this.context.code = code;
    if (language) {
      this.context.language = language;
    }
    return this;
  }

  withFile(filePath: string, content?: string): PromptBuilder {
    this.context.filePath = filePath;
    if (content) {
      this.context.code = content;
      this.context.language = this.detectLanguage(filePath);
    }
    return this;
  }

  withSelection(selection: string): PromptBuilder {
    this.context.selection = selection;
    return this;
  }

  withDiagnostics(diagnostics: string[]): PromptBuilder {
    this.context.diagnostics = diagnostics;
    return this;
  }

  withRepoMap(repoMap: string): PromptBuilder {
    this.context.repoMap = repoMap;
    return this;
  }

  withConversation(history: Message[]): PromptBuilder {
    this.context.conversationHistory = history;
    return this;
  }

  withVariable(key: string, value: unknown): PromptBuilder {
    this.context.customVariables = this.context.customVariables || {};
    this.context.customVariables[key] = value;
    return this;
  }

  withVariables(variables: Record<string, unknown>): PromptBuilder {
    this.context.customVariables = {
      ...this.context.customVariables,
      ...variables,
    };
    return this;
  }

  configure(config: Partial<PromptConfig>): PromptBuilder {
    this.config = { ...this.config, ...config };
    return this;
  }

  maxTokens(tokens: number): PromptBuilder {
    this.config.maxTokens = tokens;
    return this;
  }

  temperature(temp: number): PromptBuilder {
    this.config.temperature = temp;
    return this;
  }

  responseFormat(format: PromptConfig['responseFormat']): PromptBuilder {
    this.config.responseFormat = format;
    return this;
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'py': 'python',
      'rs': 'rust',
      'go': 'go',
      'java': 'java',
      'rb': 'ruby',
      'php': 'php',
      'cs': 'csharp',
      'cpp': 'cpp',
      'c': 'c',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala',
      'sql': 'sql',
      'sh': 'bash',
      'bash': 'bash',
      'zsh': 'bash',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'xml': 'xml',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'md': 'markdown',
    };
    return languageMap[ext || ''] || ext || '';
  }

  build(): {
    system: string;
    messages: Message[];
    context: PromptContext;
    config: PromptConfig;
  } {
    // Construct system message with context
    let system = this.systemPrompt;

    if (this.context.repoMap) {
      system += `\n\n## Repository Map\n${this.context.repoMap}`;
    }

    if (this.context.diagnostics && this.context.diagnostics.length > 0) {
      system += `\n\n## Current Diagnostics\n${this.context.diagnostics.join('\n')}`;
    }

    // Construct messages with code context
    const messages = [...this.messages];

    if (this.context.code && messages.length > 0) {
      const lastUserIdx = messages.map(m => m.role).lastIndexOf('user');
      if (lastUserIdx !== -1) {
        const codeBlock = `\n\n\`\`\`${this.context.language || ''}\n${this.context.code}\n\`\`\``;
        const fileInfo = this.context.filePath ? `\nFile: ${this.context.filePath}\n` : '';
        messages[lastUserIdx] = {
          ...messages[lastUserIdx],
          content: `${fileInfo}${messages[lastUserIdx].content}${codeBlock}`,
        };
      }
    }

    return {
      system,
      messages,
      context: this.context,
      config: this.config,
    };
  }

  buildPromptString(): string {
    const built = this.build();
    
    let prompt = '';
    
    if (built.system) {
      prompt += `<system>\n${built.system}\n</system>\n\n`;
    }

    for (const message of built.messages) {
      prompt += `<${message.role}>\n${message.content}\n</${message.role}>\n\n`;
    }

    return prompt.trim();
  }

  buildMessages(): Message[] {
    const built = this.build();
    const messages: Message[] = [];

    if (built.system) {
      messages.push({
        role: 'system',
        content: built.system,
      });
    }

    messages.push(...built.messages);

    return messages;
  }

  clone(): PromptBuilder {
    const clone = new PromptBuilder();
    clone.systemPrompt = this.systemPrompt;
    clone.messages = [...this.messages];
    clone.context = { ...this.context };
    clone.config = { ...this.config };
    return clone;
  }

  reset(): PromptBuilder {
    this.systemPrompt = '';
    this.messages = [];
    this.context = {};
    this.config = {};
    return this;
  }
}

/**
 * Creates a new prompt builder
 */
export function createPromptBuilder(): PromptBuilder {
  return PromptBuilder.create();
}
