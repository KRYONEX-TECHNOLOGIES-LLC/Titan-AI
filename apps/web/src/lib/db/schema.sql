-- Titan AI Web Database Schema
-- Users authenticated via GitHub OAuth

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  github_id INTEGER UNIQUE NOT NULL,
  username TEXT NOT NULL,
  name TEXT,
  email TEXT,
  avatar_url TEXT,
  profile_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User sessions (NextAuth compatible)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_token TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Workspaces opened by each user
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT,
  repo_url TEXT,
  repo_owner TEXT,
  repo_name TEXT,
  default_branch TEXT DEFAULT 'main',
  last_opened DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Persistent AI memory (architectural decisions, project context, user preferences)
CREATE TABLE IF NOT EXISTS titan_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'decision',
  decision TEXT NOT NULL,
  rationale TEXT,
  task_id TEXT,
  status TEXT DEFAULT 'ACTIVE',
  references TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_last_opened ON workspaces(last_opened DESC);
CREATE INDEX IF NOT EXISTS idx_titan_memory_user_id ON titan_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_titan_memory_workspace_id ON titan_memory(workspace_id);
CREATE INDEX IF NOT EXISTS idx_titan_memory_category ON titan_memory(category);
