'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ═══════════════════════════════════════════════════════════════════════
// TITAN PERSISTENT MEMORY — God-tier cross-conversation recall system
//
// Architecture:
//   Layer 1 — CORE FACTS: user identity, preferences, project context
//   Layer 2 — DECISIONS: architectural choices, tech stack, conventions
//   Layer 3 — ACTIVE CONTEXT: current tasks, recent changes, WIP state
//   Layer 4 — CONVERSATION SUMMARIES: compressed history of past sessions
//   Layer 5 — ERROR PATTERNS: mistakes, anti-patterns, things to avoid
//
// Persistence: localStorage (instant) + optional Supabase (cloud sync)
// Injection: Serialized into system prompt prefix on every message
// ═══════════════════════════════════════════════════════════════════════

export interface MemoryFact {
  id: string;
  layer: 'core' | 'decision' | 'context' | 'summary' | 'error_pattern';
  category: string;
  content: string;
  importance: number; // 1-10, higher = always included
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;  // null = permanent
  source: string; // 'user', 'auto', 'system'
  tags: string[];
}

export interface ConversationSummary {
  id: string;
  sessionId: string;
  summary: string;
  keyDecisions: string[];
  filesModified: string[];
  timestamp: number;
}

interface TitanMemoryState {
  facts: Record<string, MemoryFact>;
  summaries: ConversationSummary[];
  lastInjectedAt: number;
  version: number;

