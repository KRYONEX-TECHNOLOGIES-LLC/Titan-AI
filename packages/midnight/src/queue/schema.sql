-- ═══════════════════════════════════════════════════════════════════════════
-- Titan AI - Project Midnight Database Schema
-- SQLite-backed persistent storage for autonomous factory operations
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROJECT QUEUE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_url TEXT,
  local_path TEXT NOT NULL,
  status TEXT DEFAULT 'queued' CHECK (status IN (
    'queued', 'loading', 'planning', 'building', 'verifying', 
    'completed', 'failed', 'paused', 'cooldown'
  )),
  priority INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  current_task_id TEXT,
  git_hash TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_priority ON projects(priority DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- PROJECT DNA (idea.md, tech_stack.json, definition_of_done.md)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_dna (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  idea_md TEXT NOT NULL,
  tech_stack_json TEXT NOT NULL,
  definition_of_done_md TEXT NOT NULL
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TASKS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'assigned', 'running', 'verifying', 
    'completed', 'failed', 'locked', 'reverted'
  )),
  assigned_agent TEXT CHECK (assigned_agent IN ('actor', 'sentinel')),
  priority INTEGER DEFAULT 0,
  dependencies TEXT, -- JSON array of task IDs
  worktree_path TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  result_json TEXT,
  retry_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- ═══════════════════════════════════════════════════════════════════════════
-- STATE SNAPSHOTS (every 5 minutes)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS state_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  git_hash TEXT NOT NULL,
  agent_state_json TEXT NOT NULL,
  reasoning_trace TEXT, -- JSON array of reasoning steps
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_project ON state_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_created ON state_snapshots(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- SENTINEL VERDICTS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sentinel_verdicts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  quality_score REAL NOT NULL,
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  thinking_effort TEXT DEFAULT 'max',
  audit_log_json TEXT NOT NULL, -- JSON with traceability, sins, slop patterns
  correction_directive TEXT,
  merkle_verification_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verdicts_task ON sentinel_verdicts(task_id);
CREATE INDEX IF NOT EXISTS idx_verdicts_passed ON sentinel_verdicts(passed);

-- ═══════════════════════════════════════════════════════════════════════════
-- COOLDOWN TRACKING (for API rate limits)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cooldowns (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  resume_at INTEGER NOT NULL,
  snapshot_id TEXT REFERENCES state_snapshots(id),
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_cooldowns_resume ON cooldowns(resume_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- EXECUTION LOG (for debugging and audit)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS execution_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  source TEXT NOT NULL, -- 'actor', 'sentinel', 'orchestrator', 'service'
  message TEXT NOT NULL,
  context_json TEXT, -- Additional context data
  project_id TEXT REFERENCES projects(id),
  task_id TEXT REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_log_timestamp ON execution_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_log_level ON execution_log(level);
CREATE INDEX IF NOT EXISTS idx_log_project ON execution_log(project_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- METRICS (for dashboard)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  project_id TEXT REFERENCES projects(id),
  tags_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════════════════════

-- Active projects view
CREATE VIEW IF NOT EXISTS v_active_projects AS
SELECT 
  p.*,
  d.idea_md,
  d.tech_stack_json,
  d.definition_of_done_md,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'completed') as completed_tasks,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks
FROM projects p
LEFT JOIN project_dna d ON p.id = d.project_id
WHERE p.status NOT IN ('completed', 'failed')
ORDER BY p.priority DESC, p.created_at ASC;

-- Recent verdicts view
CREATE VIEW IF NOT EXISTS v_recent_verdicts AS
SELECT 
  v.*,
  t.description as task_description,
  p.name as project_name
FROM sentinel_verdicts v
JOIN tasks t ON v.task_id = t.id
JOIN projects p ON t.project_id = p.id
ORDER BY v.created_at DESC
LIMIT 100;

-- Queue statistics view
CREATE VIEW IF NOT EXISTS v_queue_stats AS
SELECT
  COUNT(*) as total_projects,
  SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued,
  SUM(CASE WHEN status IN ('loading', 'planning', 'building', 'verifying') THEN 1 ELSE 0 END) as in_progress,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  SUM(CASE WHEN status = 'cooldown' THEN 1 ELSE 0 END) as in_cooldown,
  AVG(CASE WHEN completed_at IS NOT NULL THEN completed_at - started_at END) as avg_completion_time
FROM projects;
