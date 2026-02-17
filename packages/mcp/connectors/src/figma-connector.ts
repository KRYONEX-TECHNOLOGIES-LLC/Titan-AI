// Figma MCP Connector
// packages/mcp/connectors/src/figma-connector.ts

import axios, { AxiosInstance } from 'axios';
import {
  BaseConnector,
  FigmaConfig,
  ConnectorCapabilities,
  ConnectorResource,
  ConnectorTool,
} from './types';

export interface FigmaFile {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  document: FigmaNode;
  components: Record<string, FigmaComponent>;
  styles: Record<string, FigmaStyle>;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
}

export interface FigmaComponent {
  key: string;
  name: string;
  description: string;
}

export interface FigmaStyle {
  key: string;
  name: string;
  styleType: string;
}

export class FigmaConnector implements BaseConnector {
  readonly id: string;
  readonly type = 'figma' as const;
  readonly capabilities: ConnectorCapabilities = {
    read: true,
    write: false, // Figma API is mostly read-only for design files
    subscribe: false,
    search: true,
  };

  private config: FigmaConfig;
  private client: AxiosInstance | null = null;
  private connected = false;

  constructor(config: FigmaConfig) {
    this.id = config.id;
    this.config = config;
  }

  async connect(): Promise<void> {
    const { accessToken } = this.config.credentials || {};

    if (!accessToken) {
      throw new Error('Figma access token is required');
    }

    this.client = axios.create({
      baseURL: 'https://api.figma.com/v1',
      headers: {
        'X-Figma-Token': accessToken,
      },
    });

    // Test connection
    await this.client.get('/me');
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
    const { teamId, projectId } = this.config.settings || {};

    if (teamId) {
      // List team projects
      const projects = await this.client.get(`/teams/${teamId}/projects`);
      for (const project of projects.data.projects) {
        resources.push({
          uri: `figma://project/${project.id}`,
          name: project.name,
          type: 'project',
          metadata: {
            teamId,
          },
        });
      }
    }

    if (projectId) {
      // List project files
      const files = await this.client.get(`/projects/${projectId}/files`);
      for (const file of files.data.files) {
        resources.push({
          uri: `figma://file/${file.key}`,
          name: file.name,
          type: 'file',
          description: `Last modified: ${file.last_modified}`,
          metadata: {
            thumbnailUrl: file.thumbnail_url,
            lastModified: file.last_modified,
          },
        });
      }
    }

    return resources;
  }

  async readResource(uri: string): Promise<unknown> {
    if (!this.client) throw new Error('Not connected');

    const fileMatch = uri.match(/^figma:\/\/file\/(.+)$/);
    if (fileMatch) {
      const fileKey = fileMatch[1];
      const response = await this.client.get(`/files/${fileKey}`);
      return response.data;
    }

    const nodeMatch = uri.match(/^figma:\/\/node\/([^/]+)\/(.+)$/);
    if (nodeMatch) {
      const [, fileKey, nodeId] = nodeMatch;
      const response = await this.client.get(`/files/${fileKey}/nodes`, {
        params: { ids: nodeId },
      });
      return response.data;
    }

    throw new Error('Invalid Figma resource URI');
  }

  listTools(): ConnectorTool[] {
    return [
      {
        name: 'figma_get_file',
        description: 'Get a Figma file by key',
        inputSchema: {
          type: 'object',
          properties: {
            fileKey: { type: 'string', description: 'Figma file key' },
            depth: { type: 'number', description: 'Depth of nodes to return' },
          },
          required: ['fileKey'],
        },
      },
      {
        name: 'figma_get_images',
        description: 'Export images from a Figma file',
        inputSchema: {
          type: 'object',
          properties: {
            fileKey: { type: 'string', description: 'Figma file key' },
            nodeIds: { type: 'array', items: { type: 'string' }, description: 'Node IDs to export' },
            format: { type: 'string', enum: ['png', 'jpg', 'svg', 'pdf'], description: 'Export format' },
            scale: { type: 'number', description: 'Export scale (0.01 to 4)' },
          },
          required: ['fileKey', 'nodeIds'],
        },
      },
      {
        name: 'figma_get_components',
        description: 'Get components from a Figma file',
        inputSchema: {
          type: 'object',
          properties: {
            fileKey: { type: 'string', description: 'Figma file key' },
          },
          required: ['fileKey'],
        },
      },
      {
        name: 'figma_get_styles',
        description: 'Get styles from a Figma file',
        inputSchema: {
          type: 'object',
          properties: {
            fileKey: { type: 'string', description: 'Figma file key' },
          },
          required: ['fileKey'],
        },
      },
      {
        name: 'figma_get_comments',
        description: 'Get comments on a Figma file',
        inputSchema: {
          type: 'object',
          properties: {
            fileKey: { type: 'string', description: 'Figma file key' },
          },
          required: ['fileKey'],
        },
      },
      {
        name: 'figma_post_comment',
        description: 'Post a comment on a Figma file',
        inputSchema: {
          type: 'object',
          properties: {
            fileKey: { type: 'string', description: 'Figma file key' },
            message: { type: 'string', description: 'Comment message' },
            nodeId: { type: 'string', description: 'Node ID to attach comment to' },
          },
          required: ['fileKey', 'message'],
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new Error('Not connected');

    switch (name) {
      case 'figma_get_file':
        return await this.client.get(`/files/${args.fileKey}`, {
          params: { depth: args.depth },
        });

      case 'figma_get_images':
        return await this.client.get(`/images/${args.fileKey}`, {
          params: {
            ids: (args.nodeIds as string[]).join(','),
            format: args.format || 'png',
            scale: args.scale || 1,
          },
        });

      case 'figma_get_components':
        const file = await this.client.get(`/files/${args.fileKey}`);
        return file.data.components;

      case 'figma_get_styles':
        const fileStyles = await this.client.get(`/files/${args.fileKey}`);
        return fileStyles.data.styles;

      case 'figma_get_comments':
        return await this.client.get(`/files/${args.fileKey}/comments`);

      case 'figma_post_comment':
        return await this.client.post(`/files/${args.fileKey}/comments`, {
          message: args.message,
          client_meta: args.nodeId ? { node_id: args.nodeId } : undefined,
        });

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
