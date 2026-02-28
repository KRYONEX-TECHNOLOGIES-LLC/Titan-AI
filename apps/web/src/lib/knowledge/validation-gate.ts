/**
 * Titan Knowledge Validation Gate — Bidirectional RAG safety layer.
 *
 * Prevents hallucination pollution by validating knowledge before it enters
 * Brain or Titan Memory. Uses multi-stage validation:
 * 1. Entailment check (is it consistent with existing knowledge?)
 * 2. Attribution check (does it cite a verifiable source?)
 * 3. Novelty check (is it genuinely new, not a duplicate or contradiction?)
 * 4. Quality score (is it well-formed, specific, and actionable?)
 *
 * Based on Bidirectional RAG (2026) — safe write-back with validation.
 */

export interface ValidationResult {
  passed: boolean;
  score: number;
  checks: {
    entailment: { passed: boolean; reason: string };
    attribution: { passed: boolean; reason: string };
    novelty: { passed: boolean; reason: string };
    quality: { passed: boolean; reason: string };
  };
  sanitized?: string;
}

export interface KnowledgeCandidate {
  content: string;
  source: 'conversation' | 'harvester' | 'web' | 'user' | 'auto' | 'system';
  category?: string;
  importance?: number;
}

const CONTRADICTION_PATTERNS = [
  /never|don't|do not|avoid|stop|wrong|incorrect|false|bad practice/i,
];

const LOW_QUALITY_PATTERNS = [
  /^(ok|yes|no|sure|thanks|thank you|got it|cool|nice)\.?$/i,
  /^(i think|maybe|probably|perhaps|i guess)$/i,
  /\b(todo|fixme|hack|placeholder|stub|dummy)\b/i,
];

