export interface ToolCallBlock {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  status: 'running' | 'done' | 'error';
  result?: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface CodeDiffBlock {
  id: string;
  file: string;
  language?: string;
  code: string;
  status: 'pending' | 'applied' | 'rejected';
}

export interface Session {
  id: string;
  name: string;
  time: string;
  messages: ChatMessage[];
  changedFiles: ChangedFile[];
}

export interface FileTab {
  name: string;
  icon: string;
  color: string;
  modified?: boolean;
}

export interface ChangedFile {
  name: string;
  additions: number;
  deletions: number;
  icon: string;
  color: string;
}

export interface FileAttachment {
  id: string;
  file: File;
  previewUrl: string;
  base64?: string;
  mediaType: string;
  status: 'pending' | 'ready' | 'error';
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  attachments?: { mediaType: string; base64: string }[];
  time?: string;
  streaming?: boolean;
  streamingModel?: string;
  streamingProviderModel?: string;
  streamingProvider?: string;
  thinking?: string;
  thinkingTime?: number;
  isError?: boolean;
  retryMessage?: string;
  toolCalls?: ToolCallBlock[];
  codeDiffs?: CodeDiffBlock[];
  toolResultFor?: string;
}

export interface SearchResult {
  file: string;
  line: number;
  content: string;
  match: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  tier: 'frontier' | 'standard' | 'economy' | 'local';
  contextWindow: number;
  supportsThinking: boolean;
  supportsVision: boolean;
  costPer1MInput: number;
  costPer1MOutput: number;
}

export interface PendingDiff {
  file: string;
  oldContent: string;
  newContent: string;
  decorationIds: string[];
}

// ─── Titan Protocol v2: Lane Types (Frontend) ──────────────────────────────

export type LaneStatusUI =
  | 'QUEUED' | 'PROVISIONING' | 'ASSIGNED' | 'WORKING'
  | 'PENDING_VERIFY' | 'VERIFYING' | 'VERIFIED' | 'REJECTED'
  | 'PENDING_REWORK' | 'MERGE_CONFLICT' | 'PENDING_RECONCILIATION'
  | 'MERGED' | 'FAILED' | 'ARCHIVED';

export interface LaneSummary {
  lane_id: string;
  task_manifest_id: string;
  subtask_node_id: string;
  status: LaneStatusUI;
  title: string;
  worker_model_id: string;
  verifier_model_id: string;
  files_touched: string[];
  failure_count: number;
  created_at: number;
  updated_at: number;
  completed_at?: number;
  verifierVerdict?: 'PASS' | 'FAIL';
  elapsedMs: number;
  totalCost: number;
}

export interface DAGNodeUI {
  id: string;
  title: string;
  dependencies: string[];
  lane_id?: string;
  status: 'PENDING' | 'DISPATCHED' | 'COMPLETE' | 'FAILED';
}

export interface TaskManifestUI {
  id: string;
  goal: string;
  nodes: DAGNodeUI[];
  status: 'ACTIVE' | 'COMPLETE' | 'FAILED' | 'CANCELLED';
  created_at: number;
}

export interface LaneEventUI {
  type: string;
  timestamp: number;
  manifest_id: string;
  lane_id?: string;
  data: Record<string, unknown>;
}
