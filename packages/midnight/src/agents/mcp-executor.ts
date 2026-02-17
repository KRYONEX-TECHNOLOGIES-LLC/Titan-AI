/**
 * Project Midnight - MCP Tool Executor
 * Maps Actor tool calls to MCP (Model Context Protocol) tools for execution
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolExecutor } from './actor.js';
import type { SandboxedToolExecutor } from './sandboxed-executor.js';

/**
 * MCP Tool interface (from @titan/mcp)
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP Tool Result
 */
export interface MCPToolResult {
  content: Array<{ type: string; text: string }>;
  isError: boolean;
}

/**
 * MCP Server interface for tool execution
 */
export interface IMCPServer {
  executeTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult>;
  getTools(): MCPTool[];
}

/**
 * Configuration for MCPToolExecutor
 */
export interface MCPExecutorConfig {
  workspacePath: string;
  sandboxExecutor?: SandboxedToolExecutor;
  mcpServer?: IMCPServer;
}

/**
 * MCP Tool Executor
 * Routes Actor tool calls through MCP protocol or fallback implementations
 */
export class MCPToolExecutor implements ToolExecutor {
  private config: MCPExecutorConfig;
  private mcpServer: IMCPServer | null = null;
  private initialized = false;

  constructor(config: MCPExecutorConfig) {
    this.config = config;
    this.mcpServer = config.mcpServer ?? null;
  }

  /**
   * Initialize MCP server connection (lazy)
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!this.mcpServer) {
      try {
        // Try to dynamically import @titan/mcp and create a server
        const mcp = await import('@titan/mcp');
        
        // Create a local MCP server for tool execution
        this.mcpServer = this.createLocalMCPServer(mcp);
      } catch (error) {
        console.warn('MCP server not available, using built-in implementations:', error);
      }
    }

    this.initialized = true;
  }

  /**
   * Create a local MCP server with built-in tools
   */
  private createLocalMCPServer(mcp: any): IMCPServer {
    const tools = mcp.builtInTools || [];
    
    return {
      getTools: () => tools,
      executeTool: async (name: string, args: Record<string, unknown>) => {
        // Route to our implementations
        const result = await this.executeBuiltInTool(name, args);
        return {
          content: [{ type: 'text', text: result }],
          isError: result.startsWith('Error:'),
        };
      },
    };
  }

  /**
   * Execute a tool call
   */
  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    await this.initialize();

    // Try MCP server first
    if (this.mcpServer) {
      try {
        const result = await this.mcpServer.executeTool(name, args);
        return result.content.map(c => c.text).join('\n');
      } catch (error) {
        console.warn(`MCP tool ${name} failed, falling back:`, error);
      }
    }

