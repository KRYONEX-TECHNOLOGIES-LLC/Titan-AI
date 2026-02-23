/**
 * Titan Protocol v2 — Lane Model
 *
 * Core type definitions for the parallel lane-based governance framework.
 * Every lane is an isolated unit of work flowing through:
 *   QUEUED → PROVISIONING → ASSIGNED → WORKING → PENDING_VERIFY →
 *   VERIFYING → VERIFIED → MERGED
 *
 * Lanes are immutable once archived. All state transitions are audited.
 */

// ─── Lane Status ────────────────────────────────────────────────────────────

export type LaneStatus =
  | 'QUEUED'
  | 'PROVISIONING'
  | 'ASSIGNED'
  | 'WORKING'
  | 'PENDING_VERIFY'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'REJECTED'
  | 'PENDING_REWORK'
  | 'MERGE_CONFLICT'
  | 'PENDING_RECONCILIATION'
  | 'MERGED'
  | 'FAILED'
  | 'ARCHIVED';

export const TERMINAL_STATUSES: ReadonlySet<LaneStatus> = new Set([
  'MERGED',
  'FAILED',
  'ARCHIVED',
]);

export const ACTIVE_STATUSES: ReadonlySet<LaneStatus> = new Set([
  'QUEUED',
  'PROVISIONING',
  'ASSIGNED',
  'WORKING',
  'PENDING_VERIFY',
  'VERIFYING',
  'VERIFIED',
  'REJECTED',
  'PENDING_REWORK',
  'MERGE_CONFLICT',
  'PENDING_RECONCILIATION',
]);

// ─── File Region (for conflict detection) ───────────────────────────────────

export interface FileRegion {
  filePath: string;
  startLine?: number;
  endLine?: number;
}

// ─── Subtask Specification ──────────────────────────────────────────────────

export interface SubtaskSpec {
  title: string;
  description: string;
  relevantFiles: string[];
  successCriteria: string[];
  verificationCriteria: string[];
  codeSnippets?: Array<{ path: string; content: string }>;
  constraints?: string[];
}

// ─── Lane Artifacts ─────────────────────────────────────────────────────────

export interface WorkerArtifact {
  inspectionEvidence: string;
  codeChanges: string;
  selfReview: string;
  verificationHints: string;
  rawOutput: string;
  filesModified: FileRegion[];
  toolCallLog: ToolCallLogEntry[];
}

export interface VerifierArtifact {
  verdict: 'PASS' | 'FAIL';
  findings: VerifierFinding[];
  rationale: string;
  rawOutput: string;
  checklistResults: ChecklistResult[];
}

export interface VerifierFinding {
  id: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  location: string;
  description: string;
}

export interface ChecklistResult {
  checkId: string;
  label: string;
  passed: boolean;
  evidence?: string;
}

export interface LaneArtifacts {
  workerOutput?: WorkerArtifact;
  verifierReport?: VerifierArtifact;
  generatedDiff?: string;
  mergeResult?: {
    mergedAt: number;
    conflictsResolved: boolean;
    buildPassed: boolean;
    lintPassed: boolean;
  };
}

// ─── Audit Trail ────────────────────────────────────────────────────────────

export interface AuditEntry {
  timestamp: number;
  fromStatus: LaneStatus | null;
  toStatus: LaneStatus;
  actor: 'supervisor' | 'worker' | 'verifier' | 'merge-arbiter' | 'system';
  reason: string;
  metadata?: Record<string, unknown>;
}

// ─── Tool Call Log ──────────────────────────────────────────────────────────

export interface ToolCallLogEntry {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result: string;
  success: boolean;
  startedAt: number;
  finishedAt: number;
}

// ─── Lane Metrics ───────────────────────────────────────────────────────────

export interface LaneMetrics {
  workerTokensPrompt: number;
  workerTokensCompletion: number;
  verifierTokensPrompt: number;
  verifierTokensCompletion: number;
  workerCost: number;
  verifierCost: number;
  totalCost: number;
  workerDurationMs: number;
  verifierDurationMs: number;
  totalDurationMs: number;
  toolCallCount: number;
  reworkCount: number;
}

