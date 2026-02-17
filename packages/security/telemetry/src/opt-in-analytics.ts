// Opt-In Analytics
// packages/security/telemetry/src/opt-in-analytics.ts

import { EventEmitter } from 'events';
import {
  TelemetryConfig,
  TelemetryEvent,
  TelemetryCategory,
  AnalyticsConsent,
} from './types';

export class OptInAnalytics extends EventEmitter {
  private consent: AnalyticsConsent | null = null;
  private events: TelemetryEvent[] = [];
  private config: TelemetryConfig;
  private transmissionQueue: TelemetryEvent[] = [];
  private isProcessing: boolean = false;

  constructor(config?: Partial<TelemetryConfig>) {
    super();
    this.config = {
      enabled: false,
      level: 'none',
      allowedCategories: [],
      blockedEndpoints: [],
      anonymize: true,
      localOnly: true,
      ...config,
    };
  }

  grantConsent(categories: TelemetryCategory[]): void {
    this.consent = {
      consentGiven: true,
      consentDate: Date.now(),
      categories,
    };

    this.config.enabled = true;
    this.config.allowedCategories = categories;
    this.config.localOnly = false;

    this.emit('consent:granted', this.consent);
  }

  revokeConsent(): void {
    if (this.consent) {
      this.consent = {
        ...this.consent,
        consentGiven: false,
        revokedDate: Date.now(),
      };
    }

    this.config.enabled = false;
    this.config.allowedCategories = [];
    this.config.localOnly = true;

    // Clear any queued events
    this.transmissionQueue = [];

    this.emit('consent:revoked');
  }

  hasConsent(category?: TelemetryCategory): boolean {
    if (!this.consent?.consentGiven) return false;
    if (!category) return true;
    return this.consent.categories.includes(category);
  }

  getConsent(): AnalyticsConsent | null {
    return this.consent ? { ...this.consent } : null;
  }

  track(
    category: TelemetryCategory,
    name: string,
    properties?: Record<string, unknown>,
    measurements?: Record<string, number>
  ): void {
    if (!this.hasConsent(category)) {
      return;
    }

    const event: TelemetryEvent = {
      id: this.generateId(),
      timestamp: Date.now(),
      category,
      name,
      properties: this.config.anonymize 
        ? this.anonymizeProperties(properties)
        : properties,
      measurements,
      anonymized: this.config.anonymize,
    };

    this.events.push(event);

    if (!this.config.localOnly) {
      this.transmissionQueue.push(event);
      this.processQueue();
    }

    this.emit('event:tracked', event);
  }

  trackError(error: Error, properties?: Record<string, unknown>): void {
    this.track('error', error.name, {
      message: error.message,
      // Don't include stack traces as they may contain sensitive paths
      ...properties,
    });
  }

  trackCrash(error: Error): void {
    this.track('crash', 'application_crash', {
      message: error.message,
      type: error.name,
    });
  }

  trackPerformance(
    name: string,
    durationMs: number,
    properties?: Record<string, unknown>
  ): void {
    this.track('performance', name, properties, { duration: durationMs });
  }

  trackFeature(
    feature: string,
    action: string,
    properties?: Record<string, unknown>
  ): void {
    this.track('feature', `${feature}_${action}`, properties);
  }

  trackAIUsage(
    model: string,
    action: string,
    tokensUsed?: number,
    latencyMs?: number
  ): void {
    this.track(
      'ai',
      `ai_${action}`,
      { model },
      {
        ...(tokensUsed !== undefined && { tokens: tokensUsed }),
        ...(latencyMs !== undefined && { latency: latencyMs }),
      }
    );
  }

  private anonymizeProperties(
    properties?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!properties) return undefined;

    const anonymized: Record<string, unknown> = {};
    const sensitivePatterns = [
      /path/i, /file/i, /dir/i, /user/i, /email/i,
      /name/i, /ip/i, /host/i, /token/i, /key/i, /secret/i,
    ];

    for (const [key, value] of Object.entries(properties)) {
      const isSensitive = sensitivePatterns.some(p => p.test(key));

      if (isSensitive) {
        anonymized[key] = '[redacted]';
      } else if (typeof value === 'string') {
        // Hash long strings
        if (value.length > 50) {
          anonymized[key] = `${value.substring(0, 20)}...[hashed]`;
        } else {
          anonymized[key] = value;
        }
      } else {
        anonymized[key] = value;
      }
    }

    return anonymized;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.transmissionQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const batch = this.transmissionQueue.splice(0, 100);
      
      // In a real implementation, this would send to an analytics endpoint
      // For now, we just emit an event
      this.emit('events:transmitted', { count: batch.length, events: batch });
    } catch (error) {
      // Re-queue failed events
      this.emit('transmission:error', error);
    } finally {
      this.isProcessing = false;

      // Process remaining queue
      if (this.transmissionQueue.length > 0) {
        setTimeout(() => this.processQueue(), 1000);
      }
    }
  }

  getEvents(
    filter?: {
      category?: TelemetryCategory;
      since?: number;
      limit?: number;
    }
  ): TelemetryEvent[] {
    let filtered = [...this.events];

    if (filter?.category) {
      filtered = filtered.filter(e => e.category === filter.category);
    }

    if (filter?.since) {
      filtered = filtered.filter(e => e.timestamp >= filter.since);
    }

    if (filter?.limit) {
      filtered = filtered.slice(-filter.limit);
    }

    return filtered;
  }

  getStats(): AnalyticsStats {
    const categories: Record<TelemetryCategory, number> = {
      crash: 0,
      error: 0,
      performance: 0,
      usage: 0,
      feature: 0,
      ai: 0,
      extension: 0,
    };

    for (const event of this.events) {
      categories[event.category]++;
    }

    return {
      totalEvents: this.events.length,
      queuedForTransmission: this.transmissionQueue.length,
      categories,
      consentGiven: this.consent?.consentGiven || false,
    };
  }

  clearEvents(): void {
    this.events = [];
    this.transmissionQueue = [];
    this.emit('events:cleared');
  }

  private generateId(): string {
    return `ana-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export interface AnalyticsStats {
  totalEvents: number;
  queuedForTransmission: number;
  categories: Record<TelemetryCategory, number>;
  consentGiven: boolean;
}
