// ── Titan Plan Sniper — Config, Roles, Types ─────────────────────────────────
// 7-role model orchestra achieving frontier quality at near-zero cost.
// Uses 2026's cheapest models: FREE for planning, pennies for execution.

export type SniperRole =
  | 'SCANNER'
  | 'ARCHITECT'
  | 'CODER'
  | 'SENTINEL'
  | 'JUDGE';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type SniperTaskType =
  | 'code'
  | 'refactor'
  | 'debug'
  | 'test'
  | 'documentation'
  | 'styling'
  | 'architecture'
  | 'api'
  | 'database'
  | 'deployment'
  | 'general';

export type SniperLaneStatus =
  | 'QUEUED'
  | 'SCANNING'
  | 'PLANNING'
  | 'CODING'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'REWORKING'
  | 'JUDGING'
  | 'COMPLETE'
  | 'FAILED';

// ── Model Map ───────────────────────────────────────────────────────────────

export interface SniperModelMap {
  scanner: string;
  architect: string;
  coderLow: string;
  coderHigh: string;
  sentinel: string;
  judge: string;
}

// ── Cost Table ($ per 1M tokens) ────────────────────────────────────────────

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'mistralai/devstral-2-2512':        { input: 0.05, output: 0.22 },
  'deepseek/deepseek-v3.2':           { input: 0.25, output: 0.38 },
  'qwen/qwen3-coder':                 { input: 0.00, output: 0.00 },
  'qwen/qwen3.5-plus-02-15':          { input: 0.40, output: 2.00 },
};

// ── Configuration ───────────────────────────────────────────────────────────

export interface SniperBudget {
  perRequest: number;
  daily: number;
}

export interface CircuitBreakerConfig {
  consecutiveFailuresThreshold: number;
  enabled: boolean;
}

export interface SniperConfig {
  models: SniperModelMap;
  maxConcurrentLanes: number;
  maxReworkAttempts: number;
  maxWorkerToolCalls: number;
  maxWorkerIterations: number;
  laneTimeoutMs: number;
  tokenBudget: SniperBudget;
  sentinelThreshold: number;
  judgeThreshold: number;
  circuitBreaker: CircuitBreakerConfig;
}

export const DEFAULT_SNIPER_CONFIG: SniperConfig = {
  models: {
    scanner:   'mistralai/devstral-2-2512',
    architect: 'deepseek/deepseek-v3.2',
    coderLow:  'qwen/qwen3-coder',
    coderHigh: 'deepseek/deepseek-v3.2',
    sentinel:  'deepseek/deepseek-v3.2',
    judge:     'qwen/qwen3.5-plus-02-15',
  },
  maxConcurrentLanes: 8,
  maxReworkAttempts: 2,
  maxWorkerToolCalls: 30,
  maxWorkerIterations: 20,
  laneTimeoutMs: 300_000,
  tokenBudget: { perRequest: 800_000, daily: 20_000_000 },
  sentinelThreshold: 6,
  judgeThreshold: 7,
  circuitBreaker: {
    consecutiveFailuresThreshold: 3,
    enabled: true,
  },
};

// ── Task Type → Risk Routing ────────────────────────────────────────────────

const TASK_RISK_MAP: Record<SniperTaskType, RiskLevel> = {
  documentation: 'low',
  styling:       'low',
  general:       'low',
  test:          'medium',
  refactor:      'medium',
  code:          'medium',
  api:           'medium',
  debug:         'high',
  database:      'high',
  architecture:  'critical',
  deployment:    'critical',
};

export function getDefaultRisk(taskType: SniperTaskType): RiskLevel {
  return TASK_RISK_MAP[taskType] ?? 'medium';
}

export function getCoderModel(risk: RiskLevel, config: SniperConfig): string {
  return risk === 'high' || risk === 'critical'
    ? config.models.coderHigh
    : config.models.coderLow;
}

export function getModelForRole(role: SniperRole, config: SniperConfig, risk?: RiskLevel): string {
  switch (role) {
    case 'SCANNER':   return config.models.scanner;
    case 'ARCHITECT': return config.models.architect;
    case 'CODER':     return getCoderModel(risk ?? 'medium', config);
    case 'SENTINEL':  return config.models.sentinel;
    case 'JUDGE':     return config.models.judge;
  }
}

// ── DAG Types ───────────────────────────────────────────────────────────────

export interface SniperDAGNode {
  id: string;
  planTaskId: string;
  title: string;
  description: string;
  taskType: SniperTaskType;
  risk: RiskLevel;
  dependencies: string[];
  relevantFiles: string[];
  acceptanceCriteria: string[];
  status: 'pending' | 'dispatched' | 'complete' | 'failed';
}

