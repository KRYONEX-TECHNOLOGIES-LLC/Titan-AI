-- ============================================================================
-- Titan AI — Supabase Migration
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================================

-- Users table (synced from GitHub OAuth)
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  github_id     BIGINT UNIQUE NOT NULL,
  username      TEXT NOT NULL,
  name          TEXT,
  email         TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT,
  name            TEXT NOT NULL,
  model           TEXT NOT NULL DEFAULT 'claude-4.6-sonnet',
  messages        JSONB NOT NULL DEFAULT '[]'::jsonb,
  changed_files   JSONB NOT NULL DEFAULT '[]'::jsonb,
  context_window  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated ON chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON chat_sessions(user_id);

-- Workspaces (cloned repos)
CREATE TABLE IF NOT EXISTS workspaces (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  repo_name       TEXT NOT NULL,
  clone_url       TEXT NOT NULL DEFAULT '',
  local_path      TEXT NOT NULL DEFAULT '',
  branch          TEXT DEFAULT 'main',
  repo_owner      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexing state (file hashing / code intelligence)
CREATE TABLE IF NOT EXISTS indexing_state (
  file_path   TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,
  symbols     JSONB NOT NULL DEFAULT '[]'::jsonb,
  chunks      JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_indexing_hash ON indexing_state(hash);

-- Midnight autonomous mode state
CREATE TABLE IF NOT EXISTS midnight_state (
  id               TEXT PRIMARY KEY,
  status           TEXT NOT NULL DEFAULT 'idle',
  queue            JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_project  TEXT,
  progress         JSONB NOT NULL DEFAULT '{}'::jsonb,
  trust_level      REAL NOT NULL DEFAULT 0.5,
  confidence       REAL NOT NULL DEFAULT 0.0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Spec contracts
CREATE TABLE IF NOT EXISTS spec_contracts (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  contract    JSONB NOT NULL DEFAULT '{}'::jsonb,
  progress    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Titan Forge — Knowledge Distillation Tables
-- Run this section after the base migration.
-- ============================================================================

-- forge_samples: Every captured high-value model interaction
CREATE TABLE IF NOT EXISTS forge_samples (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       TEXT REFERENCES chat_sessions(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  model_id         TEXT NOT NULL,
  model_tier       TEXT NOT NULL CHECK (model_tier IN ('frontier', 'economy', 'local')),
  system_prompt    TEXT NOT NULL DEFAULT '',
  messages         JSONB NOT NULL DEFAULT '[]'::jsonb,
  response         TEXT NOT NULL DEFAULT '',
  tool_calls       JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_results     JSONB NOT NULL DEFAULT '[]'::jsonb,
  tokens_in        INTEGER,
  tokens_out       INTEGER,
  latency_ms       INTEGER,
  cost_usd         NUMERIC(10, 6),
  quality_score    SMALLINT NOT NULL DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 10),
  quality_signals  JSONB,
  outcome          TEXT NOT NULL DEFAULT 'unknown' CHECK (outcome IN ('success', 'failure', 'unknown', 'rejected')),
  exported         BOOLEAN NOT NULL DEFAULT FALSE,
  prompt_hash      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_forge_samples_score     ON forge_samples(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_forge_samples_tier      ON forge_samples(model_tier);
CREATE INDEX IF NOT EXISTS idx_forge_samples_exported  ON forge_samples(exported) WHERE exported = FALSE;
CREATE INDEX IF NOT EXISTS idx_forge_samples_hash      ON forge_samples(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_forge_samples_outcome   ON forge_samples(outcome);
CREATE INDEX IF NOT EXISTS idx_forge_samples_created   ON forge_samples(created_at DESC);

-- forge_runs: Metadata for each training run
CREATE TABLE IF NOT EXISTS forge_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  base_model         TEXT NOT NULL,
  method             TEXT NOT NULL DEFAULT 'qlora' CHECK (method IN ('qlora', 'full', 'dpo')),
  samples_used       INTEGER NOT NULL DEFAULT 0,
  min_quality_score  SMALLINT NOT NULL DEFAULT 7,
  config             JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics            JSONB,
  model_path         TEXT,
  status             TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_forge_runs_status  ON forge_runs(status);
CREATE INDEX IF NOT EXISTS idx_forge_runs_created ON forge_runs(created_at DESC);

-- forge_evals: Benchmark results comparing teacher vs student
CREATE TABLE IF NOT EXISTS forge_evals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           UUID REFERENCES forge_runs(id) ON DELETE CASCADE,
  prompt_id        UUID REFERENCES forge_samples(id) ON DELETE SET NULL,
  teacher_model    TEXT NOT NULL,
  teacher_response TEXT NOT NULL DEFAULT '',
  student_response TEXT NOT NULL DEFAULT '',
  teacher_score    NUMERIC(4, 2) NOT NULL DEFAULT 0,
  student_score    NUMERIC(4, 2) NOT NULL DEFAULT 0,
  judge_model      TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('bug_fix', 'feature', 'refactor', 'config', 'general')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forge_evals_run     ON forge_evals(run_id);
CREATE INDEX IF NOT EXISTS idx_forge_evals_created ON forge_evals(created_at DESC);

-- forge_harvest: Web-scraped training data (from Forge Harvester)
CREATE TABLE IF NOT EXISTS forge_harvest (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source           TEXT NOT NULL CHECK (source IN ('github', 'stackoverflow', 'docs', 'blog', 'dataset', 'reddit', 'devto', 'mdn', 'wikipedia', 'hackernews')),
  source_url       TEXT NOT NULL DEFAULT '',
  batch_id         TEXT NOT NULL,
  instruction      TEXT NOT NULL DEFAULT '',
  response         TEXT NOT NULL DEFAULT '',
  quality_score    SMALLINT NOT NULL DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 10),
  quality_reason   TEXT NOT NULL DEFAULT '',
  tags             JSONB NOT NULL DEFAULT '[]'::jsonb,
  language         TEXT NOT NULL DEFAULT 'general',
  char_count       INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'migrated')),
  prompt_hash      TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forge_harvest_status   ON forge_harvest(status);
CREATE INDEX IF NOT EXISTS idx_forge_harvest_source   ON forge_harvest(source);
CREATE INDEX IF NOT EXISTS idx_forge_harvest_score    ON forge_harvest(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_forge_harvest_hash     ON forge_harvest(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_forge_harvest_batch    ON forge_harvest(batch_id);
CREATE INDEX IF NOT EXISTS idx_forge_harvest_created  ON forge_harvest(created_at DESC);

-- forge_harvest_batches: Metadata for each scraping run
CREATE TABLE IF NOT EXISTS forge_harvest_batches (
  id               TEXT PRIMARY KEY,
  source           TEXT NOT NULL,
  topic            TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  total_scraped    INTEGER NOT NULL DEFAULT 0,
  passed_filter    INTEGER NOT NULL DEFAULT 0,
  rejected         INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_forge_harvest_batches_status ON forge_harvest_batches(status);

-- RLS for Forge tables (service role bypasses, no public access)
ALTER TABLE forge_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge_evals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge_harvest ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge_harvest_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON forge_samples FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON forge_runs    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON forge_evals   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON forge_harvest FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON forge_harvest_batches FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- Row-Level Security policies (optional but recommended)
-- Enable RLS on tables that store user data:
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- Allow the service_role key (used by your backend) to bypass RLS
-- These are permissive policies for the service role:
CREATE POLICY "Service role full access" ON chat_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access" ON workspaces
  FOR ALL USING (true) WITH CHECK (true);
