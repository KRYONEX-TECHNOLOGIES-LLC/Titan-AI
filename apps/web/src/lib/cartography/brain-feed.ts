'use client';

import { saveBrainEntryBatch } from '@/lib/voice/brain-storage';
import type { CartographyResult } from './types';

const FEED_LS_KEY = 'titan-cartography-last-brain-feed';
const FEED_COOLDOWN_MS = 30 * 60 * 1000;

export function feedCartographyToBrain(result: CartographyResult): number {
  const lastFeed = localStorage.getItem(FEED_LS_KEY);
  if (lastFeed && Date.now() - parseInt(lastFeed, 10) < FEED_COOLDOWN_MS) return 0;

  const entries: Array<{
    category: 'knowledge';
    content: string;
    source: string;
    importance: number;
    metadata?: Record<string, unknown>;
  }> = [];

  if (result.analysis.architectureSummary) {
    entries.push({
      category: 'knowledge',
      content: `[Architecture] ${result.analysis.architectureSummary}`,
      source: 'cartographer',
      importance: 8,
      metadata: { type: 'architecture', healthScore: result.analysis.healthScore },
    });
  }

  if (result.analysis.hotspotAnalysis) {
    entries.push({
      category: 'knowledge',
      content: `[Hotspots] ${result.analysis.hotspotAnalysis}`,
      source: 'cartographer',
      importance: 7,
    });
  }

  for (const suggestion of result.analysis.refactoringSuggestions.slice(0, 3)) {
    entries.push({
      category: 'knowledge',
      content: `[Refactoring] ${suggestion}`,
      source: 'cartographer',
      importance: 6,
    });
  }

  for (const risk of result.analysis.risks.slice(0, 3)) {
    entries.push({
      category: 'knowledge',
      content: `[Risk] ${risk}`,
      source: 'cartographer',
      importance: 7,
    });
  }

  const critical = result.graph.nodes.filter(n => n.hotspotCategory === 'critical').slice(0, 5);
  if (critical.length > 0) {
    entries.push({
      category: 'knowledge',
      content: `[Critical Files] ${critical.map(n => `${n.path} (fan-in:${n.fanIn}, fan-out:${n.fanOut}, score:${n.hotspotScore})`).join('; ')}`,
      source: 'cartographer',
      importance: 7,
    });
  }

  if (entries.length === 0) return 0;

  saveBrainEntryBatch(entries);
  localStorage.setItem(FEED_LS_KEY, String(Date.now()));
  return entries.length;
}