export interface SniperDAG {
  id: string;
  goal: string;
  nodes: SniperDAGNode[];
  createdAt: number;
}

// ── Artifacts ───────────────────────────────────────────────────────────────

export interface ScanResult {
  fileTree: string;
  keyFiles: Record<string, string>;
  dependencies: string[];
  conventions: string[];
  existingPatterns: string[];
}

export interface CodeArtifact {
  nodeId: string;
  model: string;
  role: SniperRole;
  output: string;
  codeChanges: string;
  filesModified: string[];
  toolCalls: ToolCallLog[];
  createdAt: number;
}

export interface ToolCallLog {
  tool: string;
  args: Record<string, unknown>;
  success: boolean;
  result: string;
  elapsed: number;
}

export interface SentinelVerdict {
  pass: boolean;
  issues: string[];
  suggestions: string[];
  lintPassed: boolean;
  typeCheckPassed: boolean;
  criteriaMetCount: number;
  criteriaTotalCount: number;
}

export interface JudgeVerdict {
  score: number;
  pass: boolean;
  issues: string[];
  checklistUpdates: Array<{ id: string; checked: boolean; notes: string }>;
  summary: string;
}

// ── Lane (execution unit) ───────────────────────────────────────────────────

export interface SniperLane {
  laneId: string;
  nodeId: string;
  status: SniperLaneStatus;
  codeArtifact?: CodeArtifact;
  sentinelVerdict?: SentinelVerdict;
  reworkCount: number;
  metrics: LaneMetrics;
  startedAt: number;
  completedAt?: number;
}

export interface LaneMetrics {
  tokensIn: number;
  tokensOut: number;
  cost: number;
  durationMs: number;
  toolCallCount: number;
}

export function createEmptyLaneMetrics(): LaneMetrics {
  return { tokensIn: 0, tokensOut: 0, cost: 0, durationMs: 0, toolCallCount: 0 };
}

// ── Orchestration Result ────────────────────────────────────────────────────

export interface SniperResult {
  success: boolean;
  dagId: string;
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  judgeVerdict?: JudgeVerdict;
  totalCost: number;
  totalDurationMs: number;
  summary: string;
}

// ── Events (SSE) ────────────────────────────────────────────────────────────

export type SniperEventType =
  | 'scan_start'
  | 'scan_complete'
  | 'dag_created'
  | 'lane_start'
  | 'lane_status'
  | 'lane_artifact'
  | 'lane_verified'
  | 'lane_failed'
  | 'lane_rework'
  | 'judge_start'
  | 'judge_complete'
  | 'pipeline_complete'
  | 'error'
  | 'token';

export interface SniperEvent {
  type: SniperEventType;
  timestamp: number;
  dagId: string;
  laneId?: string;
  nodeId?: string;
  data: Record<string, unknown>;
}

// ── Cost Tracker ────────────────────────────────────────────────────────────

export class SniperCostTracker {
  private entries: Array<{ model: string; tokensIn: number; tokensOut: number; cost: number }> = [];

  record(model: string, tokensIn: number, tokensOut: number): number {
    const rates = MODEL_COSTS[model] || { input: 1.0, output: 3.0 };
    const cost = (tokensIn / 1_000_000) * rates.input + (tokensOut / 1_000_000) * rates.output;
    this.entries.push({ model, tokensIn, tokensOut, cost });
    return cost;
  }

  get totalCost(): number {
    return this.entries.reduce((s, e) => s + e.cost, 0);
  }

  get totalTokensIn(): number {
    return this.entries.reduce((s, e) => s + e.tokensIn, 0);
  }

  get totalTokensOut(): number {
    return this.entries.reduce((s, e) => s + e.tokensOut, 0);
  }

  getSummary(): string {
    const byModel = new Map<string, { calls: number; cost: number }>();
    for (const e of this.entries) {
      const prev = byModel.get(e.model) || { calls: 0, cost: 0 };
      byModel.set(e.model, { calls: prev.calls + 1, cost: prev.cost + e.cost });
    }
    const lines = ['Plan Sniper Cost Breakdown:'];
    for (const [model, data] of byModel) {
      lines.push(`  ${model}: ${data.calls} calls, $${data.cost.toFixed(6)}`);
    }
    lines.push(`  TOTAL: $${this.totalCost.toFixed(6)}`);
    return lines.join('\n');
  }
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

let _laneCounter = 0;
export function generateLaneId(): string {
  return `sniper-lane-${Date.now().toString(36)}-${(++_laneCounter).toString(36)}`;
}

export function generateDAGId(): string {
  return `sniper-dag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