    // Fall back to built-in implementations
    return this.executeBuiltInTool(name, args);
  }

  /**
   * Execute a built-in tool implementation
   */
  private async executeBuiltInTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    // Map tool names to implementations
    switch (name) {
      // File system tools
      case 'read_file':
      case 'filesystem':
        if (args.action === 'read' || name === 'read_file') {
          return this.readFile(args.path as string);
        }
        if (args.action === 'write') {
          return this.writeFile(args.path as string, args.content as string);
        }
        if (args.action === 'delete') {
          return this.deleteFile(args.path as string);
        }
        if (args.action === 'list') {
          return this.listDirectory(args.path as string);
        }
        if (args.action === 'search') {
          return this.searchFiles(args.path as string, args.pattern as string);
        }
        return `Error: Unknown filesystem action: ${args.action}`;

      case 'write_file':
        return this.writeFile(args.path as string, args.content as string);

      // Git tools
      case 'git_diff':
      case 'git':
        if (args.action === 'diff' || name === 'git_diff') {
          return this.gitDiff(args.staged as boolean);
        }
        if (args.action === 'status') {
          return this.gitStatus();
        }
        if (args.action === 'log') {
          return this.gitLog(args.args as string);
        }
        if (args.action === 'commit') {
          return this.gitCommit(args.args as string);
        }
        return `Error: Unknown git action: ${args.action}`;

      case 'git_commit':
        return this.gitCommit(args.message as string, args.files as string[]);

      // Terminal/command tools
      case 'run_command':
      case 'terminal':
        return this.runCommand(
          args.command as string,
          args.cwd as string,
          args.timeout as number
        );

      case 'run_tests':
        return this.runTests(args.pattern as string);

      case 'task_complete':
        return this.taskComplete(args.summary as string);

      default:
        return `Error: Unknown tool: ${name}`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FILE SYSTEM IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Read a file
   */
  private async readFile(filePath: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      return content;
    } catch (error) {
      return `Error reading file: ${error}`;
    }
  }

  /**
   * Write a file
   */
  private async writeFile(filePath: string, content: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    
    try {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
      return `Successfully wrote ${content.length} characters to ${filePath}`;
    } catch (error) {
      return `Error writing file: ${error}`;
    }
  }

  /**
   * Delete a file
   */
  private async deleteFile(filePath: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    
    try {
      await fs.unlink(fullPath);
      return `Successfully deleted ${filePath}`;
    } catch (error) {
      return `Error deleting file: ${error}`;
    }
  }

  /**
   * List directory contents
   */
  private async listDirectory(dirPath: string): Promise<string> {
    const fullPath = this.resolvePath(dirPath);
    
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const lines = entries.map(e => {
        const type = e.isDirectory() ? '[DIR]' : '[FILE]';
        return `${type} ${e.name}`;
      });
      return lines.join('\n') || '(empty directory)';
    } catch (error) {
      return `Error listing directory: ${error}`;
    }
  }

  /**
   * Search for files matching a pattern
   */
  private async searchFiles(dirPath: string, pattern: string): Promise<string> {
    const fullPath = this.resolvePath(dirPath);
    const results: string[] = [];
    const regex = new RegExp(pattern, 'i');

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 10) return; // Max depth
      
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const entryPath = path.join(dir, entry.name);
          const relativePath = path.relative(fullPath, entryPath);
          
          if (regex.test(entry.name)) {
            results.push(relativePath);
          }
          
          if (entry.isDirectory() && 
              !entry.name.startsWith('.') && 
              entry.name !== 'node_modules') {
            await walk(entryPath, depth + 1);
          }
        }
      } catch {
        // Skip directories we can't read
      }
    };

    await walk(fullPath, 0);
    return results.join('\n') || '(no matches)';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GIT IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get git diff
   */
  private async gitDiff(staged?: boolean): Promise<string> {
    return this.runCommand(staged ? 'git diff --staged' : 'git diff');
  }

  /**
   * Get git status
   */
  private async gitStatus(): Promise<string> {
    return this.runCommand('git status');
  }

  /**
   * Get git log
   */
  private async gitLog(args?: string): Promise<string> {
    const cmd = args ? `git log ${args}` : 'git log --oneline -20';
    return this.runCommand(cmd);
  }

  /**
   * Git commit
   */
  private async gitCommit(messageOrArgs: string, files?: string[]): Promise<string> {
    let command: string;
    
    if (files && files.length > 0) {
      const fileList = files.map(f => `"${f}"`).join(' ');
      command = `git add ${fileList} && git commit -m "${messageOrArgs.replace(/"/g, '\\"')}"`;
    } else if (messageOrArgs.startsWith('-')) {
      // Treat as args
      command = `git commit ${messageOrArgs}`;
    } else {
      // Treat as message
      command = `git add -A && git commit -m "${messageOrArgs.replace(/"/g, '\\"')}"`;
    }
    
    return this.runCommand(command);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TERMINAL/COMMAND IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Run a command
   */
  private async runCommand(
    command: string,
    cwd?: string,
    timeout?: number
  ): Promise<string> {
    // If we have a sandbox executor, use it
    if (this.config.sandboxExecutor) {
      return this.config.sandboxExecutor.execute('run_command', {
        command,
        cwd,
      });
    }

    // Otherwise run natively
    const { spawn } = await import('child_process');
    const workdir = cwd ? this.resolvePath(cwd) : this.config.workspacePath;
    const timeoutMs = timeout ?? 30000;

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      const proc = spawn('sh', ['-c', command], {
        cwd: workdir,
        env: process.env,
      });

      const timer = setTimeout(() => {
        killed = true;
        proc.kill('SIGKILL');
      }, timeoutMs);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        
        let result = stdout;
        if (stderr) {
          result += result ? '\n' : '';
          result += `[stderr] ${stderr}`;
        }
        if (killed) {
          result += result ? '\n' : '';
          result += `[timeout] Command killed after ${timeoutMs}ms`;
        }
        if (code !== 0) {
          result += result ? '\n' : '';
          result += `[exit code] ${code}`;
        }
        
        resolve(result || '(no output)');
      });

      proc.on('error', (error) => {
        clearTimeout(timer);
        resolve(`Error: ${error.message}`);
      });
    });
  }

  /**
   * Run tests
   */
  private async runTests(pattern?: string): Promise<string> {
    let command = 'npm test';
    if (pattern) {
      command = `npm test -- --testPathPattern="${pattern}"`;
    }
    return this.runCommand(command);
  }

  /**
   * Signal task completion
   */
  private async taskComplete(summary: string): Promise<string> {
    return `Task completed successfully.\n\nSummary: ${summary}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Resolve a path relative to workspace
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.config.workspacePath, filePath);
  }

  /**
   * Get available tools
   */
  async getAvailableTools(): Promise<MCPTool[]> {
    await this.initialize();
    
    if (this.mcpServer) {
      return this.mcpServer.getTools();
    }

    // Return built-in tool definitions
    return [
      {
        name: 'read_file',
        description: 'Read the contents of a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path relative to workspace' },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Write content to a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path relative to workspace' },
            content: { type: 'string', description: 'Content to write' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'run_command',
        description: 'Execute a shell command',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Command to execute' },
            cwd: { type: 'string', description: 'Working directory' },
            timeout: { type: 'number', description: 'Timeout in milliseconds' },
          },
          required: ['command'],
        },
      },
      {
        name: 'git_diff',
        description: 'Get git diff of changes',
        inputSchema: {
          type: 'object',
          properties: {
            staged: { type: 'boolean', description: 'Show only staged changes' },
          },
        },
      },
      {
        name: 'git_commit',
        description: 'Stage and commit changes',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Commit message' },
            files: { type: 'array', items: { type: 'string' }, description: 'Files to stage' },
          },
          required: ['message'],
        },
      },
      {
        name: 'run_tests',
        description: 'Run test suite',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Test file pattern' },
          },
        },
      },
      {
        name: 'task_complete',
        description: 'Signal task completion',
        inputSchema: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: 'Summary of changes made' },
          },
          required: ['summary'],
        },
      },
    ];
  }
}

/**
 * Create an MCP Tool Executor
 */
export function createMCPExecutor(
  workspacePath: string,
  sandboxExecutor?: SandboxedToolExecutor
): MCPToolExecutor {
  return new MCPToolExecutor({
    workspacePath,
    sandboxExecutor,
  });
}
