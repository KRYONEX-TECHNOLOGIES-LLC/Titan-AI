/**
 * Titan Hive Memory — unified context for all models (chat, plan execute, Alfred).
 * Combines User Profile + Titan Memory (7 layers) + Brain storage into one
 * serialized block so every model gets the same persistent context ("hive mind").
 * Client-side only; used when building system prompts or context payloads.
 */

const DEFAULT_HIVE_CHARS = 4000;

/**
 * Build unified hive context from User Profile + Titan Memory + Brain.
 * Budget split: ~20% user profile, ~45% titan memory, ~35% brain.
 */
export function getHiveContext(maxChars: number = DEFAULT_HIVE_CHARS): string {
  if (typeof window === 'undefined') return '';

  const parts: string[] = [];

  // User profile (friend context) — always first so every model knows who they're talking to
  try {
    const { useUserProfile } = require('@/stores/user-profile-store');
    const profile = useUserProfile.getState().serialize(Math.floor(maxChars * 0.2));
    if (profile && profile.trim().length > 10) {
      parts.push(profile);
    }
  } catch {
    // user-profile-store not available
  }

  try {
    const { useTitanMemory } = require('@/stores/titan-memory');
    const mem = useTitanMemory.getState().serialize(Math.floor((maxChars * 0.45) / 4));
    if (mem && mem.trim().length > 0) {
      parts.push(mem);
    }
  } catch {
    // titan-memory not available (e.g. SSR)
  }

  try {
    const { serializeBrainContext } = require('@/lib/voice/brain-storage');
    const brain = serializeBrainContext(Math.floor(maxChars * 0.35));
    if (brain && brain.trim().length > 0) {
      parts.push('\n[VOICE BRAIN]\n' + brain);
    }
  } catch {
    // brain-storage not available
  }

  const joined = parts.join('\n').trim();
  if (joined.length === 0) return '';
  return joined.length > maxChars ? joined.slice(0, maxChars) + '\n... (hive truncated)' : joined;
}
