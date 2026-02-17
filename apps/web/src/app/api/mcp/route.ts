// MCP Relay API Route
// apps/web/src/app/api/mcp/route.ts

import { NextRequest, NextResponse } from 'next/server';

interface MCPRequest {
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// MCP server registry
const servers: Map<string, MCPServerInfo> = new Map([
  ['filesystem', {
    name: 'Filesystem',
    uri: 'stdio://filesystem',
    capabilities: ['read', 'write', 'list'],
    tools: ['read_file', 'write_file', 'list_directory', 'search_files'],
  }],
  ['git', {
    name: 'Git',
    uri: 'stdio://git',
    capabilities: ['status', 'commit', 'diff'],
    tools: ['git_status', 'git_commit', 'git_diff', 'git_log'],
  }],
  ['terminal', {
    name: 'Terminal',
    uri: 'stdio://terminal',
    capabilities: ['execute'],
    tools: ['run_command', 'read_output'],
  }],
  ['browser', {
    name: 'Browser',
    uri: 'stdio://browser',
    capabilities: ['navigate', 'screenshot', 'click'],
    tools: ['navigate', 'screenshot', 'click', 'type', 'evaluate'],
  }],
]);

interface MCPServerInfo {
  name: string;
  uri: string;
  capabilities: string[];
  tools: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: MCPRequest = await request.json();

    const response = await handleMCPRequest(body);
    return NextResponse.json(response);
  } catch (error) {
    console.error('MCP error:', error);
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal error',
        },
      },
      { status: 500 }
    );
  }
}

async function handleMCPRequest(request: MCPRequest): Promise<MCPResponse> {
  const id = request.id || Date.now().toString();

  switch (request.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'Titan AI MCP Relay',
            version: '0.1.0',
          },
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
        },
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: Array.from(servers.values()).flatMap((server) =>
            server.tools.map((tool) => ({
              name: `${server.name.toLowerCase()}_${tool}`,
              description: `Execute ${tool} on ${server.name} server`,
              inputSchema: {
                type: 'object',
                properties: {},
              },
            }))
          ),
        },
      };

    case 'tools/call':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `Tool ${request.params?.name} executed successfully`,
            },
          ],
        },
      };

    case 'resources/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          resources: [
            {
              uri: 'file:///workspace',
              name: 'Workspace',
              mimeType: 'application/x-directory',
            },
          ],
        },
      };

    case 'resources/read':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [
            {
              uri: request.params?.uri as string,
              mimeType: 'text/plain',
              text: '// Resource content placeholder',
            },
          ],
        },
      };

    case 'prompts/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          prompts: [
            {
              name: 'explain_code',
              description: 'Explain a piece of code',
              arguments: [
                { name: 'code', description: 'Code to explain', required: true },
              ],
            },
            {
              name: 'review_code',
              description: 'Review code for issues',
              arguments: [
                { name: 'code', description: 'Code to review', required: true },
              ],
            },
          ],
        },
      };

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: 'Method not found',
        },
      };
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    servers: Array.from(servers.entries()).map(([id, info]) => ({
      id,
      ...info,
    })),
  });
}
