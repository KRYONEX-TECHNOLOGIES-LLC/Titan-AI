// Telemetry Blocker
// packages/security/telemetry/src/telemetry-blocker.ts

import { EventEmitter } from 'events';
import { BlockedRequest } from './types';

// Comprehensive list of known telemetry domains
export const TELEMETRY_DOMAINS = [
  // Microsoft
  'vortex.data.microsoft.com',
  'dc.services.visualstudio.com',
  'mobile.events.data.microsoft.com',
  'telemetry.visualstudio.com',
  'watson.telemetry.microsoft.com',
  'watson.ppe.telemetry.microsoft.com',
  'watson.microsoft.com',
  'umwatsonc.events.data.microsoft.com',
  'ceuswatcab01.blob.core.windows.net',
  'ceuswatcab02.blob.core.windows.net',
  'settings-win.data.microsoft.com',
  
  // Google
  'www.google-analytics.com',
  'ssl.google-analytics.com',
  'google-analytics.com',
  'googleads.g.doubleclick.net',
  'stats.g.doubleclick.net',
  
  // Crash reporting
  'sentry.io',
  'bugsnag.com',
  'crashlytics.com',
  'raygun.io',
  'rollbar.com',
  
  // Analytics
  'amplitude.com',
  'api.amplitude.com',
  'mixpanel.com',
  'api.mixpanel.com',
  'segment.io',
  'api.segment.io',
  'cdn.segment.com',
  'heap.io',
  'heapanalytics.com',
  'fullstory.com',
  'rs.fullstory.com',
  
  // Advertising
  'ads.google.com',
  'pagead2.googlesyndication.com',
  'ad.doubleclick.net',
];

// URL patterns that indicate telemetry
export const TELEMETRY_PATTERNS = [
  /\/telemetry\//i,
  /\/analytics\//i,
  /\/tracking\//i,
  /\/collect\?/i,
  /\/beacon\?/i,
  /\/metrics\?/i,
  /\/stats\?/i,
  /\/event\?/i,
  /\/_track/i,
  /\/pixel\./i,
];

export class TelemetryBlocker extends EventEmitter {
  private blockedDomains: Set<string>;
  private customPatterns: RegExp[] = [];
  private allowlist: Set<string> = new Set();
  private blockedLog: BlockedRequest[] = [];
  private maxLogSize: number = 1000;
  private isActive: boolean = false;

  constructor() {
    super();
    this.blockedDomains = new Set(TELEMETRY_DOMAINS);
  }

  activate(): void {
    this.isActive = true;
    this.emit('blocker:activated');
  }

  deactivate(): void {
    this.isActive = false;
    this.emit('blocker:deactivated');
  }

  shouldBlock(url: string): boolean {
    if (!this.isActive) return false;

    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      // Check allowlist first
      if (this.allowlist.has(hostname)) {
        return false;
      }

      // Check blocked domains
      for (const domain of this.blockedDomains) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
          return true;
        }
      }

      // Check URL patterns
      const fullUrl = url.toLowerCase();
      for (const pattern of [...TELEMETRY_PATTERNS, ...this.customPatterns]) {
        if (pattern.test(fullUrl)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  recordBlocked(url: string, method: string, reason: string): void {
    const record: BlockedRequest = {
      timestamp: Date.now(),
      url: this.sanitizeUrl(url),
      method,
      reason,
    };

    this.blockedLog.push(record);

    if (this.blockedLog.length > this.maxLogSize) {
      this.blockedLog = this.blockedLog.slice(-this.maxLogSize);
    }

    this.emit('request:blocked', record);
  }

  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove sensitive query params
      const sensitiveParams = ['token', 'key', 'secret', 'password', 'auth'];
      for (const param of sensitiveParams) {
        parsed.searchParams.delete(param);
      }
      return parsed.toString();
    } catch {
      return '[invalid-url]';
    }
  }

  addBlockedDomain(domain: string): void {
    const normalized = domain.toLowerCase().replace(/^https?:\/\//, '');
    this.blockedDomains.add(normalized);
    this.allowlist.delete(normalized);
    this.emit('domain:blocked', normalized);
  }

  removeBlockedDomain(domain: string): void {
    const normalized = domain.toLowerCase();
    this.blockedDomains.delete(normalized);
    this.emit('domain:unblocked', normalized);
  }

  addAllowlistDomain(domain: string): void {
    const normalized = domain.toLowerCase().replace(/^https?:\/\//, '');
    this.allowlist.add(normalized);
    this.blockedDomains.delete(normalized);
    this.emit('domain:allowlisted', normalized);
  }

  removeAllowlistDomain(domain: string): void {
    const normalized = domain.toLowerCase();
    this.allowlist.delete(normalized);
    this.emit('domain:removed-from-allowlist', normalized);
  }

  addPattern(pattern: RegExp): void {
    this.customPatterns.push(pattern);
    this.emit('pattern:added', pattern.source);
  }

  removePattern(pattern: RegExp): void {
    const index = this.customPatterns.findIndex(p => p.source === pattern.source);
    if (index !== -1) {
      this.customPatterns.splice(index, 1);
      this.emit('pattern:removed', pattern.source);
    }
  }

  getBlockedDomains(): string[] {
    return Array.from(this.blockedDomains);
  }

  getAllowlist(): string[] {
    return Array.from(this.allowlist);
  }

  getBlockedLog(limit?: number): BlockedRequest[] {
    if (limit) {
      return this.blockedLog.slice(-limit);
    }
    return [...this.blockedLog];
  }

  getStats(): BlockerStats {
    const domainCounts = new Map<string, number>();

    for (const record of this.blockedLog) {
      try {
        const hostname = new URL(record.url).hostname;
        domainCounts.set(hostname, (domainCounts.get(hostname) || 0) + 1);
      } catch {
        // Invalid URL
      }
    }

    const topDomains = Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return {
      isActive: this.isActive,
      totalBlocked: this.blockedLog.length,
      blockedDomainsCount: this.blockedDomains.size,
      allowlistCount: this.allowlist.size,
      customPatternsCount: this.customPatterns.length,
      topBlockedDomains: topDomains,
    };
  }

  clearLog(): void {
    this.blockedLog = [];
    this.emit('log:cleared');
  }

  reset(): void {
    this.blockedDomains = new Set(TELEMETRY_DOMAINS);
    this.customPatterns = [];
    this.allowlist.clear();
    this.blockedLog = [];
    this.emit('blocker:reset');
  }
}

export interface BlockerStats {
  isActive: boolean;
  totalBlocked: number;
  blockedDomainsCount: number;
  allowlistCount: number;
  customPatternsCount: number;
  topBlockedDomains: [string, number][];
}
