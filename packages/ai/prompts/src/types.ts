/**
 * Prompt types
 */

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  variables: PromptVariable[];
  tags: string[];
  version: string;
}

export interface PromptVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  default?: unknown;
  description?: string;
}

export interface PromptContext {
  code?: string;
  language?: string;
  filePath?: string;
  selection?: string;
  diagnostics?: string[];
  repoMap?: string;
  userMessage?: string;
  conversationHistory?: Message[];
  customVariables?: Record<string, unknown>;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface AgentRole {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
  constraints: string[];
  outputFormat?: string;
}

export interface PromptConfig {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  responseFormat?: 'text' | 'json' | 'markdown' | 'code';
}

export type PromptCategory = 
  | 'system'
  | 'agent'
  | 'chat'
  | 'completion'
  | 'edit'
  | 'refactor'
  | 'explain'
  | 'test'
  | 'review'
  | 'debug';
