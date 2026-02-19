/**
 * Titan AI - SQLite Database Client
 * Uses better-sqlite3 for synchronous, fast local persistence.
 * Database stored at .titan/titan-web.db
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

// Resolve DB path — works on Railway and local
const DB_DIR = process.env.TITAN_DIR
  ? path.resolve(process.env.TITAN_DIR)
  : path.resolve(process.cwd(), '.titan');

const DB_PATH = path.join(DB_DIR, 'titan-web.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  // Ensure directory exists
  fs.mkdirSync(DB_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('synchronous = NORMAL');

  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
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

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      github_token TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON workspaces(user_id);
  `);
}

/* ─── User Operations ─── */

export interface DbUser {
  id: string;
  github_id: number;
  username: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  profile_url: string | null;
  created_at: string;
  updated_at: string;
}

export function upsertUser(data: {
  githubId: number;
  username: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  profileUrl?: string | null;
}): DbUser {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM users WHERE github_id = ?').get(data.githubId) as DbUser | undefined;

  if (existing) {
    db.prepare(`
      UPDATE users SET username=?, name=?, email=?, avatar_url=?, profile_url=?, updated_at=CURRENT_TIMESTAMP
      WHERE github_id=?
    `).run(data.username, data.name ?? null, data.email ?? null, data.avatarUrl ?? null, data.profileUrl ?? null, data.githubId);
    return db.prepare('SELECT * FROM users WHERE github_id = ?').get(data.githubId) as DbUser;
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO users (id, github_id, username, name, email, avatar_url, profile_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.githubId, data.username, data.name ?? null, data.email ?? null, data.avatarUrl ?? null, data.profileUrl ?? null);

  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as DbUser;
}

export function getUserById(id: string): DbUser | null {
  return (getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as DbUser) ?? null;
}

export function getUserByGithubId(githubId: number): DbUser | null {
  return (getDb().prepare('SELECT * FROM users WHERE github_id = ?').get(githubId) as DbUser) ?? null;
}

/* ─── Session Operations ─── */

export interface DbSession {
  id: string;
  user_id: string;
  github_token: string;
  expires_at: string;
  created_at: string;
}

export function createSession(userId: string, githubToken: string, expiresAt: Date): DbSession {
  const db = getDb();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO sessions (id, user_id, github_token, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, githubToken, expiresAt.toISOString());
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as DbSession;
}

export function getSession(id: string): DbSession | null {
  return (getDb().prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > CURRENT_TIMESTAMP').get(id) as DbSession) ?? null;
}

export function deleteSession(id: string): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function deleteExpiredSessions(): void {
  getDb().prepare('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP').run();
}

export function getSessionWithUser(sessionId: string): (DbSession & { user: DbUser }) | null {
  const row = getDb().prepare(`
    SELECT s.*, u.id as u_id, u.github_id, u.username, u.name, u.email, u.avatar_url, u.profile_url, u.created_at as u_created
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP
  `).get(sessionId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: row.id as string,
    user_id: row.user_id as string,
    github_token: row.github_token as string,
    expires_at: row.expires_at as string,
    created_at: row.created_at as string,
    user: {
      id: row.u_id as string,
      github_id: row.github_id as number,
      username: row.username as string,
      name: row.name as string | null,
      email: row.email as string | null,
      avatar_url: row.avatar_url as string | null,
      profile_url: row.profile_url as string | null,
      created_at: row.u_created as string,
      updated_at: row.u_created as string,
    },
  };
}

/* ─── Workspace Operations ─── */

export interface DbWorkspace {
  id: string;
  user_id: string;
  name: string;
  path: string | null;
  repo_url: string | null;
  repo_owner: string | null;
  repo_name: string | null;
  default_branch: string;
  last_opened: string;
  created_at: string;
}

export function upsertWorkspace(data: {
  userId: string;
  name: string;
  path?: string;
  repoUrl?: string;
  repoOwner?: string;
  repoName?: string;
  defaultBranch?: string;
}): DbWorkspace {
  const db = getDb();
  const existing = db.prepare(
    'SELECT * FROM workspaces WHERE user_id = ? AND (path = ? OR repo_url = ?)'
  ).get(data.userId, data.path ?? null, data.repoUrl ?? null) as DbWorkspace | undefined;

  if (existing) {
    db.prepare(`
      UPDATE workspaces SET name=?, path=?, repo_url=?, repo_owner=?, repo_name=?, default_branch=?, last_opened=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(data.name, data.path ?? null, data.repoUrl ?? null, data.repoOwner ?? null, data.repoName ?? null, data.defaultBranch ?? 'main', existing.id);
    return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(existing.id) as DbWorkspace;
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO workspaces (id, user_id, name, path, repo_url, repo_owner, repo_name, default_branch)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.userId, data.name, data.path ?? null, data.repoUrl ?? null, data.repoOwner ?? null, data.repoName ?? null, data.defaultBranch ?? 'main');

  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as DbWorkspace;
}

export function getUserWorkspaces(userId: string): DbWorkspace[] {
  return getDb().prepare('SELECT * FROM workspaces WHERE user_id = ? ORDER BY last_opened DESC').all(userId) as DbWorkspace[];
}

export function deleteWorkspace(id: string, userId: string): void {
  getDb().prepare('DELETE FROM workspaces WHERE id = ? AND user_id = ?').run(id, userId);
}