  // Core operations
  addFact: (fact: Omit<MemoryFact, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateFact: (id: string, updates: Partial<MemoryFact>) => void;
  removeFact: (id: string) => void;
  getFacts: (layer?: MemoryFact['layer']) => MemoryFact[];
  findFacts: (query: string) => MemoryFact[];

  // Summaries
  addSummary: (summary: Omit<ConversationSummary, 'id' | 'timestamp'>) => void;

  // Auto-extraction
  extractAndStore: (userMessage: string, assistantResponse: string, filesChanged?: string[]) => void;

  // Serialization for system prompt injection
  serialize: (maxTokens?: number) => string;

  // Maintenance
  cleanup: () => void;
  clearAll: () => void;
}

let factCounter = 0;
function genId(): string {
  return `mem-${Date.now()}-${++factCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

// Keyword extraction for auto-storing important context
const IMPORTANT_PATTERNS: Array<{ pattern: RegExp; category: string; layer: MemoryFact['layer']; importance: number }> = [
  { pattern: /my (?:name|email|username) is (\S+)/i, category: 'identity', layer: 'core', importance: 10 },
  { pattern: /(?:i (?:prefer|like|want|need|use)|always use|switch to) (.{5,80})/i, category: 'preference', layer: 'core', importance: 8 },
  { pattern: /(?:the (?:project|app|codebase) (?:is|uses|runs)) (.{5,120})/i, category: 'project', layer: 'core', importance: 9 },
  { pattern: /(?:we (?:decided|chose|picked|went with|are using)) (.{5,120})/i, category: 'decision', layer: 'decision', importance: 9 },
  { pattern: /(?:don't|never|stop|avoid|quit) (.{5,80})/i, category: 'anti-pattern', layer: 'error_pattern', importance: 8 },
  { pattern: /(?:remember|keep in mind|note that|important:) (.{5,200})/i, category: 'user-note', layer: 'core', importance: 10 },
  { pattern: /(?:bug|error|issue|problem|broke|broken|crash|fail) (?:in|with|when|at) (.{5,120})/i, category: 'known-issue', layer: 'error_pattern', importance: 7 },
  { pattern: /(?:deploy|push|release|version|tag) (?:to|on|at) (.{5,80})/i, category: 'deployment', layer: 'context', importance: 6 },
  { pattern: /(?:api key|token|secret|credential|password) (?:is|for|at) (.{5,60})/i, category: 'sensitive', layer: 'core', importance: 9 },
  { pattern: /(?:working on|building|creating|implementing|currently) (.{5,120})/i, category: 'active-work', layer: 'context', importance: 7 },
  { pattern: /(?:stack|tech|framework|library|database|backend|frontend) (?:is|uses|includes) (.{5,120})/i, category: 'tech-stack', layer: 'core', importance: 9 },
];

export const useTitanMemory = create<TitanMemoryState>()(
  persist(
    (set, get) => ({
      facts: {},
      summaries: [],
      lastInjectedAt: 0,
      version: 1,

      addFact: (factData) => {
        const id = genId();
        const now = Date.now();
        const fact: MemoryFact = {
          ...factData,
          id,
          createdAt: now,
          updatedAt: now,
        };

        // Deduplicate: if a fact with same category+content exists, update instead
        const existing = Object.values(get().facts).find(
          f => f.category === fact.category && f.content.toLowerCase() === fact.content.toLowerCase()
        );
        if (existing) {
          set(state => ({
            facts: {
              ...state.facts,
              [existing.id]: { ...existing, updatedAt: now, importance: Math.max(existing.importance, fact.importance) },
            },
          }));
          return existing.id;
        }

        set(state => ({ facts: { ...state.facts, [id]: fact } }));
        return id;
      },

      updateFact: (id, updates) => {
        set(state => {
          const existing = state.facts[id];
          if (!existing) return state;
          return {
            facts: {
              ...state.facts,
              [id]: { ...existing, ...updates, updatedAt: Date.now() },
            },
          };
        });
      },

      removeFact: (id) => {
        set(state => {
          const { [id]: _, ...rest } = state.facts;
          return { facts: rest };
        });
      },

      getFacts: (layer) => {
        const facts = Object.values(get().facts);
        const now = Date.now();
        const active = facts.filter(f => !f.expiresAt || f.expiresAt > now);
        if (layer) return active.filter(f => f.layer === layer);
        return active;
      },

      findFacts: (query) => {
        const q = query.toLowerCase();
        const terms = q.split(/\s+/).filter(t => t.length > 2);
        return Object.values(get().facts)
          .map(f => {
            const hay = `${f.content} ${f.category} ${f.tags.join(' ')}`.toLowerCase();
            const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
            return { fact: f, score };
          })
          .filter(x => x.score > 0)
          .sort((a, b) => b.score - a.score || b.fact.importance - a.fact.importance)
          .map(x => x.fact);
      },

      addSummary: (summaryData) => {
        const summary: ConversationSummary = {
          ...summaryData,
          id: genId(),
          timestamp: Date.now(),
        };
        set(state => ({
          summaries: [...state.summaries.slice(-49), summary],
        }));
      },

      extractAndStore: (userMessage, assistantResponse, filesChanged) => {
        const store = get();
        const combined = `${userMessage}\n${assistantResponse}`;

        for (const { pattern, category, layer, importance } of IMPORTANT_PATTERNS) {
          const match = userMessage.match(pattern);
          if (match && match[1]) {
            store.addFact({
              layer,
              category,
              content: match[1].trim(),
              importance,
              expiresAt: layer === 'context' ? Date.now() + 7 * 24 * 60 * 60 * 1000 : null,
              source: 'auto',
              tags: [category],
            });
          }
        }

        // Track files modified for context awareness
        if (filesChanged && filesChanged.length > 0) {
          store.addFact({
            layer: 'context',
            category: 'files-modified',
            content: `Recently modified: ${filesChanged.slice(0, 10).join(', ')}`,
            importance: 5,
            expiresAt: Date.now() + 24 * 60 * 60 * 1000,
            source: 'auto',
            tags: ['files'],
          });
        }

        // Detect model/protocol mentions for preference tracking
        const modelMatch = combined.match(/(?:use|switch to|select|chose|using) (titan[- ]\w+|phoenix|omega|supreme|sniper|gemini|claude|gpt|deepseek|qwen)/i);
        if (modelMatch) {
          store.addFact({
            layer: 'core',
            category: 'model-preference',
            content: `User prefers/uses: ${modelMatch[1]}`,
            importance: 7,
            expiresAt: null,
            source: 'auto',
            tags: ['model', 'preference'],
          });
        }
      },

      serialize: (maxTokens = 3000) => {
        const store = get();
        const now = Date.now();
        const activeFacts = Object.values(store.facts)
          .filter(f => !f.expiresAt || f.expiresAt > now)
          .sort((a, b) => b.importance - a.importance || b.updatedAt - a.updatedAt);

        if (activeFacts.length === 0 && store.summaries.length === 0) return '';

        const sections: string[] = [];
        sections.push('=== TITAN PERSISTENT MEMORY ===');
        sections.push('(This is your memory from past conversations. Use it to stay consistent and never repeat mistakes.)');

        // Layer 1: Core facts (always include)
        const core = activeFacts.filter(f => f.layer === 'core');
        if (core.length > 0) {
          sections.push('\n[CORE FACTS]');
          for (const f of core.slice(0, 20)) {
            sections.push(`- [${f.category}] ${f.content}`);
          }
        }

        // Layer 2: Decisions
        const decisions = activeFacts.filter(f => f.layer === 'decision');
        if (decisions.length > 0) {
          sections.push('\n[DECISIONS & ARCHITECTURE]');
          for (const f of decisions.slice(0, 15)) {
            sections.push(`- ${f.content}`);
          }
        }

        // Layer 5: Error patterns (critical for avoiding repeats)
        const errors = activeFacts.filter(f => f.layer === 'error_pattern');
        if (errors.length > 0) {
          sections.push('\n[MISTAKES & ANTI-PATTERNS — DO NOT REPEAT]');
          for (const f of errors.slice(0, 10)) {
            sections.push(`- ${f.content}`);
          }
        }

        // Layer 3: Active context
        const context = activeFacts.filter(f => f.layer === 'context');
        if (context.length > 0) {
          sections.push('\n[ACTIVE CONTEXT]');
          for (const f of context.slice(0, 10)) {
            sections.push(`- ${f.content}`);
          }
        }

        // Layer 4: Recent summaries
        const recentSummaries = store.summaries.slice(-5);
        if (recentSummaries.length > 0) {
          sections.push('\n[RECENT CONVERSATION SUMMARIES]');
          for (const s of recentSummaries) {
            const ago = Math.round((now - s.timestamp) / 60000);
            const agoLabel = ago < 60 ? `${ago}m ago` : ago < 1440 ? `${Math.round(ago / 60)}h ago` : `${Math.round(ago / 1440)}d ago`;
            sections.push(`- (${agoLabel}) ${s.summary}`);
            if (s.keyDecisions.length > 0) {
              sections.push(`  Decisions: ${s.keyDecisions.join('; ')}`);
            }
          }
        }

        sections.push('\n=== END MEMORY ===');

        let result = sections.join('\n');
        const estimatedTokens = Math.ceil(result.length / 4);
        if (estimatedTokens > maxTokens) {
          result = result.slice(0, maxTokens * 4) + '\n... (memory truncated)';
        }

        set({ lastInjectedAt: now });
        return result;
      },

      cleanup: () => {
        const now = Date.now();
        set(state => {
          const cleaned: Record<string, MemoryFact> = {};
          for (const [id, fact] of Object.entries(state.facts)) {
            if (fact.expiresAt && fact.expiresAt < now) continue;
            cleaned[id] = fact;
          }
          return {
            facts: cleaned,
            summaries: state.summaries.slice(-50),
          };
        });
      },

      clearAll: () => {
        set({ facts: {}, summaries: [], version: 1 });
      },
    }),
    {
      name: 'titan-persistent-memory',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        facts: state.facts,
        summaries: state.summaries,
        version: state.version,
      }),
    },
  ),
);
