// Jira MCP Connector
// packages/mcp/connectors/src/jira-connector.ts

import axios, { AxiosInstance } from 'axios';
import {
  BaseConnector,
  JiraConfig,
  ConnectorCapabilities,
  ConnectorResource,
  ConnectorTool,
} from './types';

export interface JiraIssue {
  key: string;
  id: string;
  self: string;
  fields: {
    summary: string;
    description?: string;
    status: { name: string };
    priority?: { name: string };
    assignee?: { displayName: string; emailAddress: string };
    reporter?: { displayName: string; emailAddress: string };
    issuetype: { name: string };
    project: { key: string; name: string };
    created: string;
    updated: string;
  };
}

export class JiraConnector implements BaseConnector {
  readonly id: string;
  readonly type = 'jira' as const;
  readonly capabilities: ConnectorCapabilities = {
    read: true,
    write: true,
    subscribe: false,
    search: true,
  };

  private config: JiraConfig;
  private client: AxiosInstance | null = null;
  private connected = false;

  constructor(config: JiraConfig) {
    this.id = config.id;
    this.config = config;
  }

  async connect(): Promise<void> {
    const { baseUrl } = this.config.settings;
    const { email } = this.config.settings;
    const { apiKey } = this.config.credentials || {};

    if (!baseUrl || !email || !apiKey) {
      throw new Error('Jira baseUrl, email, and API key are required');
    }

    this.client = axios.create({
      baseURL: `${baseUrl}/rest/api/3`,
      auth: {
        username: email,
        password: apiKey,
      },
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    // Test connection
    await this.client.get('/myself');
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
    const { projectKey } = this.config.settings;

    if (projectKey) {
      // Get project issues
      const jql = `project = ${projectKey} ORDER BY updated DESC`;
      const response = await this.client.get('/search', {
        params: { jql, maxResults: 50, fields: 'summary,status,priority,assignee,issuetype' },
      });

      for (const issue of response.data.issues) {
        resources.push({
          uri: `jira://issue/${issue.key}`,
          name: `${issue.key}: ${issue.fields.summary}`,
          type: issue.fields.issuetype.name.toLowerCase(),
          description: issue.fields.summary,
          metadata: {
            status: issue.fields.status?.name,
            priority: issue.fields.priority?.name,
            assignee: issue.fields.assignee?.displayName,
          },
        });
      }
    }

    // List projects
    const projects = await this.client.get('/project');
    for (const project of projects.data) {
      resources.push({
        uri: `jira://project/${project.key}`,
        name: project.name,
        type: 'project',
        metadata: {
          id: project.id,
          style: project.style,
        },
      });
    }

    return resources;
  }

  async readResource(uri: string): Promise<JiraIssue | unknown> {
    if (!this.client) throw new Error('Not connected');

    const issueMatch = uri.match(/^jira:\/\/issue\/(.+)$/);
    if (issueMatch) {
      const issueKey = issueMatch[1];
      const response = await this.client.get(`/issue/${issueKey}`);
      return response.data;
    }

    const projectMatch = uri.match(/^jira:\/\/project\/(.+)$/);
    if (projectMatch) {
      const projectKey = projectMatch[1];
      const response = await this.client.get(`/project/${projectKey}`);
      return response.data;
    }

    throw new Error('Invalid Jira resource URI');
  }

  listTools(): ConnectorTool[] {
    return [
      {
        name: 'jira_create_issue',
        description: 'Create a new Jira issue',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Project key' },
            summary: { type: 'string', description: 'Issue summary' },
            description: { type: 'string', description: 'Issue description' },
            issuetype: { type: 'string', description: 'Issue type (Bug, Story, Task, etc.)' },
            priority: { type: 'string', description: 'Priority (Highest, High, Medium, Low, Lowest)' },
            assignee: { type: 'string', description: 'Assignee account ID' },
          },
          required: ['project', 'summary', 'issuetype'],
        },
      },
      {
        name: 'jira_update_issue',
        description: 'Update an existing Jira issue',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Issue key (e.g., PROJ-123)' },
            summary: { type: 'string', description: 'New summary' },
            description: { type: 'string', description: 'New description' },
            status: { type: 'string', description: 'New status' },
          },
          required: ['issueKey'],
        },
      },
      {
        name: 'jira_search',
        description: 'Search for Jira issues using JQL',
        inputSchema: {
          type: 'object',
          properties: {
            jql: { type: 'string', description: 'JQL query' },
            maxResults: { type: 'number', description: 'Maximum results' },
          },
          required: ['jql'],
        },
      },
      {
        name: 'jira_add_comment',
        description: 'Add a comment to a Jira issue',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Issue key' },
            body: { type: 'string', description: 'Comment body' },
          },
          required: ['issueKey', 'body'],
        },
      },
      {
        name: 'jira_transition_issue',
        description: 'Transition an issue to a new status',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Issue key' },
            transitionId: { type: 'string', description: 'Transition ID' },
            comment: { type: 'string', description: 'Optional comment' },
          },
          required: ['issueKey', 'transitionId'],
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new Error('Not connected');

    switch (name) {
      case 'jira_create_issue':
        return await this.client.post('/issue', {
          fields: {
            project: { key: args.project },
            summary: args.summary,
            description: args.description ? {
              type: 'doc',
              version: 1,
              content: [{ type: 'paragraph', content: [{ type: 'text', text: args.description }] }],
            } : undefined,
            issuetype: { name: args.issuetype },
            priority: args.priority ? { name: args.priority } : undefined,
            assignee: args.assignee ? { accountId: args.assignee } : undefined,
          },
        });

      case 'jira_update_issue':
        return await this.client.put(`/issue/${args.issueKey}`, {
          fields: {
            summary: args.summary,
            description: args.description ? {
              type: 'doc',
              version: 1,
              content: [{ type: 'paragraph', content: [{ type: 'text', text: args.description }] }],
            } : undefined,
          },
        });

      case 'jira_search':
        return await this.client.get('/search', {
          params: {
            jql: args.jql,
            maxResults: args.maxResults || 50,
          },
        });

      case 'jira_add_comment':
        return await this.client.post(`/issue/${args.issueKey}/comment`, {
          body: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: args.body }] }],
          },
        });

      case 'jira_transition_issue':
        return await this.client.post(`/issue/${args.issueKey}/transitions`, {
          transition: { id: args.transitionId },
          update: args.comment ? {
            comment: [{ add: { body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: args.comment }] }] } } }],
          } : undefined,
        });

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
