// MCP Connector Types
// packages/mcp/connectors/src/types.ts

export interface ConnectorConfig {
  id: string;
  name: string;
  type: ConnectorType;
  enabled: boolean;
  credentials?: ConnectorCredentials;
  settings?: Record<string, unknown>;
}

export type ConnectorType = 'slack' | 'github' | 'jira' | 'figma' | 'notion' | 'custom';

export interface ConnectorCredentials {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  webhookUrl?: string;
  baseUrl?: string;
}

export interface ConnectorCapabilities {
  read: boolean;
  write: boolean;
  subscribe: boolean;
  search: boolean;
}

export interface ConnectorResource {
  uri: string;
  name: string;
  type: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectorTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ConnectorMessage {
  id: string;
  channel?: string;
  content: string;
  author?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface SlackConfig extends ConnectorConfig {
  type: 'slack';
  settings: {
    defaultChannel?: string;
    botName?: string;
    allowedChannels?: string[];
  };
}

export interface GitHubConfig extends ConnectorConfig {
  type: 'github';
  settings: {
    owner?: string;
    repo?: string;
    defaultBranch?: string;
  };
}

export interface JiraConfig extends ConnectorConfig {
  type: 'jira';
  settings: {
    projectKey?: string;
    baseUrl: string;
    email?: string;
  };
}

export interface FigmaConfig extends ConnectorConfig {
  type: 'figma';
  settings: {
    teamId?: string;
    projectId?: string;
  };
}

export interface NotionConfig extends ConnectorConfig {
  type: 'notion';
  settings: {
    workspaceId?: string;
    databaseId?: string;
  };
}

export interface BaseConnector {
  readonly id: string;
  readonly type: ConnectorType;
  readonly capabilities: ConnectorCapabilities;
  
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  listResources(): Promise<ConnectorResource[]>;
  readResource(uri: string): Promise<unknown>;
  
  listTools(): ConnectorTool[];
  executeTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}
