// GitHub MCP Connector
// packages/mcp/connectors/src/github-connector.ts

import { Octokit } from '@octokit/rest';
import {
  BaseConnector,
  GitHubConfig,
  ConnectorCapabilities,
  ConnectorResource,
  ConnectorTool,
} from './types';

export class GitHubConnector implements BaseConnector {
  readonly id: string;
  readonly type = 'github' as const;
  readonly capabilities: ConnectorCapabilities = {
    read: true,
    write: true,
    subscribe: true,
    search: true,
  };

  private config: GitHubConfig;
  private client: Octokit | null = null;
  private connected = false;

  constructor(config: GitHubConfig) {
    this.id = config.id;
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.config.credentials?.accessToken) {
      throw new Error('GitHub access token is required');
    }

    this.client = new Octokit({
      auth: this.config.credentials.accessToken,
    });

    // Test connection
    await this.client.users.getAuthenticated();
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
    const { owner, repo } = this.config.settings || {};

    if (owner && repo) {
      // List issues
      const issues = await this.client.issues.listForRepo({
        owner,
        repo,
        state: 'all',
        per_page: 50,
      });

      for (const issue of issues.data) {
        resources.push({
          uri: `github://issue/${owner}/${repo}/${issue.number}`,
          name: issue.title,
          type: issue.pull_request ? 'pull_request' : 'issue',
          description: issue.body?.substring(0, 200),
          metadata: {
            state: issue.state,
            labels: issue.labels.map((l: any) => (typeof l === 'string' ? l : l.name)),
            assignees: issue.assignees?.map((a: any) => a.login),
          },
        });
      }

      // List branches
      const branches = await this.client.repos.listBranches({
        owner,
        repo,
        per_page: 50,
      });

      for (const branch of branches.data) {
        resources.push({
          uri: `github://branch/${owner}/${repo}/${branch.name}`,
          name: branch.name,
          type: 'branch',
          metadata: {
            protected: branch.protected,
            sha: branch.commit.sha,
          },
        });
      }
    }

    return resources;
  }

  async readResource(uri: string): Promise<unknown> {
    if (!this.client) throw new Error('Not connected');

    // Parse issue URI
    const issueMatch = uri.match(/^github:\/\/issue\/([^/]+)\/([^/]+)\/(\d+)$/);
    if (issueMatch) {
      const [, owner, repo, number] = issueMatch;
      const issue = await this.client.issues.get({
        owner,
        repo,
        issue_number: parseInt(number, 10),
      });
      return issue.data;
    }

    // Parse PR URI
    const prMatch = uri.match(/^github:\/\/pr\/([^/]+)\/([^/]+)\/(\d+)$/);
    if (prMatch) {
      const [, owner, repo, number] = prMatch;
      const pr = await this.client.pulls.get({
        owner,
        repo,
        pull_number: parseInt(number, 10),
      });
      return pr.data;
    }

    // Parse file URI
    const fileMatch = uri.match(/^github:\/\/file\/([^/]+)\/([^/]+)\/(.+)$/);
    if (fileMatch) {
      const [, owner, repo, path] = fileMatch;
      const file = await this.client.repos.getContent({
        owner,
        repo,
        path,
      });
      return file.data;
    }

    throw new Error('Invalid GitHub resource URI');
  }

  listTools(): ConnectorTool[] {
    return [
      {
        name: 'github_create_issue',
        description: 'Create a new GitHub issue',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            title: { type: 'string', description: 'Issue title' },
            body: { type: 'string', description: 'Issue body' },
            labels: { type: 'array', items: { type: 'string' }, description: 'Labels' },
            assignees: { type: 'array', items: { type: 'string' }, description: 'Assignees' },
          },
          required: ['owner', 'repo', 'title'],
        },
      },
      {
        name: 'github_create_pr',
        description: 'Create a new pull request',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            title: { type: 'string', description: 'PR title' },
            body: { type: 'string', description: 'PR body' },
            head: { type: 'string', description: 'Head branch' },
            base: { type: 'string', description: 'Base branch' },
          },
          required: ['owner', 'repo', 'title', 'head', 'base'],
        },
      },
      {
        name: 'github_search_code',
        description: 'Search for code in GitHub',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            per_page: { type: 'number', description: 'Results per page' },
          },
          required: ['query'],
        },
      },
      {
        name: 'github_get_file',
        description: 'Get file contents from a repository',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            path: { type: 'string', description: 'File path' },
            ref: { type: 'string', description: 'Branch or commit ref' },
          },
          required: ['owner', 'repo', 'path'],
        },
      },
      {
        name: 'github_create_comment',
        description: 'Create a comment on an issue or PR',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            issue_number: { type: 'number', description: 'Issue or PR number' },
            body: { type: 'string', description: 'Comment body' },
          },
          required: ['owner', 'repo', 'issue_number', 'body'],
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new Error('Not connected');

    const owner = (args.owner as string) || this.config.settings?.owner;
    const repo = (args.repo as string) || this.config.settings?.repo;

    switch (name) {
      case 'github_create_issue':
        return await this.client.issues.create({
          owner: owner!,
          repo: repo!,
          title: args.title as string,
          body: args.body as string,
          labels: args.labels as string[],
          assignees: args.assignees as string[],
        });

      case 'github_create_pr':
        return await this.client.pulls.create({
          owner: owner!,
          repo: repo!,
          title: args.title as string,
          body: args.body as string,
          head: args.head as string,
          base: args.base as string,
        });

      case 'github_search_code':
        return await this.client.search.code({
          q: args.query as string,
          per_page: (args.per_page as number) || 30,
        });

      case 'github_get_file':
        return await this.client.repos.getContent({
          owner: owner!,
          repo: repo!,
          path: args.path as string,
          ref: args.ref as string,
        });

      case 'github_create_comment':
        return await this.client.issues.createComment({
          owner: owner!,
          repo: repo!,
          issue_number: args.issue_number as number,
          body: args.body as string,
        });

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
