/**
 * MCP Filesystem Server
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { MCPServer, MCPServerConfig, MCPTool, MCPToolResult, MCPResource } from './types';

export class FilesystemServer implements MCPServer {
  config: MCPServerConfig = {
    id: 'filesystem',
    name: 'Filesystem Server',
    version: '1.0.0',
    capabilities: ['tools', 'resources'],
  };

  private rootPath: string;
  tools: MCPTool[];
  resources: MCPResource[] = [];

  constructor(rootPath: string = process.cwd()) {
    this.rootPath = rootPath;
    this.tools = this.createTools();
  }

  async initialize(): Promise<void> {
    await this.scanResources();
  }

  async shutdown(): Promise<void> {
    // Cleanup if needed
  }

  private createTools(): MCPTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read the contents of a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file' },
          },
          required: ['path'],
        },
        handler: async (input) => this.readFile(input.path as string),
      },
      {
        name: 'write_file',
        description: 'Write content to a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file' },
            content: { type: 'string', description: 'Content to write' },
          },
          required: ['path', 'content'],
        },
        handler: async (input) => this.writeFile(input.path as string, input.content as string),
      },
      {
        name: 'list_directory',
        description: 'List contents of a directory',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the directory' },
          },
          required: ['path'],
        },
        handler: async (input) => this.listDirectory(input.path as string),
      },
      {
        name: 'create_directory',
        description: 'Create a new directory',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to create' },
          },
          required: ['path'],
        },
        handler: async (input) => this.createDirectory(input.path as string),
      },
      {
        name: 'delete_file',
        description: 'Delete a file or directory',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to delete' },
            recursive: { type: 'boolean', description: 'Delete recursively' },
          },
          required: ['path'],
        },
        handler: async (input) => this.deleteFile(input.path as string, input.recursive as boolean),
      },
      {
        name: 'move_file',
        description: 'Move or rename a file',
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Source path' },
            destination: { type: 'string', description: 'Destination path' },
          },
          required: ['source', 'destination'],
        },
        handler: async (input) => this.moveFile(input.source as string, input.destination as string),
      },
      {
        name: 'search_files',
        description: 'Search for files matching a pattern',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Search pattern (glob or regex)' },
            path: { type: 'string', description: 'Directory to search in' },
          },
          required: ['pattern'],
        },
        handler: async (input) => this.searchFiles(input.pattern as string, input.path as string),
      },
    ];
  }

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.rootPath, filePath);
  }

  private async readFile(filePath: string): Promise<MCPToolResult> {
    try {
      const fullPath = this.resolvePath(filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      return {
        content: [{ type: 'text', text: content }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error reading file: ${error}` }],
        isError: true,
      };
    }
  }

  private async writeFile(filePath: string, content: string): Promise<MCPToolResult> {
    try {
      const fullPath = this.resolvePath(filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
      return {
        content: [{ type: 'text', text: `Successfully wrote to ${filePath}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error writing file: ${error}` }],
        isError: true,
      };
    }
  }

  private async listDirectory(dirPath: string): Promise<MCPToolResult> {
    try {
      const fullPath = this.resolvePath(dirPath || '.');
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      
      const listing = entries.map(entry => {
        const type = entry.isDirectory() ? 'd' : entry.isSymbolicLink() ? 'l' : 'f';
        return `[${type}] ${entry.name}`;
      }).join('\n');

      return {
        content: [{ type: 'text', text: listing || 'Directory is empty' }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error listing directory: ${error}` }],
        isError: true,
      };
    }
  }

  private async createDirectory(dirPath: string): Promise<MCPToolResult> {
    try {
      const fullPath = this.resolvePath(dirPath);
      await fs.mkdir(fullPath, { recursive: true });
      return {
        content: [{ type: 'text', text: `Created directory: ${dirPath}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error creating directory: ${error}` }],
        isError: true,
      };
    }
  }

  private async deleteFile(filePath: string, recursive: boolean = false): Promise<MCPToolResult> {
    try {
      const fullPath = this.resolvePath(filePath);
      await fs.rm(fullPath, { recursive, force: true });
      return {
        content: [{ type: 'text', text: `Deleted: ${filePath}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error deleting: ${error}` }],
        isError: true,
      };
    }
  }

  private async moveFile(source: string, destination: string): Promise<MCPToolResult> {
    try {
      const fullSource = this.resolvePath(source);
      const fullDest = this.resolvePath(destination);
      await fs.mkdir(path.dirname(fullDest), { recursive: true });
      await fs.rename(fullSource, fullDest);
      return {
        content: [{ type: 'text', text: `Moved ${source} to ${destination}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error moving file: ${error}` }],
        isError: true,
      };
    }
  }

  private async searchFiles(pattern: string, searchPath?: string): Promise<MCPToolResult> {
    try {
      const basePath = this.resolvePath(searchPath || '.');
      const matches: string[] = [];
      
      const search = async (dir: string): Promise<void> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(basePath, fullPath);
          
          if (entry.name.includes(pattern) || new RegExp(pattern).test(entry.name)) {
            matches.push(relativePath);
          }
          
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await search(fullPath);
          }
        }
      };

      await search(basePath);

      return {
        content: [{ type: 'text', text: matches.length > 0 ? matches.join('\n') : 'No matches found' }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error searching: ${error}` }],
        isError: true,
      };
    }
  }

  private async scanResources(): Promise<void> {
    // Scan root directory for resources
    try {
      const entries = await fs.readdir(this.rootPath, { withFileTypes: true });
      
      this.resources = entries
        .filter(e => e.isFile())
        .slice(0, 100) // Limit resources
        .map(entry => ({
          uri: `file://${path.join(this.rootPath, entry.name)}`,
          name: entry.name,
          mimeType: this.getMimeType(entry.name),
        }));
    } catch {
      // Ignore scan errors
    }
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.ts': 'text/typescript',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
    };
    return mimeTypes[ext] || 'text/plain';
  }
}

export function createFilesystemServer(rootPath?: string): FilesystemServer {
  return new FilesystemServer(rootPath);
}
