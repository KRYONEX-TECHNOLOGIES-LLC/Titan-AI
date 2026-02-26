'use client';

import { saveBrainEntry, type BrainCategory } from './brain-storage';

export interface LearnedItem {
  topic: string;
  content: string;
  category: BrainCategory;
  source: string;
  learnedAt: string;
}

type LearnerState = 'idle' | 'running' | 'paused';

const LEARN_TOPICS = [
  { topic: 'TypeScript best practices 2026', category: 'skill' as BrainCategory },
  { topic: 'React Server Components patterns', category: 'skill' as BrainCategory },
  { topic: 'AI agent architecture patterns', category: 'knowledge' as BrainCategory },
  { topic: 'LLM fine-tuning techniques', category: 'knowledge' as BrainCategory },
  { topic: 'startup growth strategies', category: 'idea' as BrainCategory },
  { topic: 'developer productivity tools', category: 'idea' as BrainCategory },
  { topic: 'cybersecurity threats 2026', category: 'knowledge' as BrainCategory },
  { topic: 'real estate investment strategies', category: 'knowledge' as BrainCategory },
  { topic: 'stock market analysis techniques', category: 'knowledge' as BrainCategory },
  { topic: 'chess opening strategies', category: 'skill' as BrainCategory },
  { topic: 'military strategy and leadership', category: 'knowledge' as BrainCategory },
  { topic: 'business scaling strategies', category: 'knowledge' as BrainCategory },
  { topic: 'neural network optimization', category: 'skill' as BrainCategory },
  { topic: 'Rust systems programming', category: 'skill' as BrainCategory },
  { topic: 'distributed systems design', category: 'knowledge' as BrainCategory },
];

const LEARN_INTERVAL_MS = 600_000; // 10 minutes
const MARKET_CACHE_TTL_MS = 300_000; // 5 minutes

class AutoLearner {
  private state: LearnerState = 'idle';
  private timer: ReturnType<typeof setInterval> | null = null;
  private topicIndex = 0;
  private learnedCount = 0;
  private lastMarketCheck = 0;
  private marketSummary = '';
  private history: LearnedItem[] = [];

  start() {
    if (this.state === 'running') return;
    this.state = 'running';
    this.timer = setInterval(() => void this.learnNext(), LEARN_INTERVAL_MS);
    setTimeout(() => void this.learnNext(), 5000);
  }

  stop() {
    this.state = 'idle';
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.state === 'running';
  }

  getStats() {
    return {
      state: this.state,
      learnedCount: this.learnedCount,
      currentTopic: LEARN_TOPICS[this.topicIndex % LEARN_TOPICS.length].topic,
      historyCount: this.history.length,
    };
  }

  async getMarketSummary(): Promise<string> {
    if (this.marketSummary && Date.now() - this.lastMarketCheck < MARKET_CACHE_TTL_MS) {
      return this.marketSummary;
    }
    try {
      const { quickResearch } = await import('./web-browser');
      this.marketSummary = await quickResearch('Current stock market summary, S&P 500, Bitcoin price, major tech stocks today');
      this.lastMarketCheck = Date.now();
      return this.marketSummary || 'Unable to fetch market data right now.';
    } catch {
      return 'Market data unavailable.';
    }
  }

  private async learnNext() {
    if (this.state !== 'running') return;

    const entry = LEARN_TOPICS[this.topicIndex % LEARN_TOPICS.length];
    this.topicIndex++;

    try {
      const { quickResearch } = await import('./web-browser');
      const content = await quickResearch(entry.topic);
      if (!content || content.length < 30) return;

      const item: LearnedItem = {
        topic: entry.topic,
        content: content.slice(0, 500),
        category: entry.category,
        source: 'auto-learner',
        learnedAt: new Date().toISOString(),
      };

      this.history.push(item);
      if (this.history.length > 100) this.history = this.history.slice(-80);
      this.learnedCount++;

      await saveBrainEntry({
        category: entry.category,
        content: `[${entry.topic}] ${content.slice(0, 400)}`,
        source: 'auto-learner',
        importance: 5,
        metadata: { topic: entry.topic, learnedAt: item.learnedAt },
      });
    } catch { /* learning is best-effort */ }
  }
}

let instance: AutoLearner | null = null;

export function getAutoLearner(): AutoLearner {
  if (!instance) instance = new AutoLearner();
  return instance;
}
