/**
 * Titan AI MCP - Stdio Transport
 * Communicate with MCP servers via stdin/stdout
 */

import { spawn, ChildProcess } from 'child_process';
import type { Transport, JsonRpcRequest, JsonRpcResponse } from '../types.js';

export interface StdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export class StdioTransport implements Transport {
  private config: StdioConfig;
  private process: ChildProcess | null = null;
  private messageHandler: ((message: JsonRpcRequest | JsonRpcResponse) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;
  private buffer = '';

  constructor(config: StdioConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    this.process = spawn(this.config.command, this.config.args ?? [], {
      env: { ...process.env, ...this.config.env },
      cwd: this.config.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('[MCP Server stderr]:', data.toString());
    });

    this.process.on('close', () => {
      this.closeHandler?.();
    });

    this.process.on('error', error => {
      this.errorHandler?.(error);
    });
  }

  async send(message: JsonRpcRequest | JsonRpcResponse): Promise<void> {
    if (!this.process?.stdin) {
      throw new Error('Transport not started');
    }

    const json = JSON.stringify(message);
    this.process.stdin.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
  }

  async close(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  onMessage(handler: (message: JsonRpcRequest | JsonRpcResponse) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  private processBuffer(): void {
    while (true) {
      // Find header
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      // Parse content length
      const header = this.buffer.substring(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.buffer = this.buffer.substring(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const contentStart = headerEnd + 4;

      // Check if we have enough data
      if (this.buffer.length < contentStart + contentLength) {
        return;
      }

      // Extract and parse content
      const content = this.buffer.substring(contentStart, contentStart + contentLength);
      this.buffer = this.buffer.substring(contentStart + contentLength);

      try {
        const message = JSON.parse(content);
        this.messageHandler?.(message);
      } catch (error) {
        this.errorHandler?.(new Error(`Failed to parse message: ${error}`));
      }
    }
  }
}
