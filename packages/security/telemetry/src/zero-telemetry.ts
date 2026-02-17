// Zero Telemetry Enforcer
// packages/security/telemetry/src/zero-telemetry.ts

import { EventEmitter } from 'events';
import {
  TelemetryConfig,
  TelemetryEvent,
  BlockedRequest,
  PrivacyReport,
  TelemetryCategory,
} from './types';

// Known telemetry endpoints to block
const TELEMETRY_ENDPOINTS = [
  // Microsoft
  'vortex.data.microsoft.com',
  'dc.services.visualstudio.com',
  'mobile.events.data.microsoft.com',
  'telemetry.visualstudio.com',
  // Google
  'www.google-analytics.com',
  'ssl.google-analytics.com',
  // Others
  'amplitude.com',
  'mixpanel.com',
  'segment.io',
  'sentry.io',
  'bugsnag.com',
];

export class ZeroTelemetryEnforcer extends EventEmitter {
  private config: TelemetryConfig;
  private blockedRequests: BlockedRequest[] = [];
  private localEvents: TelemetryEvent[] = [];
  private maxHistory: number = 10000;
  private isEnforcing: boolean = false;

  constructor(config?: Partial<TelemetryConfig>) {
    super();
    this.config = {
      enabled: false, // Telemetry OFF by default
      level: 'none',
      allowedCategories: [],
      blockedEndpoints: [...TELEMETRY_ENDPOINTS],
      anonymize: true,
      localOnly: true,
      ...config,
    };
  }

  enable(): void {
    this.isEnforcing = true;
    this.patchGlobalFetch();
    this.patchXHR();
    this.emit('enforcer:enabled');
  }

  disable(): void {
    this.isEnforcing = false;
    this.emit('enforcer:disabled');
  }

  private patchGlobalFetch(): void {
    if (typeof globalThis.fetch !== 'function') return;

    const originalFetch = globalThis.fetch;
    const self = this;

    globalThis.fetch = async function(input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      
      if (self.shouldBlock(url)) {
        self.recordBlockedRequest(url, init?.method || 'GET', 'telemetry-blocked');
        return new Response(null, { status: 204 });
      }

      return originalFetch.call(this, input, init);
    };
  }

  private patchXHR(): void {
    if (typeof XMLHttpRequest === 'undefined') return;

    const originalOpen = XMLHttpRequest.prototype.open;
    const self = this;

    XMLHttpRequest.prototype.open = function(
      method: string,
      url: string | URL,
      ...args: any[]
    ) {
      const urlStr = url.toString();

      if (self.shouldBlock(urlStr)) {
        self.recordBlockedRequest(urlStr, method, 'telemetry-blocked');
        // Override send to do nothing
        this.send = () => {};
        return;
      }

      return originalOpen.call(this, method, url, ...args);
    };
  }

  private shouldBlock(url: string): boolean {
    if (!this.isEnforcing) return false;

    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      for (const endpoint of this.config.blockedEndpoints) {
        if (hostname.includes(endpoint) || hostname.endsWith(endpoint)) {
          return true;
        }
      }
    } catch {
      // Invalid URL
    }

    return false;
  }

  private recordBlockedRequest(url: string, method: string, reason: string): void {
    const blocked: BlockedRequest = {
      timestamp: Date.now(),
      url: this.anonymizeUrl(url),
      method,
      reason,
    };

    this.blockedRequests.push(blocked);
    
    // Trim history
    if (this.blockedRequests.length > this.maxHistory) {
      this.blockedRequests = this.blockedRequests.slice(-this.maxHistory);
    }

    this.emit('request:blocked', blocked);
  }

  private anonymizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove query params and hash
      return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
    } catch {
      return '[invalid-url]';
    }
  }

  recordLocalEvent(event: Omit<TelemetryEvent, 'id' | 'timestamp' | 'anonymized'>): void {
    if (!this.config.allowedCategories.includes(event.category)) {
      return;
    }

    const fullEvent: TelemetryEvent = {
      ...event,
      id: this.generateId(),
      timestamp: Date.now(),
      anonymized: this.config.anonymize,
      properties: this.config.anonymize
        ? this.anonymizeProperties(event.properties)
        : event.properties,
    };

    this.localEvents.push(fullEvent);

    // Trim history
    if (this.localEvents.length > this.maxHistory) {
      this.localEvents = this.localEvents.slice(-this.maxHistory);
    }

    this.emit('event:recorded', fullEvent);
  }

  private anonymizeProperties(
    properties?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!properties) return undefined;

    const anonymized: Record<string, unknown> = {};
    const sensitiveKeys = ['path', 'file', 'user', 'email', 'name', 'ip', 'host'];

    for (const [key, value] of Object.entries(properties)) {
      const lowerKey = key.toLowerCase();
      
      if (sensitiveKeys.some(k => lowerKey.includes(k))) {
        anonymized[key] = '[redacted]';
      } else if (typeof value === 'string' && value.length > 100) {
        anonymized[key] = value.substring(0, 50) + '...[truncated]';
      } else {
        anonymized[key] = value;
      }
    }

    return anonymized;
  }

  addBlockedEndpoint(endpoint: string): void {
    if (!this.config.blockedEndpoints.includes(endpoint)) {
      this.config.blockedEndpoints.push(endpoint);
      this.emit('endpoint:blocked', endpoint);
    }
  }

  removeBlockedEndpoint(endpoint: string): void {
    const index = this.config.blockedEndpoints.indexOf(endpoint);
    if (index !== -1) {
      this.config.blockedEndpoints.splice(index, 1);
      this.emit('endpoint:unblocked', endpoint);
    }
  }

  getBlockedRequests(limit?: number): BlockedRequest[] {
    if (limit) {
      return this.blockedRequests.slice(-limit);
    }
    return [...this.blockedRequests];
  }

  getLocalEvents(limit?: number): TelemetryEvent[] {
    if (limit) {
      return this.localEvents.slice(-limit);
    }
    return [...this.localEvents];
  }

  generatePrivacyReport(periodDays: number = 30): PrivacyReport {
    const now = Date.now();
    const periodStart = now - (periodDays * 24 * 60 * 60 * 1000);

    const periodBlocked = this.blockedRequests.filter(r => r.timestamp >= periodStart);
    const periodEvents = this.localEvents.filter(e => e.timestamp >= periodStart);

    const categories: Record<TelemetryCategory, number> = {
      crash: 0,
      error: 0,
      performance: 0,
      usage: 0,
      feature: 0,
      ai: 0,
      extension: 0,
    };

    for (const event of periodEvents) {
      categories[event.category]++;
    }

    const uniqueEndpoints = [...new Set(periodBlocked.map(r => {
      try {
        return new URL(r.url).hostname;
      } catch {
        return r.url;
      }
    }))];

    return {
      period: { start: periodStart, end: now },
      blockedRequests: periodBlocked.length,
      blockedEndpoints: uniqueEndpoints,
      localEvents: periodEvents.length,
      transmittedEvents: 0, // Always 0 in zero-telemetry mode
      categories,
    };
  }

  clearHistory(): void {
    this.blockedRequests = [];
    this.localEvents = [];
    this.emit('history:cleared');
  }

  getConfig(): TelemetryConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<TelemetryConfig>): void {
    this.config = { ...this.config, ...updates };
    this.emit('config:updated', this.config);
  }

  private generateId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
