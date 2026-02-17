// MCP Backpressure Controller
// packages/mcp/streaming/src/backpressure.ts

import { BackpressureConfig } from './types';

export class BackpressureController {
  private config: BackpressureConfig;
  private streamBuffers: Map<string, StreamBuffer> = new Map();

  constructor(config: BackpressureConfig) {
    this.config = config;
  }

  addBytes(streamId: string, bytes: number): void {
    let buffer = this.streamBuffers.get(streamId);
    if (!buffer) {
      buffer = {
        size: 0,
        paused: false,
        dropped: 0,
      };
      this.streamBuffers.set(streamId, buffer);
    }

    if (this.config.strategy === 'drop' && buffer.size >= this.config.maxBufferSize) {
      buffer.dropped++;
      return;
    }

    buffer.size += bytes;

    if (buffer.size >= this.config.pauseThreshold && !buffer.paused) {
      buffer.paused = true;
    }
  }

  consumeBytes(streamId: string, bytes: number): void {
    const buffer = this.streamBuffers.get(streamId);
    if (buffer) {
      buffer.size = Math.max(0, buffer.size - bytes);

      if (buffer.size <= this.config.resumeThreshold && buffer.paused) {
        buffer.paused = false;
      }
    }
  }

  shouldPause(streamId: string): boolean {
    if (this.config.strategy !== 'pause') {
      return false;
    }

    const buffer = this.streamBuffers.get(streamId);
    return buffer?.paused || false;
  }

  getBufferStatus(streamId: string): BufferStatus | undefined {
    const buffer = this.streamBuffers.get(streamId);
    if (!buffer) return undefined;

    return {
      size: buffer.size,
      paused: buffer.paused,
      dropped: buffer.dropped,
      utilizationPercent: (buffer.size / this.config.maxBufferSize) * 100,
    };
  }

  getAllBufferStatuses(): Map<string, BufferStatus> {
    const statuses = new Map<string, BufferStatus>();

    for (const [streamId, buffer] of this.streamBuffers) {
      statuses.set(streamId, {
        size: buffer.size,
        paused: buffer.paused,
        dropped: buffer.dropped,
        utilizationPercent: (buffer.size / this.config.maxBufferSize) * 100,
      });
    }

    return statuses;
  }

  clearStream(streamId: string): void {
    this.streamBuffers.delete(streamId);
  }

  clearAll(): void {
    this.streamBuffers.clear();
  }

  updateConfig(config: Partial<BackpressureConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): BackpressureConfig {
    return { ...this.config };
  }
}

interface StreamBuffer {
  size: number;
  paused: boolean;
  dropped: number;
}

export interface BufferStatus {
  size: number;
  paused: boolean;
  dropped: number;
  utilizationPercent: number;
}

// Adaptive backpressure controller that adjusts thresholds based on performance
export class AdaptiveBackpressureController extends BackpressureController {
  private metrics: PerformanceMetrics = {
    avgProcessingTime: 0,
    sampleCount: 0,
    lastAdjustment: Date.now(),
  };

  private readonly minAdjustmentInterval = 5000; // 5 seconds

  recordProcessingTime(streamId: string, durationMs: number): void {
    this.metrics.sampleCount++;
    this.metrics.avgProcessingTime =
      (this.metrics.avgProcessingTime * (this.metrics.sampleCount - 1) + durationMs) /
      this.metrics.sampleCount;

    this.maybeAdjustThresholds();
  }

  private maybeAdjustThresholds(): void {
    const now = Date.now();
    if (now - this.metrics.lastAdjustment < this.minAdjustmentInterval) {
      return;
    }

    const config = this.getConfig();

    // If processing is slow, lower the pause threshold to prevent buffer overflow
    if (this.metrics.avgProcessingTime > 100) {
      const newPauseThreshold = Math.max(
        config.resumeThreshold * 1.5,
        config.pauseThreshold * 0.9
      );
      this.updateConfig({ pauseThreshold: newPauseThreshold });
    }
    // If processing is fast, we can increase the pause threshold
    else if (this.metrics.avgProcessingTime < 20) {
      const newPauseThreshold = Math.min(
        config.maxBufferSize * 0.9,
        config.pauseThreshold * 1.1
      );
      this.updateConfig({ pauseThreshold: newPauseThreshold });
    }

    this.metrics.lastAdjustment = now;
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }
}

interface PerformanceMetrics {
  avgProcessingTime: number;
  sampleCount: number;
  lastAdjustment: number;
}
