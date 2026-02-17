/**
 * Titan AI MCP - SSE Transport
 * Server-Sent Events transport for web-based MCP
 */

import type { Transport, JsonRpcRequest, JsonRpcResponse } from '../types.js';

export interface SSEConfig {
  url: string;
  headers?: Record<string, string>;
}

export class SSETransport implements Transport {
  private config: SSEConfig;
  private eventSource: EventSource | null = null;
  private messageHandler: ((message: JsonRpcRequest | JsonRpcResponse) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;
  private sessionUrl: string | null = null;

  constructor(config: SSEConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    // Connect to SSE endpoint
    this.eventSource = new EventSource(this.config.url);

    this.eventSource.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        this.messageHandler?.(message);
      } catch (error) {
        this.errorHandler?.(new Error(`Failed to parse SSE message: ${error}`));
      }
    };

    this.eventSource.addEventListener('endpoint', event => {
      // Get the POST endpoint URL
      this.sessionUrl = (event as MessageEvent).data;
    });

    this.eventSource.onerror = () => {
      this.errorHandler?.(new Error('SSE connection error'));
    };

    // Wait for endpoint event
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for SSE endpoint'));
      }, 10000);

      const checkEndpoint = () => {
        if (this.sessionUrl) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkEndpoint, 100);
        }
      };
      checkEndpoint();
    });
  }

  async send(message: JsonRpcRequest | JsonRpcResponse): Promise<void> {
    if (!this.sessionUrl) {
      throw new Error('Transport not started');
    }

    await fetch(this.sessionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      body: JSON.stringify(message),
    });
  }

  async close(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.closeHandler?.();
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
}
