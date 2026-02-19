/**
 * MCP Relay API Route - Model Context Protocol Server
 * Implements JSON-RPC 2.0 protocol for tool execution,
 * resource access, and prompt templates.
 *
 * Servers: filesystem, git, terminal, search
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface MCPRequest {
  jsonrpc?: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const TOOL_DEFINITIONS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file at the given path',
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
    description: 'Write content to a file, creating it if it does not exist',
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
    name: 'list_directory',
    description: 'List files and directories at the given path',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path relative to workspace' },
        recursive: { type: 'boolean', description: 'List recursively' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: 'Search for files matching a pattern using grep',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (regex supported)' },
        path: { type: 'string', description: 'Directory to search in' },
        glob: { type: 'string', description: 'File glob pattern (e.g., *.ts)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'run_command',
    description: 'Execute a shell command in the workspace directory',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Working directory' },
        timeout: { type: 'number', description: 'Timeout in milliseconds' },
      },
      required: ['command'],
    },
  },
  {
    name: 'git_status',
    description: 'Get git repository status',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
  },
  {
    name: 'git_diff',
    description: 'Get git diff for staged or unstaged changes',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        staged: { type: 'boolean' },
      },
    },
  },
];

const BLOCKED_COMMANDS = [
  /rm\s+-rf\s+\//, /del\s+\/[fs]/, /format\s+c:/i,
  /mkfs/, /dd\s+if=/, /:(){ :\|:& };:/,
];

function isCommandSafe(command: string): boolean {
  return !BLOCKED_COMMANDS.some(pattern => pattern.test(command));
}

async function executeToolCall(name: string, args: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }> }> {
  const workspaceRoot = process.cwd();

  switch (name) {
    case 'read_file': {
      const filePath = path.resolve(workspaceRoot, args.path as string);
      if (!filePath.startsWith(workspaceRoot)) {
        return { content: [{ type: 'text', text: 'Error: Path traversal detected' }] };
      }
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return { content: [{ type: 'text', text: content }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `Error reading file: ${(e as Error).message}` }] };
      }
    }

    case 'write_file': {
      const filePath = path.resolve(workspaceRoot, args.path as string);
      if (!filePath.startsWith(workspaceRoot)) {
        return { content: [{ type: 'text', text: 'Error: Path traversal detected' }] };
      }
      try {
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, args.content as string, 'utf-8');
        return { content: [{ type: 'text', text: `File written: ${args.path}` }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `Error writing file: ${(e as Error).message}` }] };
      }
    }

    case 'list_directory': {
      const dirPath = path.resolve(workspaceRoot, (args.path as string) || '.');
      if (!dirPath.startsWith(workspaceRoot)) {
        return { content: [{ type: 'text', text: 'Error: Path traversal detected' }] };
      }
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const listing = entries.map(e => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`).join('\n');
        return { content: [{ type: 'text', text: listing }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `Error listing directory: ${(e as Error).message}` }] };
      }
    }

    case 'search_files': {
      try {
        const searchPath = path.resolve(workspaceRoot, (args.path as string) || '.');
        const glob = (args.glob as string) || '*.{ts,tsx,js,jsx,py,rs,go}';
        const cmd = process.platform === 'win32'
          ? `findstr /S /N /C:"${args.query}" ${glob}`
          : `grep -rn "${args.query}" ${searchPath} --include="${glob}" 2>/dev/null | head -50`;
        const result = execSync(cmd, { cwd: searchPath, timeout: 10000, encoding: 'utf-8' });
        return { content: [{ type: 'text', text: result.slice(0, 5000) }] };
      } catch {
        return { content: [{ type: 'text', text: 'No results found' }] };
      }
    }

    case 'run_command': {
      const command = args.command as string;
      if (!isCommandSafe(command)) {
        return { content: [{ type: 'text', text: 'Error: Command blocked by safety filter' }] };
      }
      try {
        const cwd = args.cwd ? path.resolve(workspaceRoot, args.cwd as string) : workspaceRoot;
        const timeout = (args.timeout as number) || 30000;
        const result = execSync(command, { cwd, timeout, encoding: 'utf-8', maxBuffer: 1024 * 1024 });
        return { content: [{ type: 'text', text: result.slice(0, 10000) }] };
      } catch (e: any) {
        const stderr = e.stderr?.toString() || '';
        const stdout = e.stdout?.toString() || '';
        return { content: [{ type: 'text', text: `Exit code: ${e.status}\n${stdout}\n${stderr}`.slice(0, 10000) }] };
      }
    }

    case 'git_status': {
      try {
        const result = execSync('git status --porcelain', { cwd: workspaceRoot, encoding: 'utf-8', timeout: 10000 });
        const branch = execSync('git branch --show-current', { cwd: workspaceRoot, encoding: 'utf-8', timeout: 5000 }).trim();
        return { content: [{ type: 'text', text: `Branch: ${branch}\n${result || 'Clean working tree'}` }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `Git error: ${(e as Error).message}` }] };
      }
    }

    case 'git_diff': {
      try {
        const staged = args.staged ? '--staged' : '';
        const result = execSync(`git diff ${staged}`, { cwd: workspaceRoot, encoding: 'utf-8', timeout: 10000 });
        return { content: [{ type: 'text', text: result.slice(0, 10000) || 'No changes' }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `Git error: ${(e as Error).message}` }] };
      }
    }

    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  }
}

async function handleMCPRequest(request: MCPRequest): Promise<MCPResponse> {
  const id = request.id || Date.now().toString();

  switch (request.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'Titan AI MCP Server', version: '0.2.0' },
          capabilities: { tools: { listChanged: true }, resources: {}, prompts: {} },
        },
      };

    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: TOOL_DEFINITIONS } };

    case 'tools/call': {
      const toolName = request.params?.name as string;
      const toolArgs = (request.params?.arguments || {}) as Record<string, unknown>;
      const result = await executeToolCall(toolName, toolArgs);
      return { jsonrpc: '2.0', id, result };
    }

    case 'resources/list':
      return {
        jsonrpc: '2.0', id,
        result: {
          resources: [
            { uri: 'file:///workspace', name: 'Workspace', mimeType: 'application/x-directory' },
            { uri: 'file:///workspace/.git', name: 'Git Repository', mimeType: 'application/x-git' },
          ],
        },
      };

    case 'resources/read': {
      const uri = request.params?.uri as string;
      if (uri?.startsWith('file:///workspace')) {
        const relativePath = uri.replace('file:///workspace', '.');
        try {
          const content = fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf-8');
          return { jsonrpc: '2.0', id, result: { contents: [{ uri, mimeType: 'text/plain', text: content }] } };
        } catch {
          return { jsonrpc: '2.0', id, error: { code: -32002, message: 'Resource not found' } };
        }
      }
      return { jsonrpc: '2.0', id, error: { code: -32002, message: 'Unknown resource URI' } };
    }

    case 'prompts/list':
      return {
        jsonrpc: '2.0', id,
        result: {
          prompts: [
            { name: 'explain_code', description: 'Explain a piece of code', arguments: [{ name: 'code', description: 'Code to explain', required: true }] },
            { name: 'review_code', description: 'Review code for issues and suggest improvements', arguments: [{ name: 'code', description: 'Code to review', required: true }] },
            { name: 'write_tests', description: 'Generate unit tests for code', arguments: [{ name: 'code', description: 'Code to test', required: true }, { name: 'framework', description: 'Test framework (jest, vitest, pytest)', required: false }] },
          ],
        },
      };

    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${request.method}` } };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: MCPRequest = await request.json();
    const response = await handleMCPRequest(body);
    return NextResponse.json(response);
  } catch (error) {
    console.error('MCP error:', error);
    return NextResponse.json({
      jsonrpc: '2.0', id: null,
      error: { code: -32603, message: 'Internal error' },
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    protocol: 'MCP 2024-11-05',
    tools: TOOL_DEFINITIONS.map(t => t.name),
    endpoints: { tools: '/api/mcp', resources: '/api/mcp', prompts: '/api/mcp' },
  });
}
