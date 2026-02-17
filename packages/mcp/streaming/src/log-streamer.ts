// MCP Log Streamer
// packages/mcp/streaming/src/log-streamer.ts

import { EventEmitter } from 'events';
import {
  LogStreamOptions,
  LogEntry,
  LogLevel,
  StreamSubscriber,
  StreamChunk,
} from './types';

export class LogStreamer extends EventEmitter {
  private entries: LogEntry[] = [];
  private maxEntries: number = 10000;
  private subscribers: Map<string, LogSubscription> = new Map();
  private sources: Set<string> = new Set();

  constructor(maxEntries: number = 10000) {
    super();
    this.maxEntries = maxEntries;
  }

  log(
    level: LogLevel,
    source: string,
    message: string,
    metadata?: Record<string, unknown>,
    stackTrace?: string
  ): void {
    const entry: LogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      level,
      source,
      message,
      metadata,
      stackTrace,
    };

    this.entries.push(entry);
    this.sources.add(source);

    // Trim old entries
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    // Notify subscribers
    this.notifySubscribers(entry);
    this.emit('log', entry);
  }

  debug(source: string, message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', source, message, metadata);
  }

  info(source: string, message: string, metadata?: Record<string, unknown>): void {
    this.log('info', source, message, metadata);
  }

  warn(source: string, message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', source, message, metadata);
  }

  error(source: string, message: string, metadata?: Record<string, unknown>, error?: Error): void {
    this.log('error', source, message, metadata, error?.stack);
  }

  fatal(source: string, message: string, metadata?: Record<string, unknown>, error?: Error): void {
    this.log('fatal', source, message, metadata, error?.stack);
  }

  subscribe(options: LogStreamOptions): string {
    const subscriptionId = this.generateId();
    const subscription: LogSubscription = {
      id: subscriptionId,
      options,
      callbacks: [],
    };

    this.subscribers.set(subscriptionId, subscription);

    // Send historical entries if 'since' is specified
    if (options.since) {
      const historical = this.entries.filter(entry => 
        entry.timestamp >= options.since! && this.matchesFilter(entry, options)
      );
      
      for (const entry of historical) {
        this.emit('historical', { subscriptionId, entry });
      }
    }

    return subscriptionId;
  }

  onSubscription(
    subscriptionId: string,
    callback: (entry: LogEntry) => void
  ): () => void {
    const subscription = this.subscribers.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    subscription.callbacks.push(callback);

    return () => {
      const index = subscription.callbacks.indexOf(callback);
      if (index !== -1) {
        subscription.callbacks.splice(index, 1);
      }
    };
  }

  unsubscribe(subscriptionId: string): void {
    this.subscribers.delete(subscriptionId);
  }

  private notifySubscribers(entry: LogEntry): void {
    for (const [, subscription] of this.subscribers) {
      if (this.matchesFilter(entry, subscription.options)) {
        for (const callback of subscription.callbacks) {
          try {
            callback(entry);
          } catch (error) {
            console.error('Log subscriber error:', error);
          }
        }
      }
    }
  }

  private matchesFilter(entry: LogEntry, options: LogStreamOptions): boolean {
    // Filter by level
    if (options.level && options.level.length > 0) {
      if (!options.level.includes(entry.level)) {
        return false;
      }
    }

    // Filter by source
    if (options.sources && options.sources.length > 0) {
      if (!options.sources.includes(entry.source)) {
        return false;
      }
    }

    // Filter by text pattern
    if (options.filter) {
      const pattern = new RegExp(options.filter, 'i');
      if (!pattern.test(entry.message) && !pattern.test(entry.source)) {
        return false;
      }
    }

    return true;
  }

  query(options: LogStreamOptions & { limit?: number; offset?: number }): LogEntry[] {
    let results = this.entries.filter(entry => this.matchesFilter(entry, options));

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    results = results.slice(offset, offset + limit);

    return results;
  }

  getSources(): string[] {
    return Array.from(this.sources);
  }

  getLevelCounts(): Record<LogLevel, number> {
    const counts: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      fatal: 0,
    };

    for (const entry of this.entries) {
      counts[entry.level]++;
    }

    return counts;
  }

  clear(): void {
    this.entries = [];
    this.emit('clear');
  }

  exportLogs(format: 'json' | 'csv' | 'text' = 'json'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(this.entries, null, 2);
      
      case 'csv':
        const headers = 'timestamp,level,source,message\n';
        const rows = this.entries.map(e => 
          `"${e.timestamp.toISOString()}","${e.level}","${e.source}","${e.message.replace(/"/g, '""')}"`
        ).join('\n');
        return headers + rows;
      
      case 'text':
        return this.entries.map(e =>
          `[${e.timestamp.toISOString()}] [${e.level.toUpperCase()}] [${e.source}] ${e.message}`
        ).join('\n');
      
      default:
        throw new Error(`Unknown format: ${format}`);
    }
  }

  createStream(options: LogStreamOptions): AsyncIterable<LogEntry> {
    const subscriptionId = this.subscribe(options);
    const self = this;

    return {
      [Symbol.asyncIterator](): AsyncIterator<LogEntry> {
        const queue: LogEntry[] = [];
        let resolve: ((value: IteratorResult<LogEntry>) => void) | null = null;
        let done = false;

        self.onSubscription(subscriptionId, (entry) => {
          if (resolve) {
            resolve({ value: entry, done: false });
            resolve = null;
          } else {
            queue.push(entry);
          }
        });

        return {
          next(): Promise<IteratorResult<LogEntry>> {
            if (done) {
              return Promise.resolve({ value: undefined, done: true });
            }

            if (queue.length > 0) {
              return Promise.resolve({ value: queue.shift()!, done: false });
            }

            return new Promise(r => {
              resolve = r;
            });
          },

          return(): Promise<IteratorResult<LogEntry>> {
            done = true;
            self.unsubscribe(subscriptionId);
            return Promise.resolve({ value: undefined, done: true });
          },
        };
      },
    };
  }

  private generateId(): string {
    return `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

interface LogSubscription {
  id: string;
  options: LogStreamOptions;
  callbacks: ((entry: LogEntry) => void)[];
}
