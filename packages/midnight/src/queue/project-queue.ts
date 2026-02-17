/**
 * Project Midnight - SQLite-backed Project Queue
 */

import type Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  QueuedProject,
  ProjectDNA,
  MidnightTask,
  ProjectStatus,
  TaskResult,
} from '../types.js';
import type { QueueOperations, QueueStats } from './queue-types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class ProjectQueue implements QueueOperations {
  private db: Database.Database;
  private initialized = false;

  constructor(dbPath: string) {
    // Dynamic import for better-sqlite3 (native module)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require('better-sqlite3');
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  /**
   * Initialize database schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    this.db.exec(schema);
    this.initialized = true;
  }

  /**
   * Add a project to the queue
   */
  async addProject(localPath: string, priority = 0): Promise<QueuedProject> {
    const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const name = localPath.split(/[/\\]/).pop() || 'Unknown';

    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, local_path, priority, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, name, localPath, priority, Date.now());

    return this.getProject(id) as Promise<QueuedProject>;
  }

  /**
   * Remove a project from the queue
   */
  async removeProject(projectId: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM projects WHERE id = ?');
    const result = stmt.run(projectId);
    return result.changes > 0;
  }

  /**
   * Get a project by ID
   */
  async getProject(projectId: string): Promise<QueuedProject | null> {
    const stmt = this.db.prepare(`
      SELECT p.*, d.idea_md, d.tech_stack_json, d.definition_of_done_md
      FROM projects p
      LEFT JOIN project_dna d ON p.id = d.project_id
      WHERE p.id = ?
    `);

    const row = stmt.get(projectId) as Record<string, unknown> | undefined;
    if (!row) return null;

    return this.rowToProject(row);
  }

  /**
   * Get the next project to process
   */
  async getNextProject(): Promise<QueuedProject | null> {
    const stmt = this.db.prepare(`
      SELECT p.*, d.idea_md, d.tech_stack_json, d.definition_of_done_md
      FROM projects p
      LEFT JOIN project_dna d ON p.id = d.project_id
      WHERE p.status = 'queued'
      ORDER BY p.priority DESC, p.created_at ASC
      LIMIT 1
    `);

    const row = stmt.get() as Record<string, unknown> | undefined;
    if (!row) return null;

    return this.rowToProject(row);
  }

  /**
   * Update project status
   */
  async updateProjectStatus(projectId: string, status: ProjectStatus): Promise<void> {
    const updates: Record<string, unknown> = { status };

    if (status === 'building' || status === 'loading') {
      updates.started_at = Date.now();
    } else if (status === 'completed' || status === 'failed') {
      updates.completed_at = Date.now();
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const stmt = this.db.prepare(`UPDATE projects SET ${setClauses} WHERE id = ?`);
    stmt.run(...Object.values(updates), projectId);
  }

  /**
   * List all projects
   */
  async listProjects(): Promise<QueuedProject[]> {
    const stmt = this.db.prepare(`
      SELECT p.*, d.idea_md, d.tech_stack_json, d.definition_of_done_md
      FROM projects p
      LEFT JOIN project_dna d ON p.id = d.project_id
      ORDER BY p.priority DESC, p.created_at ASC
    `);

    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map(row => this.rowToProject(row));
  }

  /**
   * Reorder a project's priority
   */
  async reorderProject(projectId: string, newPriority: number): Promise<void> {
    const stmt = this.db.prepare('UPDATE projects SET priority = ? WHERE id = ?');
    stmt.run(newPriority, projectId);
  }

  /**
   * Clear all queued projects
   */
  async clearQueue(): Promise<void> {
    const stmt = this.db.prepare("DELETE FROM projects WHERE status = 'queued'");
    stmt.run();
  }

  /**
   * Add a task
   */
  async addTask(task: Omit<MidnightTask, 'id' | 'createdAt'>): Promise<MidnightTask> {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const createdAt = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO tasks (id, project_id, description, status, assigned_agent, priority, dependencies, created_at, retry_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      task.projectId,
      task.description,
      task.status,
      task.assignedAgent,
      task.priority,
      JSON.stringify(task.dependencies),
      createdAt,
      task.retryCount
    );

    return { ...task, id, createdAt };
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId: string): Promise<MidnightTask | null> {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(taskId) as Record<string, unknown> | undefined;
    if (!row) return null;

    return this.rowToTask(row);
  }

  /**
   * Get all tasks for a project
   */
  async getProjectTasks(projectId: string): Promise<MidnightTask[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks WHERE project_id = ?
      ORDER BY priority DESC, created_at ASC
    `);

    const rows = stmt.all(projectId) as Record<string, unknown>[];
    return rows.map(row => this.rowToTask(row));
  }

  /**
   * Update a task
   */
  async updateTask(taskId: string, updates: Partial<MidnightTask>): Promise<void> {
    const allowedFields = [
      'status', 'assigned_agent', 'priority', 'worktree_path',
      'started_at', 'completed_at', 'result_json', 'retry_count'
    ];

    const fieldMap: Record<string, string> = {
      assignedAgent: 'assigned_agent',
      worktreePath: 'worktree_path',
      startedAt: 'started_at',
      completedAt: 'completed_at',
      retryCount: 'retry_count',
    };

    const setEntries: [string, unknown][] = [];
    for (const [key, value] of Object.entries(updates)) {
      const dbField = fieldMap[key] || key;
      if (allowedFields.includes(dbField)) {
        if (key === 'result') {
          setEntries.push(['result_json', JSON.stringify(value)]);
        } else {
          setEntries.push([dbField, value]);
        }
      }
    }

    if (setEntries.length === 0) return;

    const setClauses = setEntries.map(([k]) => `${k} = ?`).join(', ');
    const stmt = this.db.prepare(`UPDATE tasks SET ${setClauses} WHERE id = ?`);
    stmt.run(...setEntries.map(([, v]) => v), taskId);
  }

  /**
   * Store project DNA
   */
  async storeDNA(projectId: string, dna: ProjectDNA): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO project_dna (project_id, idea_md, tech_stack_json, definition_of_done_md)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      projectId,
      dna.ideaMd,
      JSON.stringify(dna.techStackJson),
      dna.definitionOfDoneMd
    );
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    const stmt = this.db.prepare('SELECT * FROM v_queue_stats');
    const row = stmt.get() as Record<string, unknown>;

    return {
      totalProjects: (row.total_projects as number) || 0,
      pendingProjects: (row.queued as number) || 0,
      completedProjects: (row.completed as number) || 0,
      failedProjects: (row.failed as number) || 0,
      averageCompletionTime: (row.avg_completion_time as number) || 0,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  // ─── Private helpers ───

  private rowToProject(row: Record<string, unknown>): QueuedProject {
    const project: QueuedProject = {
      id: row.id as string,
      name: row.name as string,
      repoUrl: row.repo_url as string | undefined,
      localPath: row.local_path as string,
      status: row.status as ProjectStatus,
      priority: row.priority as number,
      createdAt: row.created_at as number,
      startedAt: row.started_at as number | undefined,
      completedAt: row.completed_at as number | undefined,
      currentTaskId: row.current_task_id as string | undefined,
      gitHash: row.git_hash as string | undefined,
      errorMessage: row.error_message as string | undefined,
    };

    if (row.idea_md) {
      project.dna = {
        ideaMd: row.idea_md as string,
        techStackJson: JSON.parse(row.tech_stack_json as string),
        definitionOfDoneMd: row.definition_of_done_md as string,
      };
    }

    return project;
  }

  private rowToTask(row: Record<string, unknown>): MidnightTask {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      description: row.description as string,
      status: row.status as MidnightTask['status'],
      assignedAgent: row.assigned_agent as 'actor' | 'sentinel',
      priority: row.priority as number,
      dependencies: JSON.parse((row.dependencies as string) || '[]'),
      worktreePath: row.worktree_path as string | undefined,
      createdAt: row.created_at as number,
      startedAt: row.started_at as number | undefined,
      completedAt: row.completed_at as number | undefined,
      result: row.result_json ? JSON.parse(row.result_json as string) as TaskResult : undefined,
      retryCount: row.retry_count as number,
    };
  }
}

/**
 * Create a new project queue instance
 */
export function createProjectQueue(dbPath: string): ProjectQueue {
  return new ProjectQueue(dbPath);
}
