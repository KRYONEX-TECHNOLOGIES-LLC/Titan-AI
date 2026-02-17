/**
 * Titan AI MCP - Server Implementation
 * Create MCP servers to expose tools/resources
 */

import type {
  MCPServerConfig,
  Transport,
  JsonRpcRequest,
  JsonRpcResponse,
  ServerCapabilities,
  MCPTool,
  ToolResult,
  MCPResource,
  ResourceContents,
  MCPPrompt,
  PromptMessage,
} from './types.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;
type ResourceHandler = (uri: string) => Promise<ResourceContents>;
type PromptHandler = (args?: Record<string, string>) => Promise<{
  description?: string;
  messages: PromptMessage[];
}>;

export class MCPServer {
  private config: MCPServerConfig;
  private transport: Transport | null = null;
  private tools: Map<string, { definition: MCPTool; handler: ToolHandler }> = new Map();
  private resources: Map<string, { definition: MCPResource; handler: ResourceHandler }> =
    new Map();
  private prompts: Map<string, { definition: MCPPrompt; handler: PromptHandler }> = new Map();

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  /**
   * Register a tool
   */
  tool(definition: MCPTool, handler: ToolHandler): this {
    this.tools.set(definition.name, { definition, handler });
    return this;
  }

  /**
   * Register a resource
   */
  resource(definition: MCPResource, handler: ResourceHandler): this {
    this.resources.set(definition.uri, { definition, handler });
    return this;
  }

  /**
   * Register a prompt
   */
  prompt(definition: MCPPrompt, handler: PromptHandler): this {
    this.prompts.set(definition.name, { definition, handler });
    return this;
  }

  /**
   * Start the server with a transport
   */
  async start(transport: Transport): Promise<void> {
    this.transport = transport;

    transport.onMessage(message => this.handleMessage(message));
    transport.onError(error => console.error('MCP server error:', error));

    await transport.start();
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(message: JsonRpcRequest | JsonRpcResponse): Promise<void> {
    if ('result' in message || 'error' in message) {
      // Response - ignore
      return;
    }

    // Handle request
    try {
      const result = await this.handleRequest(message);
      await this.sendResponse(message.id, result);
    } catch (error) {
      await this.sendError(message.id, -32603, error instanceof Error ? error.message : 'Internal error');
    }
  }

  /**
   * Handle a request
   */
  private async handleRequest(request: JsonRpcRequest): Promise<unknown> {
    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request.params ?? {});
      case 'tools/list':
        return this.handleListTools();
      case 'tools/call':
        return this.handleCallTool(request.params as { name: string; arguments: Record<string, unknown> });
      case 'resources/list':
        return this.handleListResources();
      case 'resources/read':
        return this.handleReadResource(request.params as { uri: string });
      case 'prompts/list':
        return this.handleListPrompts();
      case 'prompts/get':
        return this.handleGetPrompt(request.params as { name: string; arguments?: Record<string, string> });
      default:
        throw new Error(`Unknown method: ${request.method}`);
    }
  }

  /**
   * Handle initialize request
   */
  private handleInitialize(_params: Record<string, unknown>): {
    protocolVersion: string;
    capabilities: ServerCapabilities;
    serverInfo: { name: string; version: string };
  } {
    const capabilities: ServerCapabilities = {
      ...this.config.capabilities,
    };

    if (this.tools.size > 0) {
      capabilities.tools = { listChanged: true };
    }
    if (this.resources.size > 0) {
      capabilities.resources = { subscribe: false, listChanged: true };
    }
    if (this.prompts.size > 0) {
      capabilities.prompts = { listChanged: true };
    }

    return {
      protocolVersion: '2024-11-05',
      capabilities,
      serverInfo: {
        name: this.config.name,
        version: this.config.version,
      },
    };
  }

  /**
   * Handle list tools
   */
  private handleListTools(): { tools: MCPTool[] } {
    return {
      tools: Array.from(this.tools.values()).map(t => t.definition),
    };
  }

  /**
   * Handle call tool
   */
  private async handleCallTool(params: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<ToolResult> {
    const tool = this.tools.get(params.name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${params.name}` }],
        isError: true,
      };
    }

    try {
      return await tool.handler(params.arguments);
    } catch (error) {
      return {
        content: [
          { type: 'text', text: error instanceof Error ? error.message : 'Tool execution failed' },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle list resources
   */
  private handleListResources(): { resources: MCPResource[] } {
    return {
      resources: Array.from(this.resources.values()).map(r => r.definition),
    };
  }

  /**
   * Handle read resource
   */
  private async handleReadResource(params: { uri: string }): Promise<{ contents: ResourceContents[] }> {
    const resource = this.resources.get(params.uri);
    if (!resource) {
      throw new Error(`Unknown resource: ${params.uri}`);
    }

    const contents = await resource.handler(params.uri);
    return { contents: [contents] };
  }

  /**
   * Handle list prompts
   */
  private handleListPrompts(): { prompts: MCPPrompt[] } {
    return {
      prompts: Array.from(this.prompts.values()).map(p => p.definition),
    };
  }

  /**
   * Handle get prompt
   */
  private async handleGetPrompt(params: {
    name: string;
    arguments?: Record<string, string>;
  }): Promise<{ description?: string; messages: PromptMessage[] }> {
    const prompt = this.prompts.get(params.name);
    if (!prompt) {
      throw new Error(`Unknown prompt: ${params.name}`);
    }

    return prompt.handler(params.arguments);
  }

  /**
   * Send response
   */
  private async sendResponse(id: string | number, result: unknown): Promise<void> {
    if (!this.transport) return;

    await this.transport.send({
      jsonrpc: '2.0',
      id,
      result,
    });
  }

  /**
   * Send error response
   */
  private async sendError(id: string | number, code: number, message: string): Promise<void> {
    if (!this.transport) return;

    await this.transport.send({
      jsonrpc: '2.0',
      id,
      error: { code, message },
    });
  }
}

/**
 * Create an MCP server
 */
export function createMCPServer(config: MCPServerConfig): MCPServer {
  return new MCPServer(config);
}
