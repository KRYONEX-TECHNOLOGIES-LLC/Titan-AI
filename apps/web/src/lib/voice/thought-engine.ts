'use client';

import { useTitanVoice } from '@/stores/titan-voice.store';

export type ThoughtCategory =
  | 'project_improvement'
  | 'new_idea'
  | 'check_in'
  | 'knowledge_share'
  | 'warning'
  | 'motivation';

export interface ProactiveThought {
  id: string;
  category: ThoughtCategory;
  text: string;
  timestamp: number;
  spoken: boolean;
}

const CATEGORY_WEIGHTS: Record<ThoughtCategory, number> = {
  project_improvement: 30,
  new_idea: 20,
  check_in: 15,
  knowledge_share: 15,
  warning: 10,
  motivation: 10,
};

const CATEGORY_PROMPTS: Record<ThoughtCategory, string> = {
  project_improvement: 'Suggest a specific, actionable improvement for the current project based on what you know. Be concise (1-2 sentences).',
  new_idea: 'Share an innovative idea for a new tool, feature, or project based on current tech trends. Be exciting and specific (1-2 sentences).',
  check_in: 'Check in on the user. Ask how the current work is going or offer help. Be warm and brotherly (1 sentence).',
  knowledge_share: 'Share an interesting technical fact, best practice, or recent discovery that could be useful. Be concise (1-2 sentences).',
  warning: 'Alert about a potential issue you\'ve noticed — could be about code quality, security, performance, or process. Be specific (1-2 sentences).',
  motivation: 'Encourage the user about their progress or the project\'s potential. Be genuine and specific, not generic (1 sentence).',
};

function weightedRandom(): ThoughtCategory {
  const total = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [cat, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    r -= weight;
    if (r <= 0) return cat as ThoughtCategory;
  }
  return 'check_in';
}

function randomInterval(minMs: number, maxMs: number): number {
  return minMs + Math.random() * (maxMs - minMs);
}

export type ActivityLevel = 'idle' | 'active' | 'coding';

export class TitanThoughtEngine {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private activityLevel: ActivityLevel = 'idle';
  private lastActivity = Date.now();
  private sessionStart = Date.now();
  private thoughtCount = 0;
  private onThought: ((thought: ProactiveThought) => void) | null = null;
  private running = false;
  private contextProvider: (() => string) | null = null;

  start(onThought: (thought: ProactiveThought) => void, contextProvider?: () => string) {
    if (this.running) return;
    this.running = true;
    this.onThought = onThought;
    this.contextProvider = contextProvider || null;
    this.sessionStart = Date.now();
    this.scheduleNext();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.onThought = null;
  }

  reportActivity(level: ActivityLevel) {
    this.activityLevel = level;
    this.lastActivity = Date.now();
  }

  private getIntervalRange(): [number, number] {
    switch (this.activityLevel) {
      case 'idle':
        return [45_000, 120_000];
      case 'active':
        return [120_000, 300_000];
      case 'coding':
        return [180_000, 480_000];
    }
  }

  private scheduleNext() {
    if (!this.running) return;

    const [min, max] = this.getIntervalRange();
    const delay = randomInterval(min, max);

    this.timer = setTimeout(() => {
      void this.generateThought();
    }, delay);
  }

  private async generateThought() {
    if (!this.running || !this.onThought) return;

    const voiceState = useTitanVoice.getState();
    if (voiceState.isThoughtsSnoozed()) {
      this.scheduleNext();
      return;
    }

    const category = weightedRandom();
    const context = this.contextProvider?.() || '';

    try {
      const thought = await this.buildThought(category, context);
      if (thought && this.running) {
        this.thoughtCount++;
        this.onThought(thought);
      }
    } catch {
      // generation failed, schedule next
    }

    this.scheduleNext();
  }

  private async buildThought(category: ThoughtCategory, context: string): Promise<ProactiveThought | null> {
    const prompt = CATEGORY_PROMPTS[category];

    try {
      const response = await fetch('/api/titan/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[PROACTIVE THOUGHT - ${category.toUpperCase()}]\n${prompt}\n\nContext: ${context || 'General session, user has been working for ' + Math.round((Date.now() - this.sessionStart) / 60000) + ' minutes.'}`,
          conversationHistory: [],
        }),
      });

      if (!response.ok || !response.body) return null;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let thoughtText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evt of events) {
          const lines = evt.split('\n');
          let eventType = '';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (eventType === 'voice_response' && data) {
            try {
              const payload = JSON.parse(data) as { content?: string };
              thoughtText = payload.content || '';
            } catch { /* skip */ }
          }
        }
      }

      if (!thoughtText.trim()) return null;

      return {
        id: `thought-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        category,
        text: thoughtText.trim(),
        timestamp: Date.now(),
        spoken: false,
      };
    } catch {
      return null;
    }
  }

  getStats() {
    return {
      running: this.running,
      thoughtCount: this.thoughtCount,
      activityLevel: this.activityLevel,
      sessionDurationMin: Math.round((Date.now() - this.sessionStart) / 60000),
    };
  }
}

let engineInstance: TitanThoughtEngine | null = null;

export function getThoughtEngine(): TitanThoughtEngine {
  if (!engineInstance) {
    engineInstance = new TitanThoughtEngine();
  }
  return engineInstance;
}
