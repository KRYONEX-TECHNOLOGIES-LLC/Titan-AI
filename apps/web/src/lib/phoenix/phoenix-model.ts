// ── Phoenix Protocol — Config, Roles, Types ─────────────────────────────────
// 5-role multi-model orchestration achieving frontier quality at economy price.

export type PhoenixRole =
  | 'ARCHITECT'
  | 'CODER'
  | 'VERIFIER'
  | 'SCOUT'
  | 'JUDGE';

export type PhoenixPipeline = 'simple' | 'medium' | 'full';

export type PhoenixTaskType =
  | 'code'
  | 'refactor'
  | 'debug'
  | 'test'
  | 'documentation'
  | 'formatting'
  | 'architecture'
  | 'general';

export type PhoenixLaneStatus =
  | 'QUEUED'
  | 'PLANNING'
  | 'CODING'
  | 'VERIFYING'
  | 'JUDGING'
  | 'HEALING'
  | 'CONSENSUS'
  | 'COMPLETE'
  | 'FAILED';

export interface PhoenixModelMap {
  architect: string;
  coder: string;
  verifier: string;
  scout: string;
  judge: string;
}

export interface PhoenixBudget {
  perRequest: number;
  daily: number;
}

export interface PhoenixConfig {
  models: PhoenixModelMap;
  maxStrikes: number;
  judgeThreshold: number;
  maxSubtasks: number;
  maxWorkerToolCalls: number;
  maxWorkerIterations: number;
  laneTimeoutMs: number;
  tokenBudget: PhoenixBudget;
  cacheTTLMs: number;
}

export interface PhoenixSubtask {
  id: string;
  title: string;
  description: string;
  type: PhoenixTaskType;
  complexity: number;
  dependsOn: string[];
  relevantFiles: string[];
  acceptanceCriteria: string[];
}

export interface PhoenixPlan {
  id: string;
  goal: string;
  pipeline: PhoenixPipeline;
  complexity: number;
  subtasks: PhoenixSubtask[];
  createdAt: number;
}

export interface PhoenixArtifact {
  subtaskId: string;
  role: PhoenixRole;
  model: string;
  output: string;
  codeChanges: string;
  filesModified: string[];
  toolCalls: PhoenixToolLog[];
  createdAt: number;
}

export interface PhoenixToolLog {
  tool: string;
  args: Record<string, unknown>;
  success: boolean;
  result: string;
  elapsed: number;
}

export interface PhoenixVerdict {
  pass: boolean;
  issues: string[];
  suggestions: string[];
  confidence: number;
}

export interface PhoenixConsensusVote {
  role: PhoenixRole;
  model: string;
  solution: string;
  score: number;
  rationale: string;
}

export interface PhoenixStepTracker {
  llmCalls: number;
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  strikes: number;
  costEstimate: number;
  startedAt: number;
  updatedAt: number;
}

export interface PhoenixCostEntry {
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

// ── Model Cost Table ($ per 1M tokens) ──────────────────────────────────────

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'deepseek/deepseek-v3.2-speciale': { input: 0.40, output: 1.20 },
  'minimax/minimax-m2.5':            { input: 0.30, output: 1.10 },
  'deepseek/deepseek-v3.2':          { input: 0.26, output: 0.38 },
  'google/gemini-2.5-flash':         { input: 0.15, output: 0.60 },
  'qwen/qwen3.5-397b-a17b':          { input: 0.15, output: 1.00 },
};

// ── Default Configuration ───────────────────────────────────────────────────

export const DEFAULT_PHOENIX_CONFIG: PhoenixConfig = {
  models: {
    architect: 'deepseek/deepseek-v3.2-speciale',
    coder:     'minimax/minimax-m2.5',
    verifier:  'deepseek/deepseek-v3.2',
    scout:     'google/gemini-2.5-flash',
    judge:     'qwen/qwen3.5-397b-a17b',
  },
  maxStrikes: 3,
  judgeThreshold: 7,
  maxSubtasks: 10,
  maxWorkerToolCalls: 30,
  maxWorkerIterations: 15,
  laneTimeoutMs: 300_000,
  tokenBudget: {
    perRequest: 600_000,
    daily: 12_000_000,
  },
  cacheTTLMs: 600_000,
};

