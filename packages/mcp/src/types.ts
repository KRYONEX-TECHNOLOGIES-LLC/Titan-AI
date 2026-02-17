/**
 * Titan AI MCP - Type Definitions
 * Based on MCP 2026 Specification
 */

// JSON-RPC types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// MCP Client/Server capabilities
export interface ClientCapabilities {
  roots?: { listChanged?: boolean };
  sampling?: Record<string, never>;
  experimental?: Record<string, unknown>;
}

export interface ServerCapabilities {
  prompts?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  tools?: { listChanged?: boolean };
  logging?: Record<string, never>;
  experimental?: Record<string, unknown>;
}

// Tool definition
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
      items?: unknown;
    }>;
    required?: string[];
  };
}

// Tool call
export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

// Tool result
export interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  }>;
  isError?: boolean;
}

// Resource definition
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// Resource contents
export interface ResourceContents {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

// Prompt definition
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

// Prompt message
export interface PromptMessage {
  role: 'user' | 'assistant';
  content: {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  };
}

// Server info
export interface ServerInfo {
  name: string;
  version: string;
}

// Transport interface
export interface Transport {
  start(): Promise<void>;
  send(message: JsonRpcRequest | JsonRpcResponse): Promise<void>;
  close(): Promise<void>;
  onMessage(handler: (message: JsonRpcRequest | JsonRpcResponse) => void): void;
  onClose(handler: () => void): void;
  onError(handler: (error: Error) => void): void;
}

// MCP Client configuration
export interface MCPClientConfig {
  serverCommand?: string;
  serverArgs?: string[];
  transport?: Transport;
  timeout?: number;
}

// MCP Server configuration
export interface MCPServerConfig {
  name: string;
  version: string;
  capabilities?: Partial<ServerCapabilities>;
}

// Sampling request (for LLM calls)
export interface SamplingRequest {
  messages: Array<{
    role: 'user' | 'assistant';
    content: {
      type: 'text' | 'image';
      text?: string;
      data?: string;
      mimeType?: string;
    };
  }>;
  modelPreferences?: {
    hints?: Array<{ name?: string }>;
    costPriority?: number;
    speedPriority?: number;
    intelligencePriority?: number;
  };
  systemPrompt?: string;
  includeContext?: 'none' | 'thisServer' | 'allServers';
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

// Sampling response
export interface SamplingResponse {
  role: 'assistant';
  content: {
    type: 'text' | 'image';
    text?: string;
    data?: string;
    mimeType?: string;
  };
  model: string;
  stopReason?: 'endTurn' | 'stopSequence' | 'maxTokens';
}
