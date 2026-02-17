/**
 * AI Integration types
 */

import type { Message, ToolDefinition } from '@titan/ai-gateway';
import type { Range, TextEdit } from '@titan/editor-core';

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  context: ChatContext;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: ChatMessageMetadata;
}

export interface ChatMessageMetadata {
  model?: string;
  tokensUsed?: number;
  latencyMs?: number;
  tools?: ToolUse[];
  codeBlocks?: CodeBlock[];
}

export interface ToolUse {
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  status: 'pending' | 'running' | 'success' | 'error';
  error?: string;
}

export interface CodeBlock {
  language: string;
  code: string;
  filename?: string;
  action?: 'insert' | 'replace' | 'create';
}

export interface ChatContext {
  workspaceUri?: string;
  activeFile?: string;
  selectedCode?: string;
  openFiles?: string[];
  relatedSymbols?: string[];
  diagnostics?: string[];
}

export interface InlineEditRequest {
  uri: string;
  range: Range;
  instruction: string;
  context?: InlineEditContext;
}

export interface InlineEditContext {
  fileContent: string;
  language: string;
  symbols: string[];
  diagnostics: string[];
}

export interface InlineEditResult {
  edits: TextEdit[];
  explanation?: string;
  suggestedFollowUps?: string[];
}

export interface CodeActionRequest {
  uri: string;
  range: Range;
  diagnostics: string[];
  kind?: string;
}

export interface AICodeAction {
  title: string;
  kind: string;
  edits?: TextEdit[];
  command?: {
    command: string;
    arguments: unknown[];
  };
  isPreferred?: boolean;
}

export interface CompletionRequest {
  uri: string;
  position: { line: number; character: number };
  prefix: string;
  suffix: string;
  language: string;
  context?: CompletionContext;
}

export interface CompletionContext {
  triggerKind: 'invoked' | 'character' | 'incomplete';
  triggerCharacter?: string;
  symbols?: string[];
}

export interface AICompletion {
  text: string;
  displayText?: string;
  range?: Range;
  kind?: string;
  detail?: string;
  documentation?: string;
  sortText?: string;
}

export interface SelfHealingRequest {
  uri: string;
  error: string;
  errorType: 'build' | 'test' | 'lint' | 'runtime';
  stackTrace?: string;
  context: string;
}

export interface SelfHealingResult {
  fixed: boolean;
  edits?: TextEdit[];
  explanation: string;
  confidence: number;
}

export interface AIIntegrationConfig {
  enableChat: boolean;
  enableInlineEdit: boolean;
  enableCompletions: boolean;
  enableCodeActions: boolean;
  enableSelfHealing: boolean;
  defaultModel?: string;
  maxContextTokens: number;
  streamResponses: boolean;
}
