// MCP Coordination Types
// packages/mcp/coordination/src/types.ts

export interface CoordinatorConfig {
  maxConcurrentAgents: number;
  taskTimeout: number;
  consensusThreshold: number; // 0-1, percentage of agents needed for consensus
  conflictResolutionStrategy: 'first-wins' | 'merge' | 'vote' | 'priority';
}

export interface AgentRegistration {
  id: string;
  name: string;
  capabilities: string[];
  priority: number;
  metadata?: Record<string, unknown>;
}

export interface CoordinatedTask {
  id: string;
  type: TaskType;
  description: string;
  requiredCapabilities: string[];
  input: unknown;
  status: TaskStatus;
  assignedAgents: string[];
  results: Map<string, AgentResult>;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  metadata?: Record<string, unknown>;
}

export type TaskType = 'single' | 'parallel' | 'sequential' | 'consensus' | 'competitive';
export type TaskStatus = 'pending' | 'assigned' | 'running' | 'consensus' | 'completed' | 'failed' | 'timeout';

export interface AgentResult {
  agentId: string;
  success: boolean;
  output: unknown;
  confidence?: number;
  duration: number;
  error?: Error;
}

export interface ConsensusProposal {
  id: string;
  taskId: string;
  proposerId: string;
  proposal: unknown;
  votes: Map<string, VoteDecision>;
  status: 'pending' | 'accepted' | 'rejected' | 'timeout';
  createdAt: number;
  deadline: number;
}

export interface VoteDecision {
  agentId: string;
  approve: boolean;
  reason?: string;
  timestamp: number;
}

export interface ConflictEvent {
  id: string;
  taskId: string;
  type: ConflictType;
  agents: string[];
  conflictingOutputs: Map<string, unknown>;
  resolution?: ConflictResolution;
  createdAt: number;
  resolvedAt?: number;
}

export type ConflictType = 'output-mismatch' | 'resource-contention' | 'deadlock' | 'priority-conflict';

export interface ConflictResolution {
  strategy: string;
  winner?: string;
  mergedOutput?: unknown;
  voteCounts?: Map<unknown, number>;
}

export interface CoordinationMessage {
  id: string;
  type: MessageType;
  senderId: string;
  recipientId?: string; // undefined = broadcast
  payload: unknown;
  timestamp: number;
}

export type MessageType = 
  | 'task-assignment'
  | 'task-result'
  | 'consensus-proposal'
  | 'consensus-vote'
  | 'conflict-notification'
  | 'conflict-resolution'
  | 'heartbeat'
  | 'status-update';
