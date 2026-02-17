/**
 * Titan AI - Project Midnight
 * Autonomous Factory Architecture for Zero-Intervention Development
 * 
 * @packageDocumentation
 */

// Core exports
export * from './types.js';

// Queue management
export * from './queue/index.js';

// State management
export * from './state/index.js';

// Agent system
export * from './agents/index.js';

// Orchestration
export * from './orchestration/index.js';

// Background service
export * from './service/index.js';

// Version
export const VERSION = '0.1.0';

// Default configuration
export const DEFAULT_CONFIG = {
  snapshotIntervalMs: 5 * 60 * 1000, // 5 minutes
  qualityThreshold: 85,
  maxRetries: 3,
  actorModel: 'claude-4.6-sonnet',
  sentinelModel: 'claude-4.6-opus',
  sentinelEffort: 'max' as const,
} as const;
