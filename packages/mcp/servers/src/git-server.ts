/**
 * MCP Git Server
 */

import simpleGit, { SimpleGit } from 'simple-git';
import type { MCPServer, MCPServerConfig, MCPTool, MCPToolResult } from './types';

export class GitServer implements MCPServer {
  config: MCPServerConfig = {
    id: 'git',
    name: 'Git Server',
    version: '1.0.0',
    capabilities: ['tools'],
  };

  private git: SimpleGit;
  private rootPath: string;
  tools: MCPTool[];

  constructor(rootPath: string = process.cwd()) {
    this.rootPath = rootPath;
    this.git = simpleGit(rootPath);
    this.tools = this.createTools();
  }

  async initialize(): Promise<void> {
    // Verify git repository
    const isRepo = await this.git.checkIsRepo();
    if (!isRepo) {
      console.warn('Not a git repository:', this.rootPath);
    }
  }

  async shutdown(): Promise<void> {}

  private createTools(): MCPTool[] {
    return [
      {
        name: 'git_status',
        description: 'Get the current git status',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => this.getStatus(),
      },
      {
        name: 'git_diff',
        description: 'Get the diff of changes',
        inputSchema: {
          type: 'object',
          properties: {
            staged: { type: 'boolean', description: 'Show staged changes only' },
            file: { type: 'string', description: 'Specific file to diff' },
          },
        },
        handler: async (input) => this.getDiff(input.staged as boolean, input.file as string),
      },
      {
        name: 'git_log',
        description: 'Get commit history',
        inputSchema: {
          type: 'object',
          properties: {
            count: { type: 'number', description: 'Number of commits to show' },
            file: { type: 'string', description: 'Show history for specific file' },
          },
        },
        handler: async (input) => this.getLog(input.count as number, input.file as string),
      },
      {
        name: 'git_commit',
        description: 'Create a commit with staged changes',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Commit message' },
          },
          required: ['message'],
        },
        handler: async (input) => this.commit(input.message as string),
      },
      {
        name: 'git_add',
        description: 'Stage files for commit',
        inputSchema: {
          type: 'object',
          properties: {
            files: { type: 'array', items: { type: 'string' }, description: 'Files to stage' },
          },
          required: ['files'],
        },
        handler: async (input) => this.add(input.files as string[]),
      },
      {
        name: 'git_branch',
        description: 'List, create, or switch branches',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'create', 'switch'], description: 'Action to perform' },
            name: { type: 'string', description: 'Branch name (for create/switch)' },
          },
          required: ['action'],
        },
        handler: async (input) => this.branch(input.action as string, input.name as string),
      },
      {
        name: 'git_stash',
        description: 'Stash or restore changes',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['push', 'pop', 'list'], description: 'Action to perform' },
            message: { type: 'string', description: 'Stash message (for push)' },
          },
          required: ['action'],
        },
        handler: async (input) => this.stash(input.action as string, input.message as string),
      },
      {
        name: 'git_reset',
        description: 'Reset changes',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'File to reset (or all if omitted)' },
            hard: { type: 'boolean', description: 'Hard reset' },
          },
        },
        handler: async (input) => this.reset(input.file as string, input.hard as boolean),
      },
    ];
  }

  private async getStatus(): Promise<MCPToolResult> {
    try {
      const status = await this.git.status();
      const lines = [
        `Branch: ${status.current}`,
        `Ahead: ${status.ahead}, Behind: ${status.behind}`,
        '',
        'Staged:',
        ...status.staged.map(f => `  + ${f}`),
        '',
        'Modified:',
        ...status.modified.map(f => `  M ${f}`),
        '',
        'Untracked:',
        ...status.not_added.map(f => `  ? ${f}`),
      ];

      if (status.conflicted.length > 0) {
        lines.push('', 'Conflicts:', ...status.conflicted.map(f => `  ! ${f}`));
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async getDiff(staged?: boolean, file?: string): Promise<MCPToolResult> {
    try {
      const args = staged ? ['--cached'] : [];
      if (file) args.push('--', file);
      
      const diff = await this.git.diff(args);
      return { content: [{ type: 'text', text: diff || 'No changes' }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async getLog(count: number = 10, file?: string): Promise<MCPToolResult> {
    try {
      const options: Record<string, unknown> = { maxCount: count };
      if (file) options.file = file;
      
      const log = await this.git.log(options);
      
      const lines = log.all.map(commit => 
        `${commit.hash.substring(0, 7)} ${commit.date} ${commit.author_name}\n  ${commit.message}`
      );

      return { content: [{ type: 'text', text: lines.join('\n\n') }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async commit(message: string): Promise<MCPToolResult> {
    try {
      const result = await this.git.commit(message);
      return { 
        content: [{ 
          type: 'text', 
          text: `Committed: ${result.commit}\nChanged: ${result.summary.changes} files, +${result.summary.insertions} -${result.summary.deletions}` 
        }] 
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async add(files: string[]): Promise<MCPToolResult> {
    try {
      await this.git.add(files);
      return { content: [{ type: 'text', text: `Staged: ${files.join(', ')}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async branch(action: string, name?: string): Promise<MCPToolResult> {
    try {
      switch (action) {
        case 'list': {
          const branches = await this.git.branch();
          const lines = Object.entries(branches.branches).map(([branchName, info]) => 
            `${info.current ? '* ' : '  '}${branchName}`
          );
          return { content: [{ type: 'text', text: lines.join('\n') }] };
        }
        case 'create': {
          if (!name) return { content: [{ type: 'text', text: 'Branch name required' }], isError: true };
          await this.git.checkoutLocalBranch(name);
          return { content: [{ type: 'text', text: `Created and switched to branch: ${name}` }] };
        }
        case 'switch': {
          if (!name) return { content: [{ type: 'text', text: 'Branch name required' }], isError: true };
          await this.git.checkout(name);
          return { content: [{ type: 'text', text: `Switched to branch: ${name}` }] };
        }
        default:
          return { content: [{ type: 'text', text: `Unknown action: ${action}` }], isError: true };
      }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async stash(action: string, message?: string): Promise<MCPToolResult> {
    try {
      switch (action) {
        case 'push': {
          if (message) {
            await this.git.stash(['push', '-m', message]);
          } else {
            await this.git.stash();
          }
          return { content: [{ type: 'text', text: 'Changes stashed' }] };
        }
        case 'pop': {
          await this.git.stash(['pop']);
          return { content: [{ type: 'text', text: 'Stash applied and removed' }] };
        }
        case 'list': {
          const list = await this.git.stashList();
          const lines = list.all.map((s, i) => `stash@{${i}}: ${s.message}`);
          return { content: [{ type: 'text', text: lines.join('\n') || 'No stashes' }] };
        }
        default:
          return { content: [{ type: 'text', text: `Unknown action: ${action}` }], isError: true };
      }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }

  private async reset(file?: string, hard?: boolean): Promise<MCPToolResult> {
    try {
      if (file) {
        await this.git.checkout(['--', file]);
        return { content: [{ type: 'text', text: `Reset: ${file}` }] };
      } else if (hard) {
        await this.git.reset(['--hard', 'HEAD']);
        return { content: [{ type: 'text', text: 'Hard reset to HEAD' }] };
      } else {
        await this.git.reset(['HEAD']);
        return { content: [{ type: 'text', text: 'Reset staged changes' }] };
      }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
    }
  }
}

export function createGitServer(rootPath?: string): GitServer {
  return new GitServer(rootPath);
}