// ── Task Type Routing ───────────────────────────────────────────────────────

const TASK_ROLE_MAP: Record<PhoenixTaskType, PhoenixRole> = {
  code:          'CODER',
  refactor:      'CODER',
  debug:         'CODER',
  test:          'CODER',
  documentation: 'SCOUT',
  formatting:    'SCOUT',
  architecture:  'ARCHITECT',
  general:       'SCOUT',
};

export function getPhoenixRoleForTask(type: PhoenixTaskType): PhoenixRole {
  return TASK_ROLE_MAP[type];
}

export function getPhoenixModel(role: PhoenixRole, config: PhoenixConfig): string {
  const map: Record<PhoenixRole, string> = {
    ARCHITECT: config.models.architect,
    CODER:     config.models.coder,
    VERIFIER:  config.models.verifier,
    SCOUT:     config.models.scout,
    JUDGE:     config.models.judge,
  };
  return map[role];
}

// ── Cost Tracker ────────────────────────────────────────────────────────────

export class PhoenixCostTracker {
  private entries: PhoenixCostEntry[] = [];

  record(model: string, tokensIn: number, tokensOut: number): number {
    const rates = MODEL_COSTS[model] || { input: 1.0, output: 3.0 };
    const cost = (tokensIn / 1_000_000) * rates.input + (tokensOut / 1_000_000) * rates.output;
    this.entries.push({ model, tokensIn, tokensOut, cost });
    return cost;
  }

  get totalCost(): number {
    return this.entries.reduce((sum, e) => sum + e.cost, 0);
  }

  get totalTokensIn(): number {
    return this.entries.reduce((sum, e) => sum + e.tokensIn, 0);
  }

  get totalTokensOut(): number {
    return this.entries.reduce((sum, e) => sum + e.tokensOut, 0);
  }

  get breakdown(): PhoenixCostEntry[] {
    return [...this.entries];
  }

  getSummary(): string {
    const byModel = new Map<string, { calls: number; cost: number }>();
    for (const e of this.entries) {
      const prev = byModel.get(e.model) || { calls: 0, cost: 0 };
      byModel.set(e.model, { calls: prev.calls + 1, cost: prev.cost + e.cost });
    }
    const lines = ['Phoenix Cost Breakdown:'];
    for (const [model, data] of byModel) {
      lines.push(`  ${model}: ${data.calls} calls, $${data.cost.toFixed(6)}`);
    }
    lines.push(`  TOTAL: $${this.totalCost.toFixed(6)}`);
    return lines.join('\n');
  }
}

// ── Step Tracker ────────────────────────────────────────────────────────────

export function createPhoenixStepTracker(): PhoenixStepTracker {
  const now = Date.now();
  return {
    llmCalls: 0,
    toolCalls: 0,
    tokensIn: 0,
    tokensOut: 0,
    strikes: 0,
    costEstimate: 0,
    startedAt: now,
    updatedAt: now,
  };
}

// ── Utilities ───────────────────────────────────────────────────────────────

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function tryParseJSON(text: string): Record<string, unknown> | null {
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const raw = jsonMatch ? jsonMatch[1] : text;
  try {
    const parsed = JSON.parse(raw.trim());
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

const VALID_TASK_TYPES: PhoenixTaskType[] = [
  'code', 'refactor', 'debug', 'test', 'documentation', 'formatting', 'architecture', 'general',
];

export function parseTaskType(raw: string): PhoenixTaskType {
  const lower = raw.toLowerCase().trim();
  if (VALID_TASK_TYPES.includes(lower as PhoenixTaskType)) return lower as PhoenixTaskType;
  return 'code';
}
