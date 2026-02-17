/**
 * MCP Terminal Server
 */

import { spawn, ChildProcess } from 'child_process';
import * as os from 'os';
import type { MCPServer, MCPServerConfig, MCPTool, MCPToolResult } from './types';

export class TerminalServer implements MCPServer {
  config: MCPServerConfig = {
    id: 'terminal',
    name: 'Terminal Server',
    version: '1.0.0',
    capabilities: ['tools'],
  };

  private cwd: string;
  private env: Record<string, string>;
  private activeProcesses: Map<string, ChildProcess> = new Map();
  tools: MCPTool[];

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    this.env = { ...process.env } as Record<string, string>;
    this.tools = this.createTools();
  }

  async initialize(): Promise<void> {}

  async shutdown(): Promise<void> {
    // Kill all active processes
    for (const [id, proc] of this.activeProcesses) {
      proc.kill();
      this.activeProcesses.delete(id);
    }
  }

  private createTools(): MCPTool[] {
    return [
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
        handler: async (input) => this.runCommand(
          input.command as string,
          input.cwd as string,
          input.timeout as number
        ),
      },
      {
        name: 'run_background',
        description: 'Start a background process',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Command to execute' },
            id: { type: 'string', description: 'Process identifier' },
          },
          required: ['command', 'id'],
        },
        handler: async (input) => this.runBackground(input.command as string, input.id as string),
      },
      {
        name: 'kill_process',
        description: 'Kill a background process',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Process identifier' },
          },
          required: ['id'],
        },
        handler: async (input) => this.killProcess(input.id as string),
      },
      {
        name: 'list_processes',
        description: 'List running background processes',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => this.listProcesses(),
      },
      {
        name: 'get_env',
        description: 'Get environment variable',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Variable name' },
          },
          required: ['name'],
        },
        handler: async (input) => this.getEnv(input.name as string),
      },
      {
        name: 'set_env',
        description: 'Set environment variable',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Variable name' },
            value: { type: 'string', description: 'Variable value' },
          },
          required: ['name', 'value'],
        },
        handler: async (input) => this.setEnv(input.name as string, input.value as string),
      },
      {
        name: 'get_cwd',
        description: 'Get current working directory',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => this.getCwd(),
      },
      {
        name: 'set_cwd',
        description: 'Set current working directory',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'New working directory' },
          },
          required: ['path'],
        },
        handler: async (input) => this.setCwd(input.path as string),
      },
    ];
  }

  private async runCommand(
    command: string,
    cwd?: string,
    timeout: number = 30000
  ): Promise<MCPToolResult> {
    return new Promise((resolve) => {
      const shell = os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash';
      const shellArgs = os.platform() === 'win32' ? ['/c', command] : ['-c', command];

      let stdout = '';
      let stderr = '';

      const proc = spawn(shell, shellArgs, {
        cwd: cwd || this.cwd,
        env: this.env,
        timeout,
      });

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        const output = stdout + (stderr ? `\n[stderr]\n${stderr}` : '');
        resolve({
          content: [{ 
            type: 'text', 
            text: `Exit code: ${code}\n\n${output || '(no output)'}` 
          }],
          isError: code !== 0,
        });
      });

      proc.on('error', (error) => {
        resolve({
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        });
      });
    });
  }

  private async runBackground(command: string, id: string): Promise<MCPToolResult> {
    if (this.activeProcesses.has(id)) {
      return {
        content: [{ type: 'text', text: `Process with ID '${id}' already exists` }],
        isError: true,
      };
    }

    const shell = os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash';
    const shellArgs = os.platform() === 'win32' ? ['/c', command] : ['-c', command];

    const proc = spawn(shell, shellArgs, {
      cwd: this.cwd,
      env: this.env,
      detached: true,
    });

    this.activeProcesses.set(id, proc);

    proc.on('close', () => {
      this.activeProcesses.delete(id);
    });

    return {
      content: [{ type: 'text', text: `Started process '${id}' with PID ${proc.pid}` }],
    };
  }

  private async killProcess(id: string): Promise<MCPToolResult> {
    const proc = this.activeProcesses.get(id);
    if (!proc) {
      return {
        content: [{ type: 'text', text: `Process '${id}' not found` }],
        isError: true,
      };
    }

    proc.kill();
    this.activeProcesses.delete(id);

    return {
      content: [{ type: 'text', text: `Killed process '${id}'` }],
    };
  }

  private async listProcesses(): Promise<MCPToolResult> {
    const processes = Array.from(this.activeProcesses.entries()).map(
      ([id, proc]) => `${id}: PID ${proc.pid}`
    );

    return {
      content: [{ 
        type: 'text', 
        text: processes.length > 0 ? processes.join('\n') : 'No active processes' 
      }],
    };
  }

  private async getEnv(name: string): Promise<MCPToolResult> {
    const value = this.env[name];
    return {
      content: [{ type: 'text', text: value ?? '(not set)' }],
    };
  }

  private async setEnv(name: string, value: string): Promise<MCPToolResult> {
    this.env[name] = value;
    return {
      content: [{ type: 'text', text: `Set ${name}=${value}` }],
    };
  }

  private async getCwd(): Promise<MCPToolResult> {
    return {
      content: [{ type: 'text', text: this.cwd }],
    };
  }

  private async setCwd(path: string): Promise<MCPToolResult> {
    this.cwd = path;
    return {
      content: [{ type: 'text', text: `Changed directory to ${path}` }],
    };
  }
}

export function createTerminalServer(cwd?: string): TerminalServer {
  return new TerminalServer(cwd);
}
