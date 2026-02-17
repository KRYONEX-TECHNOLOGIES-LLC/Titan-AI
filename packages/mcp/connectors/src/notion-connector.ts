// Notion MCP Connector
// packages/mcp/connectors/src/notion-connector.ts

import { Client } from '@notionhq/client';
import {
  BaseConnector,
  NotionConfig,
  ConnectorCapabilities,
  ConnectorResource,
  ConnectorTool,
} from './types';

export class NotionConnector implements BaseConnector {
  readonly id: string;
  readonly type = 'notion' as const;
  readonly capabilities: ConnectorCapabilities = {
    read: true,
    write: true,
    subscribe: false,
    search: true,
  };

  private config: NotionConfig;
  private client: Client | null = null;
  private connected = false;

  constructor(config: NotionConfig) {
    this.id = config.id;
    this.config = config;
  }

  async connect(): Promise<void> {
    const { accessToken } = this.config.credentials || {};

    if (!accessToken) {
      throw new Error('Notion integration token is required');
    }

    this.client = new Client({
      auth: accessToken,
    });

    // Test connection
    await this.client.users.me({});
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

    // Search for all accessible pages
    const pages = await this.client.search({
      filter: { property: 'object', value: 'page' },
      page_size: 50,
    });

    for (const page of pages.results) {
      if (page.object === 'page') {
        const p = page as any;
        const title = this.getPageTitle(p);
        resources.push({
          uri: `notion://page/${p.id}`,
          name: title,
          type: 'page',
          metadata: {
            createdTime: p.created_time,
            lastEditedTime: p.last_edited_time,
            url: p.url,
          },
        });
      }
    }

    // Search for all accessible databases
    const databases = await this.client.search({
      filter: { property: 'object', value: 'database' },
      page_size: 50,
    });

    for (const db of databases.results) {
      if (db.object === 'database') {
        const d = db as any;
        const title = d.title?.[0]?.plain_text || 'Untitled Database';
        resources.push({
          uri: `notion://database/${d.id}`,
          name: title,
          type: 'database',
          metadata: {
            createdTime: d.created_time,
            lastEditedTime: d.last_edited_time,
            url: d.url,
          },
        });
      }
    }

    return resources;
  }

  private getPageTitle(page: any): string {
    const titleProp = page.properties?.title || page.properties?.Name;
    if (titleProp?.title?.[0]?.plain_text) {
      return titleProp.title[0].plain_text;
    }
    return 'Untitled';
  }

  async readResource(uri: string): Promise<unknown> {
    if (!this.client) throw new Error('Not connected');

    const pageMatch = uri.match(/^notion:\/\/page\/(.+)$/);
    if (pageMatch) {
      const pageId = pageMatch[1];
      const page = await this.client.pages.retrieve({ page_id: pageId });
      const blocks = await this.client.blocks.children.list({ block_id: pageId });
      return { page, blocks: blocks.results };
    }

    const dbMatch = uri.match(/^notion:\/\/database\/(.+)$/);
    if (dbMatch) {
      const databaseId = dbMatch[1];
      const database = await this.client.databases.retrieve({ database_id: databaseId });
      const entries = await this.client.databases.query({ database_id: databaseId });
      return { database, entries: entries.results };
    }

    throw new Error('Invalid Notion resource URI');
  }

