/**
 * MCP Server types
 */

export interface MCPServerConfig {
  id: string;
  name: string;
  version: string;
  capabilities: string[];
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<MCPToolResult>;
}

export interface MCPToolResult {
  content: MCPContent[];
  isError?: boolean;
}

export interface MCPContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface MCPServer {
  config: MCPServerConfig;
  tools: MCPTool[];
  resources?: MCPResource[];
  prompts?: MCPPrompt[];
  
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
