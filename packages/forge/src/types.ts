// ── Titan Forge — Shared Type Definitions ──
// These interfaces define every data shape in the distillation pipeline.

export type ModelTier = 'frontier' | 'economy' | 'local';
export type SampleOutcome = 'success' | 'failure' | 'unknown' | 'rejected';
export type TrainingRunStatus = 'running' | 'completed' | 'failed';
export type TrainingMethod = 'qlora' | 'full' | 'dpo';
export type ExportFormat = 'sharegpt' | 'jsonl' | 'alpaca';

// ── Raw sample captured from the chat pipeline ──
export interface ForgeSample {
  id: string;
  session_id: string | null;
  created_at: string;
  model_id: string;
  model_tier: ModelTier;
  system_prompt: string;
  messages: ChatMessage[];
  response: string;
  tool_calls: ToolCall[];
  tool_results: ToolResult[];
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  quality_score: number;
  quality_signals: QualitySignals | null;
  outcome: SampleOutcome;
  exported: boolean;
  prompt_hash: string;
}

// ── Chat message (OpenAI format) ──
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

// ── Tool call captured from the LLM ──
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ── Result of executing a tool call ──
export interface ToolResult {
  tool_call_id: string;
  tool_name: string;
  success: boolean;
  output: string;
  metadata?: Record<string, unknown>;
}

// ── Quality scoring signals breakdown ──
export interface QualitySignals {
  // Positive signals
  build_fixed: boolean;         // Code edit made a failing build pass
  debug_resolved: boolean;      // Debug loop resolved original error
  multifile_clean: boolean;     // Multi-file edit compiled clean on first try
  git_committed: boolean;       // git_commit succeeded in this session
  lint_clean: boolean;          // read_lints returned 0 diagnostics
  top_model: boolean;           // Response from top-3 frontier model
  user_accepted: boolean;       // User said "perfect", "exactly", "great"
  user_continued: boolean;      // User moved to next task without re-asking

  // Negative signals
  hallucinated_path: boolean;   // Tool call to non-existent file
  user_rejected: boolean;       // User said "no", "wrong", re-prompted immediately
  rolled_back: boolean;         // git_restore_checkpoint was called
  wrong_tier: boolean;          // Economy/local model (should never reach gate)
  fix_failed: boolean;          // Same error persisted after fix attempt
  pure_chat: boolean;           // No tool calls, no code blocks

  // Raw score contribution from each signal
  score_breakdown: Record<string, number>;
  final_score: number;
}

// ── Input to the collector from route.ts ──
export interface CollectorInput {
  id?: string;           // Pre-generated UUID from client — allows signals to reference sample before DB insert completes
  sessionId: string | null;
  modelId: string;
  modelTier: ModelTier;
  systemPrompt: string;
  messages: ChatMessage[];
  response: string;
  toolCalls: ToolCall[];
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
  costUsd?: number;
}

// ── Outcome signal reported from useChat.ts ──
export interface OutcomeSignal {
  sampleId: string;
  type: SignalType;
  value: boolean | number | string;
  timestamp: number;
}

export type SignalType =
  | 'build_passed'
  | 'build_failed'
  | 'lint_clean'
  | 'lint_errors'
  | 'git_committed'
  | 'git_rolled_back'
  | 'debug_resolved'
  | 'debug_failed'
  | 'user_accepted'
  | 'user_rejected'
  | 'user_continued'
  | 'tool_hallucination';

// ── Training run metadata ──
export interface ForgeRun {
  id: string;
  created_at: string;
  base_model: string;
  method: TrainingMethod;
  samples_used: number;
  min_quality_score: number;
  config: TrainingConfig;
  metrics: EvalMetrics | null;
  model_path: string | null;
  status: TrainingRunStatus;
}

export interface TrainingConfig {
  lora_r: number;
  lora_alpha: number;
  lora_dropout: number;
  learning_rate: number;
  num_epochs: number;
  sequence_len: number;
  micro_batch_size: number;
  gradient_accumulation_steps: number;
  curriculum_phase: 'general' | 'code' | 'titan';
}

// ── Evaluation result ──
export interface ForgeEval {
  id: string;
  run_id: string;
  prompt_id: string;
  teacher_model: string;
  teacher_response: string;
  student_response: string;
  teacher_score: number;
  student_score: number;
  judge_model: string;
  category: 'bug_fix' | 'feature' | 'refactor' | 'config' | 'general';
  created_at: string;
}

export interface EvalMetrics {
  student_win_rate: number;       // % of prompts where student >= teacher
  avg_teacher_score: number;
  avg_student_score: number;
  score_ratio: number;            // student/teacher (>= 0.85 = passing)
  by_category: Record<string, { teacher: number; student: number }>;
  total_evaluated: number;
}

// ── ShareGPT export format ──
export interface ShareGPTConversation {
  conversations: Array<{
    from: 'system' | 'human' | 'gpt';
    value: string;
  }>;
}

// ── OpenAI JSONL fine-tuning format ──
export interface OpenAIFineTuneEntry {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
    tool_calls?: ToolCall[];
  }>;
}

// ── Export stats ──
export interface ExportStats {
  total_exported: number;
  by_model: Record<string, number>;
  by_quality_tier: Record<string, number>;
  by_outcome: Record<string, number>;
  date_range: { earliest: string; latest: string };
}

// ── Harvest types (web scraper) ──

export type HarvestSource = 'github' | 'stackoverflow' | 'docs' | 'blog' | 'dataset' | 'reddit' | 'devto' | 'mdn' | 'wikipedia' | 'hackernews' | 'github-issues' | 'arxiv' | 'gitlab' | 'npm-docs' | 'competitive' | 'evol-instruct';
export type HarvestStatus = 'pending' | 'approved' | 'rejected' | 'migrated';

export interface HarvestSample {
  id: string;
  source: HarvestSource;
  source_url: string;
  batch_id: string;
  instruction: string;
  response: string;
  quality_score: number;
  quality_reason: string;
  tags: string[];
  language: string;
  char_count: number;
  status: HarvestStatus;
  prompt_hash: string;
  created_at: string;
}

export interface HarvestBatch {
  id: string;
  source: HarvestSource;
  topic: string | null;
  started_at: string;
  completed_at: string | null;
  total_scraped: number;
  passed_filter: number;
  rejected: number;
  status: 'running' | 'completed' | 'failed';
}

export interface HarvestStats {
  total_harvested: number;
  total_approved: number;
  total_migrated: number;
  total_rejected: number;
  by_source: Record<string, number>;
  by_language: Record<string, number>;
  recent_batches: HarvestBatch[];
}

// ── Vault types (backup) ──

export interface VaultSnapshot {
  timestamp: string;
  samples_count: number;
  harvest_count: number;
  runs_count: number;
  evals_count: number;
  sha256: string;
  size_bytes: number;
}

// ── Forge Dashboard stats (sent to UI) ──

export interface ForgeDashboardStats {
  distillation: {
    total_samples: number;
    high_value: number;
    exported: number;
    by_model: Record<string, number>;
    by_outcome: Record<string, number>;
  };
  harvest: HarvestStats;
  vault: {
    last_backup: string | null;
    total_snapshots: number;
  };
}