  listTools(): ConnectorTool[] {
    return [
      {
        name: 'notion_search',
        description: 'Search Notion for pages and databases',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            filter: { type: 'string', enum: ['page', 'database'], description: 'Filter by object type' },
          },
          required: ['query'],
        },
      },
      {
        name: 'notion_create_page',
        description: 'Create a new Notion page',
        inputSchema: {
          type: 'object',
          properties: {
            parentId: { type: 'string', description: 'Parent page or database ID' },
            parentType: { type: 'string', enum: ['page', 'database'], description: 'Parent type' },
            title: { type: 'string', description: 'Page title' },
            content: { type: 'string', description: 'Page content (markdown-like)' },
            properties: { type: 'object', description: 'Database properties (if parent is database)' },
          },
          required: ['parentId', 'parentType', 'title'],
        },
      },
      {
        name: 'notion_update_page',
        description: 'Update a Notion page properties',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Page ID' },
            properties: { type: 'object', description: 'Properties to update' },
          },
          required: ['pageId', 'properties'],
        },
      },
      {
        name: 'notion_append_blocks',
        description: 'Append content blocks to a page',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Page ID' },
            blocks: { type: 'array', description: 'Blocks to append' },
          },
          required: ['pageId', 'blocks'],
        },
      },
      {
        name: 'notion_query_database',
        description: 'Query a Notion database',
        inputSchema: {
          type: 'object',
          properties: {
            databaseId: { type: 'string', description: 'Database ID' },
            filter: { type: 'object', description: 'Filter conditions' },
            sorts: { type: 'array', description: 'Sort conditions' },
          },
          required: ['databaseId'],
        },
      },
      {
        name: 'notion_create_database_entry',
        description: 'Create a new entry in a Notion database',
        inputSchema: {
          type: 'object',
          properties: {
            databaseId: { type: 'string', description: 'Database ID' },
            properties: { type: 'object', description: 'Entry properties' },
          },
          required: ['databaseId', 'properties'],
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new Error('Not connected');

    switch (name) {
      case 'notion_search':
        return await this.client.search({
          query: args.query as string,
          filter: args.filter ? { property: 'object', value: args.filter as any } : undefined,
        });

      case 'notion_create_page': {
        const parent = args.parentType === 'database'
          ? { database_id: args.parentId as string }
          : { page_id: args.parentId as string };

        const properties: any = args.properties || {};
        if (args.parentType === 'page') {
          properties.title = {
            title: [{ text: { content: args.title as string } }],
          };
        } else {
          // For database, title property name varies
          properties.Name = {
            title: [{ text: { content: args.title as string } }],
          };
        }

        const children = args.content
          ? this.parseContentToBlocks(args.content as string)
          : [];

        return await this.client.pages.create({
          parent,
          properties,
          children: children as any,
        });
      }

      case 'notion_update_page':
        return await this.client.pages.update({
          page_id: args.pageId as string,
          properties: args.properties as any,
        });

      case 'notion_append_blocks':
        return await this.client.blocks.children.append({
          block_id: args.pageId as string,
          children: args.blocks as any,
        });

      case 'notion_query_database':
        return await this.client.databases.query({
          database_id: args.databaseId as string,
          filter: args.filter as any,
          sorts: args.sorts as any,
        });

      case 'notion_create_database_entry': {
        return await this.client.pages.create({
          parent: { database_id: args.databaseId as string },
          properties: args.properties as any,
        });
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private parseContentToBlocks(content: string): any[] {
    // Simple parser for markdown-like content
    const lines = content.split('\n');
    const blocks: any[] = [];

    for (const line of lines) {
      if (line.startsWith('# ')) {
        blocks.push({
          object: 'block',
          type: 'heading_1',
          heading_1: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] },
        });
      } else if (line.startsWith('## ')) {
        blocks.push({
          object: 'block',
          type: 'heading_2',
          heading_2: { rich_text: [{ type: 'text', text: { content: line.slice(3) } }] },
        });
      } else if (line.startsWith('### ')) {
        blocks.push({
          object: 'block',
          type: 'heading_3',
          heading_3: { rich_text: [{ type: 'text', text: { content: line.slice(4) } }] },
        });
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] },
        });
      } else if (/^\d+\. /.test(line)) {
        blocks.push({
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: { rich_text: [{ type: 'text', text: { content: line.replace(/^\d+\. /, '') } }] },
        });
      } else if (line.startsWith('> ')) {
        blocks.push({
          object: 'block',
          type: 'quote',
          quote: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] },
        });
      } else if (line.trim()) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: line } }] },
        });
      }
    }

    return blocks;
  }
}
