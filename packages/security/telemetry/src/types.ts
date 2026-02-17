// Security Telemetry Types
// packages/security/telemetry/src/types.ts

export interface TelemetryConfig {
  enabled: boolean;
  level: TelemetryLevel;
  allowedCategories: TelemetryCategory[];
  blockedEndpoints: string[];
  anonymize: boolean;
  localOnly: boolean;
}

export type TelemetryLevel = 'none' | 'crash' | 'errors' | 'usage' | 'all';

export type TelemetryCategory =
  | 'crash'
  | 'error'
  | 'performance'
  | 'usage'
  | 'feature'
  | 'ai'
  | 'extension';

export interface TelemetryEvent {
  id: string;
  timestamp: number;
  category: TelemetryCategory;
  name: string;
  properties?: Record<string, unknown>;
  measurements?: Record<string, number>;
  anonymized: boolean;
}

export interface BlockedRequest {
  timestamp: number;
  url: string;
  method: string;
  reason: string;
  category?: string;
}

export interface AnalyticsConsent {
  userId?: string;
  consentGiven: boolean;
  consentDate?: number;
  categories: TelemetryCategory[];
  revokedDate?: number;
}

export interface PrivacyReport {
  period: { start: number; end: number };
  blockedRequests: number;
  blockedEndpoints: string[];
  localEvents: number;
  transmittedEvents: number;
  categories: Record<TelemetryCategory, number>;
}