const SENSITIVE_PATTERNS = [
  /\b(password|secret|api[_\s]?key|token|credential|ssn|social security)\b/i,
  /\b(\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/,
];

/**
 * Validate a knowledge candidate before writing to Brain/Memory.
 * Returns a ValidationResult with pass/fail and reasons.
 */
export function validateKnowledge(
  candidate: KnowledgeCandidate,
  existingKnowledge?: string[],
): ValidationResult {
  const checks = {
    entailment: checkEntailment(candidate, existingKnowledge || []),
    attribution: checkAttribution(candidate),
    novelty: checkNovelty(candidate, existingKnowledge || []),
    quality: checkQuality(candidate),
  };

  const passCount = Object.values(checks).filter(c => c.passed).length;
  const score = passCount / 4;

  // Must pass at least 3 of 4 checks, and quality is mandatory
  const passed = passCount >= 3 && checks.quality.passed;

  let sanitized: string | undefined;
  if (passed) {
    sanitized = sanitizeContent(candidate.content);
  }

  return { passed, score, checks, sanitized };
}

function checkEntailment(
  candidate: KnowledgeCandidate,
  existing: string[],
): { passed: boolean; reason: string } {
  const content = candidate.content.toLowerCase();

  // Check for direct contradictions with existing knowledge
  for (const fact of existing.slice(0, 50)) {
    const factLower = fact.toLowerCase();

    // If the candidate says "never X" but existing says "always X" (or vice versa)
    const candidateNegative = CONTRADICTION_PATTERNS.some(p => p.test(content));
    const factNegative = CONTRADICTION_PATTERNS.some(p => p.test(factLower));

    if (candidateNegative !== factNegative) {
      // Check if they're about the same topic (crude overlap check)
      const candidateWords = new Set(content.split(/\s+/).filter(w => w.length > 3));
      const factWords = new Set(factLower.split(/\s+/).filter(w => w.length > 3));
      let overlap = 0;
      for (const w of candidateWords) {
        if (factWords.has(w)) overlap++;
      }
      if (overlap >= 3) {
        return { passed: false, reason: `Contradicts existing fact: "${fact.slice(0, 80)}"` };
      }
    }
  }

  return { passed: true, reason: 'No contradictions detected' };
}

function checkAttribution(candidate: KnowledgeCandidate): { passed: boolean; reason: string } {
  // User-provided and system knowledge are auto-attributed
  if (candidate.source === 'user' || candidate.source === 'system') {
    return { passed: true, reason: `Source: ${candidate.source}` };
  }

  // Conversation-derived: attributed to the conversation itself
  if (candidate.source === 'conversation') {
    return { passed: true, reason: 'Derived from conversation' };
  }

  // Harvester/web: check for some verifiable indicator
  if (candidate.source === 'harvester' || candidate.source === 'web') {
    const hasUrl = /https?:\/\/\S+/.test(candidate.content);
    const hasSource = /(?:according to|source:|from |via |per )/i.test(candidate.content);
    if (hasUrl || hasSource) {
      return { passed: true, reason: 'Has attribution/source' };
    }
    // Allow if importance is low (observational)
    if ((candidate.importance || 5) <= 3) {
      return { passed: true, reason: 'Low-importance observation' };
    }
    return { passed: false, reason: 'Web/harvester knowledge without clear source attribution' };
  }

  return { passed: true, reason: 'Auto-attributed' };
}

function checkNovelty(
  candidate: KnowledgeCandidate,
  existing: string[],
): { passed: boolean; reason: string } {
  const content = candidate.content.toLowerCase().trim();

  // Exact duplicate check
  for (const fact of existing) {
    if (fact.toLowerCase().trim() === content) {
      return { passed: false, reason: 'Exact duplicate' };
    }
  }

  // High-overlap duplicate check (>80% word overlap)
  const candidateWords = new Set(content.split(/\s+/).filter(w => w.length > 2));
  if (candidateWords.size < 3) return { passed: true, reason: 'Too short to be a meaningful duplicate' };

  for (const fact of existing.slice(0, 100)) {
    const factWords = new Set(fact.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    if (factWords.size < 3) continue;
    let overlap = 0;
    for (const w of candidateWords) {
      if (factWords.has(w)) overlap++;
    }
    const ratio = overlap / Math.max(candidateWords.size, factWords.size);
    if (ratio > 0.8) {
      return { passed: false, reason: `Near-duplicate of existing fact (${Math.round(ratio * 100)}% overlap)` };
    }
  }

  return { passed: true, reason: 'Novel content' };
}

function checkQuality(candidate: KnowledgeCandidate): { passed: boolean; reason: string } {
  const content = candidate.content.trim();

  // Too short
  if (content.length < 10) {
    return { passed: false, reason: 'Content too short (min 10 chars)' };
  }

  // Too long (probably raw dump, not distilled)
  if (content.length > 2000) {
    return { passed: false, reason: 'Content too long (max 2000 chars); distill before storing' };
  }

  // Low-quality patterns
  for (const pat of LOW_QUALITY_PATTERNS) {
    if (pat.test(content)) {
      return { passed: false, reason: 'Low-quality content (filler, placeholder, or trivial)' };
    }
  }

  // Sensitive data
  for (const pat of SENSITIVE_PATTERNS) {
    if (pat.test(content)) {
      return { passed: false, reason: 'Contains sensitive data (redact before storing)' };
    }
  }

  return { passed: true, reason: 'Content meets quality standards' };
}

function sanitizeContent(content: string): string {
  let sanitized = content.trim();

  // Remove potential sensitive data
  sanitized = sanitized.replace(/\b(\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/g, '[REDACTED]');
  sanitized = sanitized.replace(/(?:password|api[_\s]?key|secret|token)\s*[:=]\s*\S+/gi, '[REDACTED CREDENTIAL]');

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ');

  return sanitized;
}

/**
 * Validated write to Brain — wraps saveBrainEntry with validation gate.
 * Returns the validation result; only writes if passed.
 */
export async function validatedBrainWrite(
  candidate: KnowledgeCandidate,
  existingKnowledge?: string[],
): Promise<ValidationResult & { written: boolean }> {
  const result = validateKnowledge(candidate, existingKnowledge);

  if (!result.passed) {
    return { ...result, written: false };
  }

  try {
    const { saveBrainEntry } = await import('@/lib/voice/brain-storage');
    await saveBrainEntry({
      category: (candidate.category || 'knowledge') as import('@/lib/voice/brain-storage').BrainCategory,
      content: result.sanitized || candidate.content,
      source: candidate.source,
      importance: candidate.importance || 5,
    });
    return { ...result, written: true };
  } catch {
    return { ...result, written: false };
  }
}

/**
 * Validated write to Titan Memory — wraps addFact with validation gate.
 */
export function validatedMemoryWrite(
  candidate: KnowledgeCandidate,
  existingKnowledge?: string[],
): ValidationResult & { factId: string | null } {
  const result = validateKnowledge(candidate, existingKnowledge);

  if (!result.passed) {
    return { ...result, factId: null };
  }

  try {
    const { useTitanMemory } = require('@/stores/titan-memory');
    const factId = useTitanMemory.getState().addFact({
      layer: 'core' as const,
      category: candidate.category || 'validated-knowledge',
      content: result.sanitized || candidate.content,
      importance: candidate.importance || 5,
      expiresAt: null,
      source: candidate.source,
      tags: ['validated', candidate.category || 'knowledge'],
    });
    return { ...result, factId };
  } catch {
    return { ...result, factId: null };
  }
}
