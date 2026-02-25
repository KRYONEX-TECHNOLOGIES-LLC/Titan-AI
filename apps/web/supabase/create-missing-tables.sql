-- Create missing Forge tables (forge_samples, forge_runs, forge_evals)
-- forge_harvest already exists with 149 rows

CREATE TABLE IF NOT EXISTS forge_samples (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       TEXT,
  model_id         TEXT NOT NULL DEFAULT '',
  model_tier       TEXT NOT NULL DEFAULT 'economy',
  system_prompt    TEXT NOT NULL DEFAULT '',
  messages         JSONB NOT NULL DEFAULT '[]'::jsonb,
  response         TEXT NOT NULL DEFAULT '',
  tool_calls       JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_results     JSONB NOT NULL DEFAULT '[]'::jsonb,
  tokens_in        INTEGER NOT NULL DEFAULT 0,
  tokens_out       INTEGER NOT NULL DEFAULT 0,
  latency_ms       INTEGER NOT NULL DEFAULT 0,
  cost_usd         NUMERIC(10,6) NOT NULL DEFAULT 0,
  quality_score    SMALLINT NOT NULL DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 10),
  quality_signals  JSONB DEFAULT NULL,
  outcome          TEXT NOT NULL DEFAULT 'pending',
  prompt_hash      TEXT NOT NULL DEFAULT '',
  exported         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forge_samples_score     ON forge_samples(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_forge_samples_tier      ON forge_samples(model_tier);
CREATE INDEX IF NOT EXISTS idx_forge_samples_exported  ON forge_samples(exported) WHERE exported = FALSE;
CREATE INDEX IF NOT EXISTS idx_forge_samples_hash      ON forge_samples(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_forge_samples_outcome   ON forge_samples(outcome);
CREATE INDEX IF NOT EXISTS idx_forge_samples_created   ON forge_samples(created_at DESC);

CREATE TABLE IF NOT EXISTS forge_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  base_model         TEXT NOT NULL,
  method             TEXT NOT NULL CHECK (method IN ('qlora', 'full', 'dpo')),
  samples_used       INTEGER NOT NULL DEFAULT 0,
  min_quality_score  SMALLINT NOT NULL DEFAULT 7,
  config             JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics            JSONB DEFAULT NULL,
  model_path         TEXT DEFAULT NULL,
  status             TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_forge_runs_status  ON forge_runs(status);
CREATE INDEX IF NOT EXISTS idx_forge_runs_created ON forge_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS forge_evals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           UUID REFERENCES forge_runs(id) ON DELETE CASCADE,
  prompt_id        UUID,
  teacher_model    TEXT NOT NULL,
  teacher_response TEXT NOT NULL DEFAULT '',
  student_model    TEXT NOT NULL,
  student_response TEXT NOT NULL DEFAULT '',
  teacher_score    SMALLINT NOT NULL DEFAULT 0,
  student_score    SMALLINT NOT NULL DEFAULT 0,
  category         TEXT NOT NULL DEFAULT 'general',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forge_evals_run     ON forge_evals(run_id);
CREATE INDEX IF NOT EXISTS idx_forge_evals_created ON forge_evals(created_at DESC);

ALTER TABLE forge_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge_evals   ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'forge_samples' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON forge_samples FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'forge_runs' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON forge_runs FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'forge_evals' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON forge_evals FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;
