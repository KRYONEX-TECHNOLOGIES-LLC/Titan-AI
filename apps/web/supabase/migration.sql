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
