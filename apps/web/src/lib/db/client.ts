/**
 * SQLite database client for persistent storage.
 * Uses better-sqlite3 for server-side API routes.
 * Falls back to in-memory mode if disk storage is unavailable.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

function getDbPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
  const titanDir = path.join(homeDir, '.titan-ai');

  try {
    fs.mkdirSync(titanDir, { recursive: true });
  } catch {
    // Fallback to cwd
    return path.join(process.cwd(), '.titan-ai', 'titan.db');
  }

  return path.join(titanDir, 'titan.db');
}

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();

  try {
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
  } catch { /* ignore */ }

  try {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    return db;
  } catch {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    return db;
  }
}

function initSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'claude-4.6-sonnet',
      messages TEXT NOT NULL DEFAULT '[]',
      changed_files TEXT NOT NULL DEFAULT '[]',
      context_window TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS indexing_state (
      file_path TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      symbols TEXT NOT NULL DEFAULT '[]',
      chunks TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS midnight_state (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      queue TEXT NOT NULL DEFAULT '[]',
      current_project TEXT,
      progress TEXT NOT NULL DEFAULT '{}',
      trust_level REAL NOT NULL DEFAULT 0.5,
      confidence REAL NOT NULL DEFAULT 0.0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spec_contracts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      contract TEXT NOT NULL DEFAULT '{}',
      progress TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON chat_sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_indexing_hash ON indexing_state(hash);
  `);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

// ── User management ──

interface UpsertUserParams {
  githubId: number;
  username: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  profileUrl?: string | null;
}

export function upsertUser(params: UpsertUserParams) {
  try {
    const database = getDb();
    database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        github_id INTEGER UNIQUE NOT NULL,
        username TEXT NOT NULL,
        name TEXT,
        email TEXT,
        avatar_url TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
    database.prepare(`
      INSERT INTO users (github_id, username, name, email, avatar_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())
      ON CONFLICT(github_id) DO UPDATE SET
        username = excluded.username,
        name = excluded.name,
        email = excluded.email,
        avatar_url = excluded.avatar_url,
        updated_at = unixepoch()
    `).run(params.githubId, params.username, params.name, params.email, params.avatarUrl);
  } catch (e) {
    console.warn('[db] upsertUser failed (non-blocking):', (e as Error).message);
  }
}

// ── Workspace management ──

interface UpsertWorkspaceParams {
  id?: string;
  userId: string;
  name?: string;
  repoName?: string;
  repoUrl?: string;
  cloneUrl?: string;
  path?: string;
  localPath?: string;
  branch?: string;
  defaultBranch?: string;
  repoOwner?: string;
}

export function upsertWorkspace(params: UpsertWorkspaceParams) {
  const id = params.id || `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const repoName = params.repoName || params.name || 'unknown';
  const cloneUrl = params.cloneUrl || params.repoUrl || '';
  const localPath = params.localPath || params.path || '';
  const branch = params.branch || params.defaultBranch || 'main';

  try {
    const database = getDb();
    database.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        clone_url TEXT NOT NULL,
        local_path TEXT NOT NULL,
        branch TEXT DEFAULT 'main',
        repo_owner TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
    database.prepare(`
      INSERT INTO workspaces (id, user_id, repo_name, clone_url, local_path, branch, repo_owner, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
      ON CONFLICT(id) DO UPDATE SET
        repo_name = excluded.repo_name,
        clone_url = excluded.clone_url,
        local_path = excluded.local_path,
        branch = excluded.branch,
        repo_owner = excluded.repo_owner,
        updated_at = unixepoch()
    `).run(id, params.userId, repoName, cloneUrl, localPath, branch, params.repoOwner || null);

    return { id, ...params };
  } catch (e) {
    console.warn('[db] upsertWorkspace failed:', (e as Error).message);
    return { id, ...params };
  }
}
