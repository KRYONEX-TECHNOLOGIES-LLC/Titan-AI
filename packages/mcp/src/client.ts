/**
 * Titan AI MCP - Client Implementation
 * Connect to MCP servers and use their tools/resources
 */

import type {
  MCPClientConfig,
  Transport,
  JsonRpcRequest,
  JsonRpcResponse,
  ClientCapabilities,
  ServerCapabilities,
  ServerInfo,
  MCPTool,
  ToolCall,
  ToolResult,
  MCPResource,
  ResourceContents,
  MCPPrompt,
  PromptMessage,
} from './types.js';
import { StdioTransport } from './transports/stdio.js';

export class MCPClient {
  private config: MCPClientConfig;
  private transport: Transport | null = null;
  private requestId = 0;
  private pendingRequests = new Map<
    string | number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private serverCapabilities: ServerCapabilities | null = null;
  private serverInfo: ServerInfo | null = null;

  constructor(config: MCPClientConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    // Create transport
    if (this.config.transport) {
      this.transport = this.config.transport;
    } else if (this.config.serverCommand) {
      this.transport = new StdioTransport({
        command: this.config.serverCommand,
        args: this.config.serverArgs,
      });
    } else {
      throw new Error('No transport or server command provided');
    }

    // Set up message handling
    this.transport.onMessage(message => this.handleMessage(message));
    this.transport.onError(error => console.error('MCP transport error:', error));

    // Start transport
    await this.transport.start();

    // Initialize connection
    const result = await this.request<{
      protocolVersion: string;
      capabilities: ServerCapabilities;
      serverInfo: ServerInfo;
    }>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      } as ClientCapabilities,
      clientInfo: {
        name: 'Titan AI',
        version: '0.1.0',
      },
    });

    this.serverCapabilities = result.capabilities;
    this.serverInfo = result.serverInfo;

    // Send initialized notification
    await this.notify('notifications/initialized', {});
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<MCPTool[]> {
    const result = await this.request<{ tools: MCPTool[] }>('tools/list', {});
    return result.tools;
  }

  /**
   * Call a tool
   */
  async callTool(call: ToolCall): Promise<ToolResult> {
    const result = await this.request<ToolResult>('tools/call', {
      name: call.name,
      arguments: call.arguments,
    });
    return result;
  }

  /**
   * List available resources
   */
  async listResources(): Promise<MCPResource[]> {
    const result = await this.request<{ resources: MCPResource[] }>('resources/list', {});
    return result.resources;
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<ResourceContents> {
    const result = await this.request<{ contents: ResourceContents[] }>('resources/read', {
      uri,
    });
    return result.contents[0];
  }

  /**
   * Subscribe to resource updates
   */
  async subscribeResource(uri: string): Promise<void> {
    await this.request('resources/subscribe', { uri });
  }

  /**
   * List available prompts
   */
  async listPrompts(): Promise<MCPPrompt[]> {
    const result = await this.request<{ prompts: MCPPrompt[] }>('prompts/list', {});
    return result.prompts;
  }

  /**
   * Get a prompt
   */
  async getPrompt(
    name: string,
    args?: Record<string, string>
  ): Promise<{ description?: string; messages: PromptMessage[] }> {
    const result = await this.request<{ description?: string; messages: PromptMessage[] }>(
      'prompts/get',
      { name, arguments: args }
    );
    return result;
  }

  /**
   * Get server capabilities
   */
  getCapabilities(): ServerCapabilities | null {
    return this.serverCapabilities;
  }

  /**
   * Get server info
   */
  getServerInfo(): ServerInfo | null {
    return this.serverInfo;
  }

  /**
   * Send a request and wait for response
   */
  private async request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    if (!this.transport) {
      throw new Error('Not connected');
    }

    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.config.timeout);

      this.pendingRequests.set(id, {
        resolve: (value: unknown) => {
          clearTimeout(timeout);
          resolve(value as T);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.transport!.send({
        jsonrpc: '2.0',
        id,
        method,
        params,
      });
    });
  }

  /**
   * Send a notification (no response expected)
   */
  private async notify(method: string, params: Record<string, unknown>): Promise<void> {
    if (!this.transport) {
      throw new Error('Not connected');
    }

    await this.transport.send({
      jsonrpc: '2.0',
      id: 0, // Notifications don't need real IDs
      method,
      params,
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: JsonRpcRequest | JsonRpcResponse): void {
    if ('result' in message || 'error' in message) {
      // Response
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    } else {
      // Request or notification
      this.handleNotification(message);
    }
  }

  /**
   * Handle incoming notification
   */
  private handleNotification(request: JsonRpcRequest): void {
    // Handle notifications like resource updates, etc.
    switch (request.method) {
      case 'notifications/resources/updated':
        // Resource was updated
        break;
      case 'notifications/tools/list_changed':
        // Tool list changed
        break;
      case 'notifications/prompts/list_changed':
        // Prompt list changed
        break;
    }
  }
}
