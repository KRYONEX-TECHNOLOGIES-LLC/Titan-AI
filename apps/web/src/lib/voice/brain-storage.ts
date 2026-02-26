/**
 * Brain Storage — Supabase-backed persistent knowledge store for Titan Voice.
 * Falls back to localStorage when Supabase is unavailable.
 */

const BRAIN_LS_KEY = 'titan-voice-brain';
const CONVOS_LS_KEY = 'titan-voice-conversations';
const IDEAS_LS_KEY = 'titan-voice-ideas';

export type BrainCategory = 'knowledge' | 'skill' | 'idea' | 'observation' | 'mistake' | 'finance' | 'strategy' | 'culture' | 'research';
export type IdeaCategory = 'project' | 'improvement' | 'invention' | 'cure' | 'tool';
export type IdeaStatus = 'idea' | 'in_progress' | 'completed' | 'archived';

export interface BrainEntry {
  id: string;
  category: BrainCategory;
  content: string;
  source: string;
  importance: number;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationSummary {
  id: string;
  messages: Array<{ role: string; content: string }>;
  summary: string;
  createdAt: string;
}

export interface TitanIdea {
  id: string;
  title: string;
  description: string;
  category: IdeaCategory;
  status: IdeaStatus;
  createdAt: string;
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadFromLS<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToLS<T>(key: string, data: T[]) {
  try {
    const maxItems = 500;
    const trimmed = data.slice(-maxItems);
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch { /* quota exceeded — silently drop oldest */ }
}

async function getSupabaseClient(): Promise<{ from: (table: string) => Record<string, unknown> } | null> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key) as unknown as { from: (table: string) => Record<string, unknown> };
  } catch {
    return null;
  }
}

// ═══ Brain Entries ═══

export async function saveBrainEntry(
  entry: Omit<BrainEntry, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>,
  supabaseOnly = false,
): Promise<BrainEntry> {
  const full: BrainEntry = {
    ...entry,
    id: genId(),
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!supabaseOnly) {
    const entries = loadFromLS<BrainEntry>(BRAIN_LS_KEY);
    entries.push(full);
    saveToLS(BRAIN_LS_KEY, entries);
  }

  try {
    const sb = await getSupabaseClient();
    if (sb) {
      await (sb.from('titan_voice_brain') as unknown as { insert: (d: unknown) => Promise<unknown> }).insert({
        category: full.category,
        content: full.content,
        source: full.source,
        importance: full.importance,
        usage_count: 0,
        metadata: full.metadata || {},
      });
    }
  } catch { /* Supabase unavailable, localStorage is primary */ }

  return full;
}

/**
 * Batch save to localStorage in a single write — avoids N sequential read/write cycles.
 */
export function saveBrainEntryBatch(
  entries: Array<Omit<BrainEntry, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>>,
): BrainEntry[] {
  const now = new Date().toISOString();
  const fullEntries: BrainEntry[] = entries.map(entry => ({
    ...entry,
    id: genId(),
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  }));

  const existing = loadFromLS<BrainEntry>(BRAIN_LS_KEY);
  existing.push(...fullEntries);
  saveToLS(BRAIN_LS_KEY, existing);

  return fullEntries;
}

export function queryBrain(category?: BrainCategory, searchTerm?: string): BrainEntry[] {
  let entries = loadFromLS<BrainEntry>(BRAIN_LS_KEY);
  if (category) entries = entries.filter(e => e.category === category);
  if (searchTerm) {
    const lower = searchTerm.toLowerCase();
    entries = entries.filter(e => e.content.toLowerCase().includes(lower));
  }
  return entries.sort((a, b) => b.importance - a.importance).slice(0, 50);
}

export function getBrainStats(): { total: number; byCategory: Record<string, number> } {
  const entries = loadFromLS<BrainEntry>(BRAIN_LS_KEY);
  const byCategory: Record<string, number> = {};
  for (const e of entries) {
    byCategory[e.category] = (byCategory[e.category] || 0) + 1;
  }
  return { total: entries.length, byCategory };
}

export function incrementUsage(id: string) {
  const entries = loadFromLS<BrainEntry>(BRAIN_LS_KEY);
  const entry = entries.find(e => e.id === id);
  if (entry) {
    entry.usageCount++;
    entry.updatedAt = new Date().toISOString();
    saveToLS(BRAIN_LS_KEY, entries);
  }
}

// ═══ Conversations ═══

