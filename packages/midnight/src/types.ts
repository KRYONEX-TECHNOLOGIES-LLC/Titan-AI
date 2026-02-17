/**
 * Titan AI - Project Midnight Type Definitions
 */

// ═══════════════════════════════════════════════════════════════════════════
// TRUST LEVELS
// ═══════════════════════════════════════════════════════════════════════════

export type TrustLevel = 1 | 2 | 3;

export interface TrustLevelConfig {
  level: TrustLevel;
  name: string;
  description: string;
  permissions: TrustPermissions;
}

export interface TrustPermissions {
  autoApplyEdits: boolean;
  autoRunTerminal: boolean;
  autoCommit: boolean;
  autoRotateProjects: boolean;
  requireConfirmation: boolean;
}

export const TRUST_LEVELS: TrustLevelConfig[] = [
  {
    level: 1,
    name: 'Supervised',
    description: 'Standard co-pilot mode - requires approval for all actions',
    permissions: {
      autoApplyEdits: false,
      autoRunTerminal: false,
      autoCommit: false,
      autoRotateProjects: false,
      requireConfirmation: true,
    },
  },
  {
    level: 2,
    name: 'Assistant',
    description: 'Multi-file edits allowed - requires Apply clicks',
    permissions: {
      autoApplyEdits: false,
      autoRunTerminal: true,
      autoCommit: false,
      autoRotateProjects: false,
      requireConfirmation: true,
    },
  },
  {
    level: 3,
    name: 'Project Midnight',
    description: 'Full autonomy - no permissions asked, auto repo rotation',
    permissions: {
      autoApplyEdits: true,
      autoRunTerminal: true,
      autoCommit: true,
      autoRotateProjects: true,
      requireConfirmation: false,
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT DNA
// ═══════════════════════════════════════════════════════════════════════════

export interface ProjectDNA {
  ideaMd: string;
  techStackJson: TechStack;
  definitionOfDoneMd: string;
}

export interface TechStack {
  runtime: string;
  framework?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface QueuedProject {
  id: string;
  name: string;
  repoUrl?: string;
  localPath: string;
  status: ProjectStatus;
  priority: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  currentTaskId?: string;
  gitHash?: string;
  errorMessage?: string;
  dna?: ProjectDNA;
}

export type ProjectStatus =
  | 'queued'
  | 'loading'
  | 'planning'
  | 'building'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cooldown';

// ═══════════════════════════════════════════════════════════════════════════
// TASK MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface MidnightTask {
  id: string;
  projectId: string;
  description: string;
  status: TaskStatus;
  assignedAgent: 'actor' | 'sentinel';
  priority: number;
  dependencies: string[];
  worktreePath?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: TaskResult;
  retryCount: number;
}

export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'locked'
  | 'reverted';

export interface TaskResult {
  success: boolean;
  output: string;
  artifacts: TaskArtifact[];
  errors: TaskError[];
  metrics: TaskMetrics;
  sentinelVerdict?: SentinelVerdict;
}

export interface TaskArtifact {
  type: 'file' | 'diff' | 'command' | 'test';
  path?: string;
  content: string;
  action: 'create' | 'modify' | 'delete' | 'execute';
}

export interface TaskError {
  code: string;
  message: string;
  recoverable: boolean;
  suggestion?: string;
  file?: string;
  line?: number;
}

export interface TaskMetrics {
  tokensUsed: number;
  latencyMs: number;
  iterations: number;
  toolCalls: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SENTINEL VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

export interface SentinelVerdict {
  id: string;
  taskId: string;
  qualityScore: number;
  passed: boolean;
  thinkingEffort: 'max';
  auditLog: AuditLog;
  correctionDirective: string | null;
  merkleVerificationHash: string;
  createdAt: number;
}

export interface AuditLog {
  traceability: TraceabilityCheck;
  architecturalSins: string[];
  slopPatternsDetected: string[];
}

export interface TraceabilityCheck {
  mapped: string[];
  missing: string[];
  unplannedAdditions: string[];
}

// Slop Penalty Matrix
export const SLOP_PENALTIES = {
  MISSING_TESTS: -20,
  AI_FINGERPRINTS: -15,
  UNUSED_IMPORTS: -10,
  INCONSISTENT_NAMING: -10,
  TRAJECTORY_DRIFT: -30,
  NO_ERROR_HANDLING: -25,
  DEEP_NESTING: -15,
  MONOLITHIC_FUNCTION: -10,
  HARDCODED_SECRETS: -50, // IMMEDIATE VETO
  CONSOLE_LOGS: -5,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface StateSnapshot {
  id: string;
  projectId: string;
  gitHash: string;
  agentState: AgentStateSnapshot;
  reasoningTrace: string[];
  createdAt: number;
}

export interface AgentStateSnapshot {
  actorMemory: AgentMemory;
  sentinelState: SentinelState;
  currentTaskId: string;
  taskProgress: number;
  iterationCount: number;
}

export interface AgentMemory {
  messages: AgentMessage[];
  context: Record<string, unknown>;
  shortTermBuffer: unknown[];
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  toolCallId?: string;
}

export interface SentinelState {
  lastVerdict: SentinelVerdict | null;
  verificationCount: number;
  vetoCount: number;
  averageQualityScore: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// COOLDOWN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface Cooldown {
  id: string;
  provider: string;
  startedAt: number;
  resumeAt: number;
  snapshotId: string;
  reason: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ORCHESTRATION EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export type MidnightEvent =
  | { type: 'project_started'; project: QueuedProject }
  | { type: 'project_completed'; project: QueuedProject }
  | { type: 'project_failed'; project: QueuedProject; error: string }
  | { type: 'task_started'; task: MidnightTask }
  | { type: 'task_completed'; task: MidnightTask; result: TaskResult }
  | { type: 'task_failed'; task: MidnightTask; error: TaskError }
  | { type: 'task_locked'; task: MidnightTask; reason: string }
  | { type: 'sentinel_verdict'; verdict: SentinelVerdict }
  | { type: 'sentinel_veto'; taskId: string; reason: string }
  | { type: 'worktree_reverted'; taskId: string; toHash: string }
  | { type: 'snapshot_created'; snapshot: StateSnapshot }
  | { type: 'cooldown_entered'; cooldown: Cooldown }
  | { type: 'cooldown_exited'; cooldown: Cooldown }
  | { type: 'handoff_triggered'; fromProject: string; toProject: string }
  | { type: 'confidence_update'; score: number; status: 'healthy' | 'warning' | 'error' };

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface MidnightConfig {
  trustLevel: TrustLevel;
  queuePath: string;
  snapshotIntervalMs: number;
  qualityThreshold: number;
  maxRetries: number;
  actorModel: string;
  sentinelModel: string;
  sentinelEffort: 'low' | 'medium' | 'high' | 'max';
  enableWorktrees: boolean;
  enableKataContainers: boolean;
  logPath: string;
  pidFile: string;
  verbose: boolean;
}

export interface MidnightStatus {
  running: boolean;
  currentProject: QueuedProject | null;
  queueLength: number;
  confidenceScore: number;
  confidenceStatus: 'healthy' | 'warning' | 'error';
  uptime: number;
  tasksCompleted: number;
  tasksFailed: number;
  cooldowns: Cooldown[];
}

// ═══════════════════════════════════════════════════════════════════════════
// IPC MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

export type IPCRequest =
  | { type: 'status' }
  | { type: 'start'; config?: Partial<MidnightConfig> }
  | { type: 'stop'; graceful?: boolean }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'queue_add'; projectPath: string }
  | { type: 'queue_remove'; projectId: string }
  | { type: 'queue_list' }
  | { type: 'snapshot_list'; projectId?: string }
  | { type: 'snapshot_recover'; snapshotId: string }
  | { type: 'subscribe_events' };

export type IPCResponse =
  | { type: 'status'; data: MidnightStatus }
  | { type: 'queue'; data: QueuedProject[] }
  | { type: 'snapshots'; data: StateSnapshot[] }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string }
  | { type: 'event'; event: MidnightEvent };
