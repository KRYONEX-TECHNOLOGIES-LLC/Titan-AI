// ── Phoenix Adaptive Complexity Router ───────────────────────────────────────
// Classifies incoming requests into simple/medium/full pipelines to minimize
// cost on easy tasks while engaging the full 5-role system for hard ones.

import type { PhoenixPipeline } from './phoenix-model';

interface ComplexitySignals {
  messageLength: number;
  instructionCount: number;
  hasCodeBlocks: boolean;
  hasMultipleFiles: boolean;
  hasErrorContext: boolean;
  conversationDepth: number;
  keywordScore: number;
}

const HARD_KEYWORDS = new Set([
  'refactor', 'rewrite', 'migrate', 'architecture', 'redesign', 'optimize',
  'performance', 'security', 'auth', 'database', 'schema', 'deploy', 'ci/cd',
  'pipeline', 'microservice', 'distributed', 'concurrent', 'race condition',
  'memory leak', 'scale', 'infrastructure', 'monorepo', 'breaking change',
]);

const MEDIUM_KEYWORDS = new Set([
  'bug', 'fix', 'debug', 'error', 'test', 'implement', 'feature', 'add',
  'create', 'build', 'component', 'api', 'endpoint', 'hook', 'state',
  'function', 'class', 'module', 'style', 'update', 'upgrade', 'install',
  'make', 'improve', 'smarter', 'better', 'faster', 'enhance', 'change',
  'engine', 'system', 'logic', 'algorithm', 'strategy', 'integration',
]);

const SIMPLE_KEYWORDS = new Set([
  'rename', 'typo', 'comment', 'format', 'lint', 'import', 'export',
  'delete', 'remove', 'move', 'copy', 'what is', 'explain', 'how does',
  'show me', 'list', 'help', 'docs', 'readme',
]);

function extractSignals(message: string, conversationDepth: number): ComplexitySignals {
  const lower = message.toLowerCase();
  const words = lower.split(/\s+/);

  let keywordScore = 0;
  for (const word of words) {
    if (HARD_KEYWORDS.has(word)) keywordScore += 3;
    else if (MEDIUM_KEYWORDS.has(word)) keywordScore += 1;
    else if (SIMPLE_KEYWORDS.has(word)) keywordScore -= 1;
  }

  const multiFilePatterns = /multiple files|across files|several files|all files|every file|monorepo|whole project|the app|this app|the project|this project|entire|everything/i;
  const errorPatterns = /error|exception|stack trace|traceback|failed|crash|broken|not working/i;
  const codeBlockCount = (message.match(/```/g) || []).length / 2;
  const instructionCount = (message.match(/\d+\.\s|[-*]\s/g) || []).length;

  return {
    messageLength: message.length,
    instructionCount: Math.max(instructionCount, Math.floor(codeBlockCount)),
    hasCodeBlocks: codeBlockCount >= 1,
    hasMultipleFiles: multiFilePatterns.test(message),
    hasErrorContext: errorPatterns.test(message),
    conversationDepth,
    keywordScore,
  };
}

export function estimateComplexity(message: string, conversationDepth: number = 0): number {
  const s = extractSignals(message, conversationDepth);

  let score = 3;

  if (s.messageLength > 2000) score += 2;
  else if (s.messageLength > 800) score += 1;
  else if (s.messageLength < 100) score -= 1;

  if (s.instructionCount > 5) score += 2;
  else if (s.instructionCount > 2) score += 1;

  if (s.hasCodeBlocks) score += 1;
  if (s.hasMultipleFiles) score += 2;
  if (s.hasErrorContext) score += 1;

  if (s.conversationDepth > 10) score += 1;

  score += Math.min(3, Math.max(-2, Math.floor(s.keywordScore / 3)));

  return Math.min(10, Math.max(1, score));
}

export function selectPipeline(complexity: number): PhoenixPipeline {
  if (complexity <= 3) return 'simple';
  if (complexity <= 6) return 'medium';
  return 'full';
}

export function routeRequest(message: string, conversationDepth: number = 0): {
  complexity: number;
  pipeline: PhoenixPipeline;
} {
  const complexity = estimateComplexity(message, conversationDepth);
  return { complexity, pipeline: selectPipeline(complexity) };
}
