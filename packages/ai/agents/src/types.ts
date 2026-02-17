/**
 * Titan AI Agents - Type Definitions
 */

// Agent roles
export type AgentRole =
  | 'coordinator'
  | 'security-reviewer'
  | 'refactor-specialist'
  | 'test-writer'
  | 'doc-writer'
  | 'code-reviewer'
  | 'debugger'
  | 'architect';

// Agent status
export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'waiting' | 'error' | 'completed';

// Task priority
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

// Task status
export type TaskStatus = 'pending' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled';

// Agent task
export interface AgentTask {
  id: string;
  type: string;
  description: string;
  priority: TaskPriority;
  assignedTo?: AgentRole;
  dependencies: string[];
  worktreePath?: string;
  status: TaskStatus;
  result?: TaskResult;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

// Task result
export interface TaskResult {
  success: boolean;
  output: string;
  artifacts: TaskArtifact[];
  errors: TaskError[];
  metrics: TaskMetrics;
}

// Task artifact (files created/modified)
export interface TaskArtifact {
  type: 'file' | 'diff' | 'command' | 'message';
  path?: string;
  content: string;
  action: 'create' | 'modify' | 'delete';
}

// Task error
export interface TaskError {
  code: string;
  message: string;
  recoverable: boolean;
  suggestion?: string;
}

// Task metrics
export interface TaskMetrics {
  tokensUsed: number;
  latencyMs: number;
  iterations: number;
  toolCalls: number;
}

// Agent configuration
export interface AgentConfig {
  role: AgentRole;
  model: string;
  systemPrompt: string;
  tools: string[];
  maxIterations: number;
  timeout: number;
}

// Agent state
export interface AgentState {
  id: string;
  role: AgentRole;
  status: AgentStatus;
  currentTask?: AgentTask;
  memory: AgentMemory;
  metrics: AgentMetrics;
}

// Agent memory (conversation history + context)
export interface AgentMemory {
  messages: AgentMessage[];
  context: Record<string, unknown>;
  shortTerm: unknown[];
  longTerm: unknown[];
}

// Agent message
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  toolCallId?: string;
  toolName?: string;
}

// Agent metrics
export interface AgentMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  totalTokens: number;
  averageLatency: number;
  toolCallCount: number;
}

// Team configuration
export interface TeamConfig {
  coordinator: AgentConfig;
  specialists: Record<AgentRole, AgentConfig>;
  parallelExecution: boolean;
  maxConcurrent: number;
}

// Conflict types
export type ConflictType = 'file' | 'logic' | 'dependency' | 'resource';

// Conflict resolution
export interface ConflictResolution {
  conflictId: string;
  type: ConflictType;
  strategy: 'merge' | 'overwrite' | 'manual' | 'abort';
  resolution: string;
  affectedFiles: string[];
  resolvedBy: AgentRole;
}

// Tool definition
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

// Tool parameter
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: unknown;
}

// Tool result
export interface ToolResult {
  success: boolean;
  output: string;
  data?: unknown;
  error?: string;
}

// Node types for Pocket Flow
export type NodeType = 'decision' | 'analysis' | 'modification' | 'verification';

// Node execution context
export interface NodeContext {
  task: AgentTask;
  memory: AgentMemory;
  tools: Map<string, ToolDefinition>;
  state: Record<string, unknown>;
}

// Node result
export interface NodeResult {
  success: boolean;
  output: unknown;
  nextNode?: NodeType;
  shouldTerminate: boolean;
}

// Worktree info
export interface WorktreeInfo {
  path: string;
  branch: string;
  agent: AgentRole;
  createdAt: number;
  status: 'active' | 'merged' | 'abandoned';
}

// Orchestrator events
export type OrchestratorEvent =
  | { type: 'task_created'; task: AgentTask }
  | { type: 'task_assigned'; task: AgentTask; agent: AgentRole }
  | { type: 'task_started'; task: AgentTask }
  | { type: 'task_completed'; task: AgentTask; result: TaskResult }
  | { type: 'task_failed'; task: AgentTask; error: TaskError }
  | { type: 'agent_status_changed'; agent: AgentRole; status: AgentStatus }
  | { type: 'conflict_detected'; conflict: ConflictResolution }
  | { type: 'conflict_resolved'; conflict: ConflictResolution };
