// MCP Streaming Types
// packages/mcp/streaming/src/types.ts

export interface StreamConfig {
  bufferSize: number;
  highWaterMark: number;
  lowWaterMark: number;
  chunkSize: number;
  timeout: number;
}

export interface StreamChunk<T = unknown> {
  id: string;
  sequence: number;
  timestamp: number;
  data: T;
  isLast: boolean;
  metadata?: Record<string, unknown>;
}

export interface StreamState {
  id: string;
  status: 'pending' | 'active' | 'paused' | 'completed' | 'error';
  bytesTransferred: number;
  chunksTransferred: number;
  startTime: number;
  endTime?: number;
  error?: Error;
}

export interface ResourceStreamOptions {
  uri: string;
  format?: 'json' | 'text' | 'binary';
  chunkSize?: number;
  filter?: (data: unknown) => boolean;
  transform?: (data: unknown) => unknown;
}

export interface LogStreamOptions {
  level?: LogLevel[];
  sources?: string[];
  filter?: string;
  since?: Date;
  follow?: boolean;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
  stackTrace?: string;
}

export interface StreamSubscriber<T = unknown> {
  onData: (chunk: StreamChunk<T>) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

export interface BackpressureConfig {
  strategy: 'drop' | 'buffer' | 'pause';
  maxBufferSize: number;
  pauseThreshold: number;
  resumeThreshold: number;
}
