/**
 * Project Midnight - IPC Communication
 * Unix socket / named pipe for CLI and UI communication with daemon
 */

import { createServer, createConnection, Server, Socket } from 'net';
import { existsSync, unlinkSync } from 'fs';
import { platform } from 'os';
import type { IPCRequest, IPCResponse } from '../types.js';

type RequestHandler = (request: IPCRequest) => Promise<IPCResponse>;

export class IPCServer {
  private socketPath: string;
  private server: Server | null = null;
  private handlers: Map<string, RequestHandler> = new Map();
  private subscribers: Set<Socket> = new Set();

  constructor(socketPath: string) {
    this.socketPath = this.normalizeSocketPath(socketPath);
  }

  /**
   * Start the IPC server
   */
  async start(): Promise<void> {
    // Clean up existing socket
    this.cleanup();

    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => this.handleConnection(socket));

      this.server.on('error', (error) => {
        reject(error);
      });

      this.server.listen(this.socketPath, () => {
        resolve();
      });
    });
  }

  /**
   * Stop the IPC server
   */
  async stop(): Promise<void> {
    // Close all subscriber connections
    for (const socket of this.subscribers) {
      socket.destroy();
    }
    this.subscribers.clear();

    // Close server
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.cleanup();
          resolve();
        });
      });
    }

    this.cleanup();
  }

  /**
   * Register a request handler
   */
  handle(type: string, handler: RequestHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * Broadcast a message to all subscribers
   */
  broadcast(response: IPCResponse): void {
    const message = JSON.stringify(response) + '\n';
    
    for (const socket of this.subscribers) {
      try {
        socket.write(message);
      } catch {
        // Remove dead sockets
        this.subscribers.delete(socket);
      }
    }
  }

  /**
   * Handle incoming connection
   */
  private handleConnection(socket: Socket): void {
    let buffer = '';

    socket.on('data', async (data) => {
      buffer += data.toString();
      
      // Process complete messages (newline-delimited JSON)
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const request = JSON.parse(line) as IPCRequest;
          const response = await this.processRequest(request, socket);
          socket.write(JSON.stringify(response) + '\n');
        } catch (error) {
          socket.write(JSON.stringify({
            type: 'error',
            message: `Invalid request: ${error}`,
          } as IPCResponse) + '\n');
        }
      }
    });

    socket.on('close', () => {
      this.subscribers.delete(socket);
    });

    socket.on('error', () => {
      this.subscribers.delete(socket);
    });
  }

  /**
   * Process a request
   */
  private async processRequest(request: IPCRequest, socket: Socket): Promise<IPCResponse> {
    // Handle subscribe request
    if (request.type === 'subscribe_events') {
      this.subscribers.add(socket);
      return { type: 'success', message: 'Subscribed to events' };
    }

    // Find handler
    const handler = this.handlers.get(request.type);
    
    if (!handler) {
      return { type: 'error', message: `Unknown request type: ${request.type}` };
    }

    try {
      return await handler(request);
    } catch (error) {
      return { type: 'error', message: `Handler error: ${error}` };
    }
  }

  /**
   * Cleanup socket file
   */
  private cleanup(): void {
    if (platform() !== 'win32' && existsSync(this.socketPath)) {
      try {
        unlinkSync(this.socketPath);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Normalize socket path for the platform
   */
  private normalizeSocketPath(path: string): string {
    if (platform() === 'win32') {
      // Windows named pipes
      return `\\\\.\\pipe\\${path.replace(/[/\\:]/g, '_')}`;
    }
    return path;
  }
}

/**
 * IPC Client for connecting to the daemon
 */
export class IPCClient {
  private socketPath: string;
  private socket: Socket | null = null;
  private responseBuffer = '';
  private pendingRequests: Map<number, {
    resolve: (response: IPCResponse) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private requestId = 0;
  private eventCallback: ((event: IPCResponse) => void) | null = null;

  constructor(socketPath: string) {
    this.socketPath = this.normalizeSocketPath(socketPath);
  }

  /**
   * Connect to the IPC server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = createConnection(this.socketPath);

      this.socket.on('connect', () => {
        this.setupDataHandler();
        resolve();
      });

      this.socket.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  /**
   * Send a request and wait for response
   */
  async request(request: IPCRequest): Promise<IPCResponse> {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });

      const message = JSON.stringify(request) + '\n';
      this.socket!.write(message, (error) => {
        if (error) {
          this.pendingRequests.delete(id);
          reject(error);
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Subscribe to events
   */
  async subscribe(callback: (event: IPCResponse) => void): Promise<void> {
    this.eventCallback = callback;
    await this.request({ type: 'subscribe_events' });
  }

  /**
   * Setup data handler
   */
  private setupDataHandler(): void {
    if (!this.socket) return;

    this.socket.on('data', (data) => {
      this.responseBuffer += data.toString();
      
      const lines = this.responseBuffer.split('\n');
      this.responseBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const response = JSON.parse(line) as IPCResponse;
          
          // Check if this is an event broadcast
          if (response.type === 'event' && this.eventCallback) {
            this.eventCallback(response);
          } else {
            // Resolve the oldest pending request
            const [id, pending] = [...this.pendingRequests.entries()][0] || [];
            if (pending) {
              this.pendingRequests.delete(id);
              pending.resolve(response);
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    });
  }

  /**
   * Normalize socket path for the platform
   */
  private normalizeSocketPath(path: string): string {
    if (platform() === 'win32') {
      return `\\\\.\\pipe\\${path.replace(/[/\\:]/g, '_')}`;
    }
    return path;
  }
}

/**
 * Create an IPC client
 */
export function createIPCClient(socketPath: string): IPCClient {
  return new IPCClient(socketPath);
}

/**
 * Create an IPC server
 */
export function createIPCServer(socketPath: string): IPCServer {
  return new IPCServer(socketPath);
}

/**
 * Helper to get status from daemon
 */
export async function getDaemonStatus(socketPath: string): Promise<IPCResponse> {
  const client = new IPCClient(socketPath);
  
  try {
    await client.connect();
    const status = await client.request({ type: 'status' });
    client.disconnect();
    return status;
  } catch (error) {
    return { type: 'error', message: `Cannot connect to daemon: ${error}` };
  }
}
