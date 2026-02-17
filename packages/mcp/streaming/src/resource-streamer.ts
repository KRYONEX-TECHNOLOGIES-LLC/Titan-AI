// MCP Resource Streamer
// packages/mcp/streaming/src/resource-streamer.ts

import { EventEmitter } from 'events';
import {
  StreamConfig,
  StreamChunk,
  StreamState,
  ResourceStreamOptions,
  StreamSubscriber,
} from './types';
import { BackpressureController } from './backpressure';

export class ResourceStreamer extends EventEmitter {
  private streams: Map<string, ActiveStream> = new Map();
  private config: StreamConfig;
  private backpressure: BackpressureController;

  constructor(config: Partial<StreamConfig> = {}) {
    super();
    this.config = {
      bufferSize: 1024 * 1024, // 1MB
      highWaterMark: 768 * 1024, // 768KB
      lowWaterMark: 256 * 1024, // 256KB
      chunkSize: 64 * 1024, // 64KB
      timeout: 30000,
      ...config,
    };
    this.backpressure = new BackpressureController({
      strategy: 'pause',
      maxBufferSize: this.config.bufferSize,
      pauseThreshold: this.config.highWaterMark,
      resumeThreshold: this.config.lowWaterMark,
    });
  }

  async startStream(
    options: ResourceStreamOptions,
    dataProvider: AsyncIterable<unknown>
  ): Promise<string> {
    const streamId = this.generateStreamId();
    const state: StreamState = {
      id: streamId,
      status: 'pending',
      bytesTransferred: 0,
      chunksTransferred: 0,
      startTime: Date.now(),
    };

    const activeStream: ActiveStream = {
      id: streamId,
      options,
      state,
      subscribers: [],
      buffer: [],
      abortController: new AbortController(),
    };

    this.streams.set(streamId, activeStream);
    this.emit('stream:start', { streamId, options });

    // Start processing in background
    this.processStream(activeStream, dataProvider).catch(error => {
      this.handleStreamError(activeStream, error);
    });

    return streamId;
  }

  private async processStream(
    stream: ActiveStream,
    dataProvider: AsyncIterable<unknown>
  ): Promise<void> {
    stream.state.status = 'active';
    let sequence = 0;

    try {
      for await (const data of dataProvider) {
        if (stream.abortController.signal.aborted) {
          break;
        }

        // Apply filter if provided
        if (stream.options.filter && !stream.options.filter(data)) {
          continue;
        }

        // Apply transform if provided
        const transformedData = stream.options.transform
          ? stream.options.transform(data)
          : data;

        // Check backpressure
        while (this.backpressure.shouldPause(stream.id)) {
          if (stream.state.status !== 'paused') {
            stream.state.status = 'paused';
            this.emit('stream:pause', { streamId: stream.id });
            this.notifySubscribers(stream, 'onPause');
          }
          await this.delay(100);
        }

        if (stream.state.status === 'paused') {
          stream.state.status = 'active';
          this.emit('stream:resume', { streamId: stream.id });
          this.notifySubscribers(stream, 'onResume');
        }

        const chunk: StreamChunk = {
          id: `${stream.id}-${sequence}`,
          sequence: sequence++,
          timestamp: Date.now(),
          data: transformedData,
          isLast: false,
        };

        // Calculate size for backpressure
        const size = this.estimateSize(transformedData);
        stream.state.bytesTransferred += size;
        stream.state.chunksTransferred++;

        this.backpressure.addBytes(stream.id, size);
        this.deliverChunk(stream, chunk);
      }

      // Send final chunk
      const finalChunk: StreamChunk = {
        id: `${stream.id}-${sequence}`,
        sequence,
        timestamp: Date.now(),
        data: null,
        isLast: true,
      };

      this.deliverChunk(stream, finalChunk);
      stream.state.status = 'completed';
      stream.state.endTime = Date.now();
      this.emit('stream:complete', { streamId: stream.id, state: stream.state });
      this.notifySubscribers(stream, 'onComplete');
    } catch (error) {
      this.handleStreamError(stream, error as Error);
    }
  }

  private deliverChunk(stream: ActiveStream, chunk: StreamChunk): void {
    for (const subscriber of stream.subscribers) {
      try {
        subscriber.onData(chunk);
      } catch (error) {
        console.error('Subscriber error:', error);
      }
    }

    this.emit('stream:chunk', { streamId: stream.id, chunk });
  }

  private handleStreamError(stream: ActiveStream, error: Error): void {
    stream.state.status = 'error';
    stream.state.error = error;
    stream.state.endTime = Date.now();

    this.emit('stream:error', { streamId: stream.id, error });

    for (const subscriber of stream.subscribers) {
      if (subscriber.onError) {
        subscriber.onError(error);
      }
    }
  }

  private notifySubscribers(
    stream: ActiveStream,
    event: 'onPause' | 'onResume' | 'onComplete'
  ): void {
    for (const subscriber of stream.subscribers) {
      const handler = subscriber[event];
      if (handler) {
        try {
          handler();
        } catch (error) {
          console.error(`Subscriber ${event} error:`, error);
        }
      }
    }
  }

  subscribe(streamId: string, subscriber: StreamSubscriber): () => void {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    stream.subscribers.push(subscriber);

    // Return unsubscribe function
    return () => {
      const index = stream.subscribers.indexOf(subscriber);
      if (index !== -1) {
        stream.subscribers.splice(index, 1);
      }
    };
  }

  pauseStream(streamId: string): void {
    const stream = this.streams.get(streamId);
    if (stream && stream.state.status === 'active') {
      stream.state.status = 'paused';
      this.emit('stream:pause', { streamId });
    }
  }

  resumeStream(streamId: string): void {
    const stream = this.streams.get(streamId);
    if (stream && stream.state.status === 'paused') {
      stream.state.status = 'active';
      this.emit('stream:resume', { streamId });
    }
  }

  stopStream(streamId: string): void {
    const stream = this.streams.get(streamId);
    if (stream) {
      stream.abortController.abort();
      stream.state.status = 'completed';
      stream.state.endTime = Date.now();
      this.emit('stream:stop', { streamId });
    }
  }

  getStreamState(streamId: string): StreamState | undefined {
    return this.streams.get(streamId)?.state;
  }

  getAllStreams(): StreamState[] {
    return Array.from(this.streams.values()).map(s => s.state);
  }

  private generateStreamId(): string {
    return `stream-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private estimateSize(data: unknown): number {
    if (typeof data === 'string') return data.length;
    if (Buffer.isBuffer(data)) return data.length;
    return JSON.stringify(data).length;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

interface ActiveStream {
  id: string;
  options: ResourceStreamOptions;
  state: StreamState;
  subscribers: StreamSubscriber[];
  buffer: StreamChunk[];
  abortController: AbortController;
}
