// MCP Connector Manager
// packages/mcp/connectors/src/connector-manager.ts

import {
  BaseConnector,
  ConnectorConfig,
  ConnectorType,
  SlackConfig,
  GitHubConfig,
  JiraConfig,
  FigmaConfig,
  NotionConfig,
  ConnectorResource,
  ConnectorTool,
} from './types';
import { SlackConnector } from './slack-connector';
import { GitHubConnector } from './github-connector';
import { JiraConnector } from './jira-connector';
import { FigmaConnector } from './figma-connector';
import { NotionConnector } from './notion-connector';

export interface ConnectorManagerConfig {
  autoConnect: boolean;
  retryOnFailure: boolean;
  maxRetries: number;
}

export class ConnectorManager {
  private connectors: Map<string, BaseConnector> = new Map();
  private config: ConnectorManagerConfig;
  private eventListeners: Map<string, ((event: ConnectorEvent) => void)[]> = new Map();

  constructor(config: Partial<ConnectorManagerConfig> = {}) {
    this.config = {
      autoConnect: true,
      retryOnFailure: true,
      maxRetries: 3,
      ...config,
    };
  }

  async registerConnector(config: ConnectorConfig): Promise<BaseConnector> {
    const connector = this.createConnector(config);
    this.connectors.set(config.id, connector);

    if (this.config.autoConnect && config.enabled) {
      await this.connectWithRetry(connector);
    }

    this.emit('connector:registered', { connectorId: config.id, type: config.type });
    return connector;
  }

  private createConnector(config: ConnectorConfig): BaseConnector {
    switch (config.type) {
      case 'slack':
        return new SlackConnector(config as SlackConfig);
      case 'github':
        return new GitHubConnector(config as GitHubConfig);
      case 'jira':
        return new JiraConnector(config as JiraConfig);
      case 'figma':
        return new FigmaConnector(config as FigmaConfig);
      case 'notion':
        return new NotionConnector(config as NotionConfig);
      default:
        throw new Error(`Unknown connector type: ${config.type}`);
    }
  }

  private async connectWithRetry(connector: BaseConnector): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        await connector.connect();
        this.emit('connector:connected', { connectorId: connector.id });
        return;
      } catch (error) {
        lastError = error as Error;
        this.emit('connector:error', { connectorId: connector.id, error: lastError });
        await this.delay(Math.pow(2, attempt) * 1000); // Exponential backoff
      }
    }

    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async unregisterConnector(id: string): Promise<void> {
    const connector = this.connectors.get(id);
    if (connector) {
      if (connector.isConnected()) {
        await connector.disconnect();
      }
      this.connectors.delete(id);
      this.emit('connector:unregistered', { connectorId: id });
    }
  }

  getConnector(id: string): BaseConnector | undefined {
    return this.connectors.get(id);
  }

  getConnectorsByType(type: ConnectorType): BaseConnector[] {
    return Array.from(this.connectors.values())
      .filter(connector => connector.type === type);
  }

  getAllConnectors(): BaseConnector[] {
    return Array.from(this.connectors.values());
  }

  async listAllResources(): Promise<Map<string, ConnectorResource[]>> {
    const resources = new Map<string, ConnectorResource[]>();

    for (const [id, connector] of this.connectors) {
      if (connector.isConnected()) {
        try {
          const connectorResources = await connector.listResources();
          resources.set(id, connectorResources);
        } catch (error) {
          console.error(`Failed to list resources for connector ${id}:`, error);
        }
      }
    }

    return resources;
  }

  listAllTools(): Map<string, ConnectorTool[]> {
    const tools = new Map<string, ConnectorTool[]>();

    for (const [id, connector] of this.connectors) {
      const connectorTools = connector.listTools().map(tool => ({
        ...tool,
        name: `${id}__${tool.name}`, // Namespace tool names
      }));
      tools.set(id, connectorTools);
    }

    return tools;
  }

  async executeTool(
    namespacedToolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const [connectorId, toolName] = namespacedToolName.split('__');
    
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`Connector not found: ${connectorId}`);
    }

    if (!connector.isConnected()) {
      throw new Error(`Connector not connected: ${connectorId}`);
    }

    this.emit('tool:execute', { connectorId, toolName, args });
    
    try {
      const result = await connector.executeTool(toolName, args);
      this.emit('tool:success', { connectorId, toolName, result });
      return result;
    } catch (error) {
      this.emit('tool:error', { connectorId, toolName, error });
      throw error;
    }
  }

  async readResource(connectorId: string, uri: string): Promise<unknown> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`Connector not found: ${connectorId}`);
    }

    if (!connector.isConnected()) {
      throw new Error(`Connector not connected: ${connectorId}`);
    }

    return await connector.readResource(uri);
  }

  // Event handling
  on(event: string, listener: (event: ConnectorEvent) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  off(event: string, listener: (event: ConnectorEvent) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: Record<string, unknown>): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const connectorEvent: ConnectorEvent = {
        type: event,
        timestamp: Date.now(),
        ...data,
      };
      for (const listener of listeners) {
        try {
          listener(connectorEvent);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      }
    }
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connectors.values())
      .filter(connector => connector.isConnected())
      .map(connector => connector.disconnect().catch(console.error));

    await Promise.all(disconnectPromises);
  }

  getStatus(): ConnectorStatus[] {
    return Array.from(this.connectors.entries()).map(([id, connector]) => ({
      id,
      type: connector.type,
      connected: connector.isConnected(),
      capabilities: connector.capabilities,
    }));
  }
}

export interface ConnectorEvent {
  type: string;
  timestamp: number;
  connectorId?: string;
  [key: string]: unknown;
}

export interface ConnectorStatus {
  id: string;
  type: ConnectorType;
  connected: boolean;
  capabilities: {
    read: boolean;
    write: boolean;
    subscribe: boolean;
    search: boolean;
  };
}
