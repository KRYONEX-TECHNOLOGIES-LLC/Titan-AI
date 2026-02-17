// Slack MCP Connector
// packages/mcp/connectors/src/slack-connector.ts

import {
  BaseConnector,
  SlackConfig,
  ConnectorCapabilities,
  ConnectorResource,
  ConnectorTool,
  ConnectorMessage,
} from './types';

export class SlackConnector implements BaseConnector {
  readonly id: string;
  readonly type = 'slack' as const;
  readonly capabilities: ConnectorCapabilities = {
    read: true,
    write: true,
    subscribe: true,
    search: true,
  };

  private config: SlackConfig;
  private client: any = null;
  private connected = false;

  constructor(config: SlackConfig) {
    this.id = config.id;
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.config.credentials?.accessToken) {
      throw new Error('Slack access token is required');
    }

    // Dynamic import to avoid bundling issues
    const { WebClient } = await import('@slack/web-api');
    this.client = new WebClient(this.config.credentials.accessToken);

    // Test connection
    const auth = await this.client.auth.test();
    if (!auth.ok) {
      throw new Error('Failed to authenticate with Slack');
    }

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async listResources(): Promise<ConnectorResource[]> {
    if (!this.client) throw new Error('Not connected');

    const resources: ConnectorResource[] = [];

    // List channels
    const channels = await this.client.conversations.list({
      types: 'public_channel,private_channel',
    });

    for (const channel of channels.channels || []) {
      resources.push({
        uri: `slack://channel/${channel.id}`,
        name: channel.name || channel.id,
        type: 'channel',
        description: channel.purpose?.value,
        metadata: {
          memberCount: channel.num_members,
          isPrivate: channel.is_private,
        },
      });
    }

    return resources;
  }

  async readResource(uri: string): Promise<ConnectorMessage[]> {
    if (!this.client) throw new Error('Not connected');

    const match = uri.match(/^slack:\/\/channel\/(.+)$/);
    if (!match) throw new Error('Invalid Slack resource URI');

    const channelId = match[1];
    const result = await this.client.conversations.history({
      channel: channelId,
      limit: 100,
    });

    return (result.messages || []).map((msg: any) => ({
      id: msg.ts,
      channel: channelId,
      content: msg.text || '',
      author: msg.user,
      timestamp: new Date(parseFloat(msg.ts) * 1000),
      metadata: {
        reactions: msg.reactions,
        threadTs: msg.thread_ts,
      },
    }));
  }

  listTools(): ConnectorTool[] {
    return [
      {
        name: 'slack_send_message',
        description: 'Send a message to a Slack channel',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel ID or name' },
            text: { type: 'string', description: 'Message text' },
            thread_ts: { type: 'string', description: 'Thread timestamp for replies' },
          },
          required: ['channel', 'text'],
        },
      },
      {
        name: 'slack_search_messages',
        description: 'Search for messages in Slack',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            count: { type: 'number', description: 'Number of results' },
          },
          required: ['query'],
        },
      },
      {
        name: 'slack_list_channels',
        description: 'List all accessible Slack channels',
        inputSchema: {
          type: 'object',
          properties: {
            types: { type: 'string', description: 'Channel types (public_channel, private_channel)' },
          },
        },
      },
      {
        name: 'slack_get_user_info',
        description: 'Get information about a Slack user',
        inputSchema: {
          type: 'object',
          properties: {
            user_id: { type: 'string', description: 'User ID' },
          },
          required: ['user_id'],
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new Error('Not connected');

    switch (name) {
      case 'slack_send_message':
        return await this.client.chat.postMessage({
          channel: args.channel as string,
          text: args.text as string,
          thread_ts: args.thread_ts as string | undefined,
        });

      case 'slack_search_messages':
        return await this.client.search.messages({
          query: args.query as string,
          count: (args.count as number) || 20,
        });

      case 'slack_list_channels':
        return await this.client.conversations.list({
          types: (args.types as string) || 'public_channel,private_channel',
        });

      case 'slack_get_user_info':
        return await this.client.users.info({
          user: args.user_id as string,
        });

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
