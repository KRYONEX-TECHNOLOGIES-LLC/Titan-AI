// MCP Stream Manager
// packages/mcp/streaming/src/stream-manager.ts

import { EventEmitter } from 'events';
import { ResourceStreamer } from './resource-streamer';
import { LogStreamer } from './log-streamer';
import {
  StreamConfig,
  StreamState,
  ResourceStreamOptions,
  LogStreamOptions,
  LogEntry,
  StreamSubscriber,
} from './types';

export interface StreamManagerConfig {
  resourceStreamer: Partial<StreamConfig>;
  maxLogEntries: number;
}

export class StreamManager extends EventEmitter {
  private resourceStreamer: ResourceStreamer;
  private logStreamer: LogStreamer;
  private activeConnections: Map<string, StreamConnection> = new Map();

  constructor(config: Partial<StreamManagerConfig> = {}) {
    super();
    this.resourceStreamer = new ResourceStreamer(config.resourceStreamer);
    this.logStreamer = new LogStreamer(config.maxLogEntries || 10000);

    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    // Forward resource streamer events
    this.resourceStreamer.on('stream:start', (data) => this.emit('resource:start', data));
    this.resourceStreamer.on('stream:chunk', (data) => this.emit('resource:chunk', data));
    this.resourceStreamer.on('stream:complete', (data) => this.emit('resource:complete', data));
    this.resourceStreamer.on('stream:error', (data) => this.emit('resource:error', data));
    this.resourceStreamer.on('stream:pause', (data) => this.emit('resource:pause', data));
    this.resourceStreamer.on('stream:resume', (data) => this.emit('resource:resume', data));

    // Forward log streamer events
    this.logStreamer.on('log', (entry) => this.emit('log:entry', entry));
    this.logStreamer.on('clear', () => this.emit('log:clear'));
  }

  // Resource streaming methods
  async streamResource(
    options: ResourceStreamOptions,
    dataProvider: AsyncIterable<unknown>
  ): Promise<string> {
    return this.resourceStreamer.startStream(options, dataProvider);
  }

  subscribeToResource(
    streamId: string,
    subscriber: StreamSubscriber
  ): () => void {
    return this.resourceStreamer.subscribe(streamId, subscriber);
  }

  pauseResourceStream(streamId: string): void {
    this.resourceStreamer.pauseStream(streamId);
  }

  resumeResourceStream(streamId: string): void {
    this.resourceStreamer.resumeStream(streamId);
  }

  stopResourceStream(streamId: string): void {
    this.resourceStreamer.stopStream(streamId);
  }

  getResourceStreamState(streamId: string): StreamState | undefined {
    return this.resourceStreamer.getStreamState(streamId);
  }

  getAllResourceStreams(): StreamState[] {
    return this.resourceStreamer.getAllStreams();
  }

  // Log streaming methods
  log(
    level: 'debug' | 'info' | 'warn' | 'error' | 'fatal',
    source: string,
    message: string,
    metadata?: Record<string, unknown>,
    error?: Error
  ): void {
    this.logStreamer.log(level, source, message, metadata, error?.stack);
  }

  subscribeLogs(options: LogStreamOptions): string {
    return this.logStreamer.subscribe(options);
  }

  onLogSubscription(
    subscriptionId: string,
    callback: (entry: LogEntry) => void
  ): () => void {
    return this.logStreamer.onSubscription(subscriptionId, callback);
  }

  unsubscribeLogs(subscriptionId: string): void {
    this.logStreamer.unsubscribe(subscriptionId);
  }

  queryLogs(options: LogStreamOptions & { limit?: number; offset?: number }): LogEntry[] {
    return this.logStreamer.query(options);
  }

  getLogSources(): string[] {
    return this.logStreamer.getSources();
  }

  exportLogs(format: 'json' | 'csv' | 'text' = 'json'): string {
    return this.logStreamer.exportLogs(format);
  }

  clearLogs(): void {
    this.logStreamer.clear();
  }

  // WebSocket connection management for external streaming
  registerConnection(connectionId: string, metadata?: Record<string, unknown>): void {
    const connection: StreamConnection = {
      id: connectionId,
      connectedAt: Date.now(),
      metadata,
      resourceSubscriptions: [],
      logSubscriptions: [],
    };

    this.activeConnections.set(connectionId, connection);
    this.emit('connection:register', { connectionId, metadata });
  }

  unregisterConnection(connectionId: string): void {
    const connection = this.activeConnections.get(connectionId);
    if (connection) {
      // Clean up resource subscriptions
      for (const streamId of connection.resourceSubscriptions) {
        this.resourceStreamer.stopStream(streamId);
      }

      // Clean up log subscriptions
      for (const subscriptionId of connection.logSubscriptions) {
        this.logStreamer.unsubscribe(subscriptionId);
      }

      this.activeConnections.delete(connectionId);
      this.emit('connection:unregister', { connectionId });
    }
  }

  attachResourceStreamToConnection(connectionId: string, streamId: string): void {
    const connection = this.activeConnections.get(connectionId);
    if (connection) {
      connection.resourceSubscriptions.push(streamId);
    }
  }

  attachLogSubscriptionToConnection(connectionId: string, subscriptionId: string): void {
    const connection = this.activeConnections.get(connectionId);
    if (connection) {
      connection.logSubscriptions.push(subscriptionId);
    }
  }

  getActiveConnections(): StreamConnectionInfo[] {
    return Array.from(this.activeConnections.values()).map(conn => ({
      id: conn.id,
      connectedAt: conn.connectedAt,
      metadata: conn.metadata,
      resourceStreamCount: conn.resourceSubscriptions.length,
      logSubscriptionCount: conn.logSubscriptions.length,
    }));
  }

  // Stats
  getStats(): StreamManagerStats {
    const resourceStreams = this.getAllResourceStreams();
    const activeResourceStreams = resourceStreams.filter(s => s.status === 'active').length;
    const completedResourceStreams = resourceStreams.filter(s => s.status === 'completed').length;
    const errorResourceStreams = resourceStreams.filter(s => s.status === 'error').length;

    const logCounts = this.logStreamer.getLevelCounts();

    return {
      resourceStreams: {
        total: resourceStreams.length,
        active: activeResourceStreams,
        completed: completedResourceStreams,
        errored: errorResourceStreams,
      },
      logs: logCounts,
      connections: this.activeConnections.size,
    };
  }
}

interface StreamConnection {
  id: string;
  connectedAt: number;
  metadata?: Record<string, unknown>;
  resourceSubscriptions: string[];
  logSubscriptions: string[];
}

export interface StreamConnectionInfo {
  id: string;
  connectedAt: number;
  metadata?: Record<string, unknown>;
  resourceStreamCount: number;
  logSubscriptionCount: number;
}

export interface StreamManagerStats {
  resourceStreams: {
    total: number;
    active: number;
    completed: number;
    errored: number;
  };
  logs: Record<string, number>;
  connections: number;
}