export async function saveConversation(
  messages: Array<{ role: string; content: string }>,
  summary: string,
): Promise<ConversationSummary> {
  const convo: ConversationSummary = {
    id: genId(),
    messages: messages.slice(-30),
    summary,
    createdAt: new Date().toISOString(),
  };

  const convos = loadFromLS<ConversationSummary>(CONVOS_LS_KEY);
  convos.push(convo);
  saveToLS(CONVOS_LS_KEY, convos);

  try {
    const sb = await getSupabaseClient();
    if (sb) {
      await (sb.from('titan_voice_conversations') as unknown as { insert: (d: unknown) => Promise<unknown> }).insert({
        messages: convo.messages,
        summary: convo.summary,
      });
    }
  } catch { /* fallback already saved */ }

  return convo;
}

export function getRecentConversations(limit = 10): ConversationSummary[] {
  return loadFromLS<ConversationSummary>(CONVOS_LS_KEY)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

// ═══ Ideas ═══

export async function saveIdea(idea: Omit<TitanIdea, 'id' | 'createdAt'>): Promise<TitanIdea> {
  const full: TitanIdea = {
    ...idea,
    id: genId(),
    createdAt: new Date().toISOString(),
  };

  const ideas = loadFromLS<TitanIdea>(IDEAS_LS_KEY);
  ideas.push(full);
  saveToLS(IDEAS_LS_KEY, ideas);

  try {
    const sb = await getSupabaseClient();
    if (sb) {
      await (sb.from('titan_voice_ideas') as unknown as { insert: (d: unknown) => Promise<unknown> }).insert({
        title: full.title,
        description: full.description,
        category: full.category,
        status: full.status,
      });
    }
  } catch { /* fallback already saved */ }

  return full;
}

export function getRecentIdeas(limit = 20): TitanIdea[] {
  return loadFromLS<TitanIdea>(IDEAS_LS_KEY)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export function updateIdeaStatus(id: string, status: IdeaStatus) {
  const ideas = loadFromLS<TitanIdea>(IDEAS_LS_KEY);
  const idea = ideas.find(i => i.id === id);
  if (idea) {
    idea.status = status;
    saveToLS(IDEAS_LS_KEY, ideas);
  }
}

// ═══ Brain Context Serializer (for system prompt injection) ═══

export function serializeBrainContext(maxChars = 2000): string {
  const skills = queryBrain('skill').slice(0, 10);
  const knowledge = queryBrain('knowledge').slice(0, 10);
  const mistakes = queryBrain('mistake').slice(0, 5);
  const ideas = getRecentIdeas(5);

  const parts: string[] = [];

  if (skills.length > 0) {
    parts.push('Skills: ' + skills.map(s => s.content.slice(0, 80)).join(' | '));
  }
  if (knowledge.length > 0) {
    parts.push('Knowledge: ' + knowledge.map(k => k.content.slice(0, 80)).join(' | '));
  }
  if (mistakes.length > 0) {
    parts.push('Mistakes to avoid: ' + mistakes.map(m => m.content.slice(0, 80)).join(' | '));
  }
  const finance = queryBrain('finance').slice(0, 5);
  if (finance.length > 0) {
    parts.push('Finance: ' + finance.map(f => f.content.slice(0, 80)).join(' | '));
  }
  const strategy = queryBrain('strategy').slice(0, 5);
  if (strategy.length > 0) {
    parts.push('Strategy: ' + strategy.map(s => s.content.slice(0, 80)).join(' | '));
  }
  const culture = queryBrain('culture').slice(0, 5);
  if (culture.length > 0) {
    parts.push('Culture: ' + culture.map(c => c.content.slice(0, 80)).join(' | '));
  }
  if (ideas.length > 0) {
    parts.push('Active ideas: ' + ideas.map(i => `${i.title} (${i.status})`).join(', '));
  }

  const joined = parts.join('\n');
  return joined.length > maxChars ? joined.slice(0, maxChars) + '...' : joined;
}

// ═══ SQL Migration (for documentation) ═══

export const SUPABASE_MIGRATION_SQL = `
-- Titan Voice Brain Tables
-- Apply via Supabase SQL Editor

CREATE TABLE IF NOT EXISTS titan_voice_brain (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  category TEXT NOT NULL CHECK (category IN ('knowledge', 'skill', 'idea', 'observation', 'mistake', 'finance', 'strategy', 'culture', 'research')),
  content TEXT NOT NULL,
  source TEXT DEFAULT '',
  importance INT DEFAULT 5,
  usage_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS titan_voice_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  messages JSONB NOT NULL,
  summary TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS titan_voice_ideas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'project' CHECK (category IN ('project', 'improvement', 'invention', 'cure', 'tool')),
  status TEXT DEFAULT 'idea' CHECK (status IN ('idea', 'in_progress', 'completed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brain_category ON titan_voice_brain(category);
CREATE INDEX IF NOT EXISTS idx_brain_importance ON titan_voice_brain(importance DESC);
CREATE INDEX IF NOT EXISTS idx_ideas_status ON titan_voice_ideas(status);
`;
