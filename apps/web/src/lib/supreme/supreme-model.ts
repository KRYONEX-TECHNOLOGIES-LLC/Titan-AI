export type SupremeAgentRole =
  | 'OVERSEER'
  | 'OPERATOR'
  | 'PRIMARY_WORKER'
  | 'SECONDARY_WORKER';

export type SupremeTaskType =
  | 'code'
  | 'refactor'
  | 'test'
  | 'documentation'
  | 'formatting'
  | 'transformation';

export type SupremeLaneStatus =
  | 'QUEUED'
  | 'ASSIGNED'
  | 'WORKING'
  | 'PENDING_REVIEW'
  | 'REVIEWING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'MERGED'
  | 'FAILED';

export interface SupremeBudgetConfig {
  perRequest: number;
  daily: number;
}

export interface SupremeStepBudgetConfig {
  maxTotalSteps: number;
  warningAt: number;
}

export interface SupremeConfig {
  maxConcurrentWorkers: number;
  maxConcurrentVerifiers: number;
  laneTimeoutMs: number;
  maxReworkAttempts: number;
  maxOverseerIterations: number;
  maxWorkerToolCalls: number;
  maxWorkerIterations: number;
  maxOperatorToolCalls: number;
  debateThreshold: number;
  quorumSize: number;
  tokenBudget: SupremeBudgetConfig;
  stepBudget: SupremeStepBudgetConfig;
  cacheTTLMs: number;
  models: {
    overseer: string;
    operator: string;
    primaryWorker: string;
    secondaryWorker: string;
  };
}

export interface SupremeTaskNode {
  id: string;
  title: string;
  description: string;
  type: SupremeTaskType;
  complexity: number;
  dependsOn: string[];
  relevantFiles: string[];
  acceptanceCriteria: string[];
  verificationCriteria: string[];
  constraints?: string[];
  assignedRole?: SupremeAgentRole;
}

export interface SupremeTaskManifest {
  id: string;
  goal: string;
  createdAt: number;
  status: 'ACTIVE' | 'COMPLETE' | 'FAILED' | 'CANCELLED';
  nodes: SupremeTaskNode[];
}

export interface ToolCallLogEntry {
  tool: string;
  args: Record<string, unknown>;
  success: boolean;
  result: string;
  startedAt: number;
  finishedAt: number;
}

export interface SupremeArtifact {
  laneId: string;
  nodeId: string;
  role: SupremeAgentRole;
  model: string;
  inspectionEvidence: string;
  codeChanges: string;
  selfReview: string;
  verificationHints: string;
  filesModified: string[];
  toolCallLog: ToolCallLogEntry[];
  rawOutput?: string;
  createdAt: number;
}

export interface ExecutionPlanStep {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  rationale: string;
  requiresApproval: boolean;
}

export interface ExecutionPlan {
  planId: string;
  laneId: string;
  nodeId: string;
  approvedBy: SupremeAgentRole;
  approvedAt: number;
  steps: ExecutionPlanStep[];
}

export interface DebateVerdict {
  winner: 'artifactA' | 'artifactB' | 'synthesized';
  rationale: string;
  hiddenEdgeCases: string[];
  securityRisks: string[];
  chosenApproach: string;
}

export interface ConsensusVote {
  voter: SupremeAgentRole;
  model: string;
  approved: boolean;
  rationale: string;
}

export interface DebateResult {
  laneId: string;
  triggered: boolean;
  artifactA?: SupremeArtifact;
  artifactB?: SupremeArtifact;
  verdict?: DebateVerdict;
}

export interface StepTracker {
  llmCalls: number;
  toolCalls: number;
  totalSteps: number;
  tokensIn: number;
  tokensOut: number;
  startedAt: number;
  updatedAt: number;
}

export const SUPREME_TASK_ROUTING: Record<SupremeTaskType, SupremeAgentRole> = {
  code: 'PRIMARY_WORKER',
  refactor: 'PRIMARY_WORKER',
  test: 'PRIMARY_WORKER',
  documentation: 'SECONDARY_WORKER',
  formatting: 'SECONDARY_WORKER',
  transformation: 'SECONDARY_WORKER',
};

export const DEFAULT_SUPREME_CONFIG: SupremeConfig = {
  maxConcurrentWorkers: 4,
  maxConcurrentVerifiers: 2,
  laneTimeoutMs: 300_000,
  maxReworkAttempts: 2,
  maxOverseerIterations: 30,
  maxWorkerToolCalls: 25,
  maxWorkerIterations: 12,
  maxOperatorToolCalls: 20,
  debateThreshold: 7,
  quorumSize: 2,
  tokenBudget: {
    perRequest: 500_000,
    daily: 10_000_000,
  },
  stepBudget: {
    maxTotalSteps: 100,
    warningAt: 70,
  },
  cacheTTLMs: 600_000,
  models: {
    overseer: 'claude-opus-4.6',
    operator: 'gpt-5.3',
    primaryWorker: 'qwen3-coder',
    secondaryWorker: 'llama-4-maverick',
  },
};

export function getRoleForTaskType(type: SupremeTaskType): SupremeAgentRole {
  return SUPREME_TASK_ROUTING[type];
}

export function createInitialStepTracker(): StepTracker {
  const now = Date.now();
  return {
    llmCalls: 0,
    toolCalls: 0,
    totalSteps: 0,
    tokensIn: 0,
    tokensOut: 0,
    startedAt: now,
    updatedAt: now,
  };
}