export function createEmptyMetrics(): LaneMetrics {
  return {
    workerTokensPrompt: 0,
    workerTokensCompletion: 0,
    verifierTokensPrompt: 0,
    verifierTokensCompletion: 0,
    workerCost: 0,
    verifierCost: 0,
    totalCost: 0,
    workerDurationMs: 0,
    verifierDurationMs: 0,
    totalDurationMs: 0,
    toolCallCount: 0,
    reworkCount: 0,
  };
}

// ─── The Lane ───────────────────────────────────────────────────────────────

export interface Lane {
  lane_id: string;
  task_manifest_id: string;
  subtask_node_id: string;
  status: LaneStatus;
  spec: SubtaskSpec;
  worker_model_id: string;
  verifier_model_id: string;
  workspace_branch: string;
  files_touched: FileRegion[];
  artifacts: LaneArtifacts;
  audit_trail: AuditEntry[];
  metrics: LaneMetrics;
  failure_count: number;
  max_failures: number;
  reconciliation_source_lanes?: string[];
  created_at: number;
  updated_at: number;
  completed_at?: number;
}

// ─── Task Manifest DAG ─────────────────────────────────────────────────────

export interface DAGEdge {
  from: string;
  to: string;
}

export interface DAGNode {
  id: string;
  spec: SubtaskSpec;
  dependencies: string[];
  lane_id?: string;
  status: 'PENDING' | 'DISPATCHED' | 'COMPLETE' | 'FAILED';
}

export type ManifestStatus = 'ACTIVE' | 'COMPLETE' | 'FAILED' | 'CANCELLED';

export interface TaskManifest {
  id: string;
  goal: string;
  sessionId: string;
  nodes: DAGNode[];
  edges: DAGEdge[];
  status: ManifestStatus;
  created_at: number;
  updated_at: number;
  completed_at?: number;
}

// ─── Events (for SSE and internal pub/sub) ──────────────────────────────────

export type LaneEventType =
  | 'lane_created'
  | 'lane_status_changed'
  | 'lane_artifact_updated'
  | 'lane_tool_call'
  | 'lane_token'
  | 'manifest_created'
  | 'manifest_updated'
  | 'manifest_complete'
  | 'supervisor_decision'
  | 'conflict_detected'
  | 'merge_started'
  | 'merge_complete'
  | 'escalation';

export interface LaneEvent {
  type: LaneEventType;
  timestamp: number;
  manifest_id: string;
  lane_id?: string;
  data: Record<string, unknown>;
}

// ─── Protocol Configuration ─────────────────────────────────────────────────

export interface ProtocolV2Config {
  maxConcurrentWorkers: number;
  maxConcurrentVerifiers: number;
  laneTimeoutMs: number;
  maxReworkAttempts: number;
  conflictResolution: 'supervisor_arbitrated';
  mergeStrategy: 'sequential_verified';
  supervisorModel: string;
  defaultWorkerModel: string;
  defaultVerifierModel: string;
  executorModel: string;
}

export const DEFAULT_PROTOCOL_V2_CONFIG: ProtocolV2Config = {
  maxConcurrentWorkers: 4,
  maxConcurrentVerifiers: 4,
  laneTimeoutMs: 300_000,
  maxReworkAttempts: 2,
  conflictResolution: 'supervisor_arbitrated',
  mergeStrategy: 'sequential_verified',
  // TITAN COST ARCHITECTURE v2:
  // Supervisor uses Qwen3.5-Plus (frontier reasoning at $0.40/$2.40 vs Opus $15/$75 — 37x cheaper).
  // Workers use Qwen3-Coder-Next ($0.12/$0.75) — purpose-built for code generation.
  // Verifiers use DeepSeek-Reasoner ($0.55/$2.19) — chain-of-thought verification at near-zero cost.
  // Executor uses Gemini 2.0 Flash ($0.075/$0.30) — fastest, cheapest tool-call executor available.
  supervisorModel: 'qwen3.5-plus-02-15',
  defaultWorkerModel: 'qwen3-coder-next',
  defaultVerifierModel: 'deepseek-r1',
  executorModel: 'gemini-2.0-flash',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

let _counter = 0;
export function generateLaneId(): string {
  _counter++;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `lane-${ts}-${rand}-${_counter}`;
}

export function generateManifestId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `manifest-${ts}-${rand}`;
}

export function isTerminal(status: LaneStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isActive(status: LaneStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}
