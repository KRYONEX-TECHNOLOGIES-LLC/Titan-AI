/**
 * Titan AI MCP - Built-in Tool Definitions
 */

import type { MCPTool, ToolResult } from '../types.js';

/**
 * File system tool
 */
export const fileSystemTool: MCPTool = {
  name: 'filesystem',
  description: 'Read, write, and manage files',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform',
        enum: ['read', 'write', 'delete', 'list', 'search'],
      },
      path: {
        type: 'string',
        description: 'File or directory path',
      },
      content: {
        type: 'string',
        description: 'Content to write (for write action)',
      },
      pattern: {
        type: 'string',
        description: 'Search pattern (for search action)',
      },
    },
    required: ['action', 'path'],
  },
};

/**
 * Git tool
 */
export const gitTool: MCPTool = {
  name: 'git',
  description: 'Git version control operations',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Git action',
        enum: ['status', 'diff', 'log', 'commit', 'branch', 'checkout'],
      },
      args: {
        type: 'string',
        description: 'Additional arguments',
      },
    },
    required: ['action'],
  },
};

/**
 * Terminal tool
 */
export const terminalTool: MCPTool = {
  name: 'terminal',
  description: 'Execute terminal commands',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds',
      },
    },
    required: ['command'],
  },
};

/**
 * Browser tool
 */
export const browserTool: MCPTool = {
  name: 'browser',
  description: 'Control web browser for testing',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Browser action',
        enum: ['navigate', 'click', 'type', 'screenshot', 'evaluate'],
      },
      url: {
        type: 'string',
        description: 'URL to navigate to',
      },
      selector: {
        type: 'string',
        description: 'CSS selector',
      },
      text: {
        type: 'string',
        description: 'Text to type',
      },
      script: {
        type: 'string',
        description: 'JavaScript to evaluate',
      },
    },
    required: ['action'],
  },
};

/**
 * Create a tool result helper
 */
export function createToolResult(content: string, isError = false): ToolResult {
  return {
    content: [{ type: 'text', text: content }],
    isError,
  };
}

/**
 * All built-in tools
 */
export const builtInTools: MCPTool[] = [
  fileSystemTool,
  gitTool,
  terminalTool,
  browserTool,
];
