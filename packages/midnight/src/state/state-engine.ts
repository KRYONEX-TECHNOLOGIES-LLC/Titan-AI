/**
 * Project Midnight - Durable State Engine
 * Handles state persistence, snapshots, and recovery
 */

import type Database from 'better-sqlite3';
import type {
  StateSnapshot,
  AgentStateSnapshot,
  Cooldown,
  MidnightEvent,
} from '../types.js';

type EventCallback = (event: MidnightEvent) => void;

export class DurableStateEngine {
  private db: Database.Database;
  private snapshotInterval: NodeJS.Timeout | null = null;
  private eventListeners: Set<EventCallback> = new Set();
  private autoSnapshotEnabled = false;
  private currentProjectId: string | null = null;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Start automatic snapshots every N milliseconds
   */
  startAutoSnapshot(projectId: string, intervalMs = 5 * 60 * 1000): void {
    this.stopAutoSnapshot();
    this.currentProjectId = projectId;
    this.autoSnapshotEnabled = true;

    this.snapshotInterval = setInterval(async () => {
      if (this.currentProjectId) {
        await this.saveSnapshot(this.currentProjectId);
      }
    }, intervalMs);

    // Take initial snapshot
    this.saveSnapshot(projectId);
  }

  /**
   * Stop automatic snapshots
   */
  stopAutoSnapshot(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
    this.autoSnapshotEnabled = false;
  }

  /**
   * Save a state snapshot
   */
  async saveSnapshot(projectId: string): Promise<string> {
    // Get current git hash
    const gitHash = await this.getCurrentGitHash(projectId);

    // Get current agent state
    const agentState = await this.captureAgentState(projectId);

    // Generate snapshot ID
    const id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const stmt = this.db.prepare(`
      INSERT INTO state_snapshots (id, project_id, git_hash, agent_state_json, reasoning_trace, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      projectId,
      gitHash,
      JSON.stringify(agentState),
      JSON.stringify(agentState.reasoningTrace || []),
      Date.now()
    );

    // Emit event
    this.emit({
      type: 'snapshot_created',
      snapshot: {
        id,
        projectId,
        gitHash,
        agentState,
        reasoningTrace: agentState.reasoningTrace || [],
        createdAt: Date.now(),
      },
    });

    // Cleanup old snapshots (keep last 20)
    await this.cleanupOldSnapshots(projectId, 20);

    return id;
  }

  /**
   * Load the latest snapshot for a project
   */
  async loadLatestSnapshot(projectId: string): Promise<StateSnapshot | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM state_snapshots
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const row = stmt.get(projectId) as Record<string, unknown> | undefined;
    if (!row) return null;

    return this.rowToSnapshot(row);
  }

  /**
   * Load a specific snapshot by ID
   */
  async loadSnapshot(snapshotId: string): Promise<StateSnapshot | null> {
    const stmt = this.db.prepare('SELECT * FROM state_snapshots WHERE id = ?');
    const row = stmt.get(snapshotId) as Record<string, unknown> | undefined;
    if (!row) return null;

    return this.rowToSnapshot(row);
  }

  /**
   * List all snapshots for a project
   */
  async listSnapshots(projectId: string): Promise<StateSnapshot[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM state_snapshots
      WHERE project_id = ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(projectId) as Record<string, unknown>[];
    return rows.map(row => this.rowToSnapshot(row));
  }

  /**
   * Enter cooldown mode (API rate limit hit)
   */
  async enterCooldown(provider: string, resumeAt: number, reason: string): Promise<void> {
    const id = `cool-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Save current state before cooldown
    let snapshotId: string | null = null;
    if (this.currentProjectId) {
      snapshotId = await this.saveSnapshot(this.currentProjectId);
    }

    const stmt = this.db.prepare(`
      INSERT INTO cooldowns (id, provider, started_at, resume_at, snapshot_id, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, provider, Date.now(), resumeAt, snapshotId, reason);

    const cooldown: Cooldown = {
      id,
      provider,
      startedAt: Date.now(),
      resumeAt,
      snapshotId: snapshotId || '',
      reason,
    };

    this.emit({ type: 'cooldown_entered', cooldown });
  }

  /**
   * Check for active cooldowns
   */
  async checkCooldowns(): Promise<Cooldown[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM cooldowns
      WHERE resume_at > ?
      ORDER BY resume_at ASC
    `);

    const rows = stmt.all(Date.now()) as Record<string, unknown>[];
    return rows.map(row => ({
      id: row.id as string,
      provider: row.provider as string,
      startedAt: row.started_at as number,
      resumeAt: row.resume_at as number,
      snapshotId: row.snapshot_id as string,
      reason: row.reason as string,
    }));
  }

  /**
   * Exit cooldown (resume operations)
   */
  async exitCooldown(cooldownId: string): Promise<void> {
    const stmt = this.db.prepare('SELECT * FROM cooldowns WHERE id = ?');
    const row = stmt.get(cooldownId) as Record<string, unknown> | undefined;

    if (row) {
      const cooldown: Cooldown = {
        id: row.id as string,
        provider: row.provider as string,
        startedAt: row.started_at as number,
        resumeAt: row.resume_at as number,
        snapshotId: row.snapshot_id as string,
        reason: row.reason as string,
      };

      // Delete the cooldown record
      this.db.prepare('DELETE FROM cooldowns WHERE id = ?').run(cooldownId);

      this.emit({ type: 'cooldown_exited', cooldown });
    }
  }

  /**
   * Check for expired cooldowns and exit them
   */
  async processExpiredCooldowns(): Promise<void> {
    const stmt = this.db.prepare(`
      SELECT * FROM cooldowns
      WHERE resume_at <= ?
    `);

    const rows = stmt.all(Date.now()) as Record<string, unknown>[];

    for (const row of rows) {
      await this.exitCooldown(row.id as string);
    }
  }

  /**
   * Subscribe to state engine events
   */
  on(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  /**
   * Log execution event
   */
  log(
    level: 'debug' | 'info' | 'warn' | 'error',
    source: string,
    message: string,
    context?: Record<string, unknown>,
    projectId?: string,
    taskId?: string
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO execution_log (timestamp, level, source, message, context_json, project_id, task_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      Date.now(),
      level,
      source,
      message,
      context ? JSON.stringify(context) : null,
      projectId || null,
      taskId || null
    );
  }

  /**
   * Record a metric
   */
  recordMetric(
    name: string,
    value: number,
    projectId?: string,
    tags?: Record<string, string>
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO metrics (timestamp, metric_name, metric_value, project_id, tags_json)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      Date.now(),
      name,
      value,
      projectId || null,
      tags ? JSON.stringify(tags) : null
    );
  }

  // ─── Private helpers ───

  private async getCurrentGitHash(_projectId: string): Promise<string> {
    // In production, this would use simple-git to get the current commit hash
    // For now, return a placeholder
    return `hash-${Date.now().toString(36)}`;
  }

  private async captureAgentState(_projectId: string): Promise<AgentStateSnapshot & { reasoningTrace?: string[] }> {
    // In production, this would capture the actual agent state
    // For now, return a placeholder
    return {
      actorMemory: {
        messages: [],
        context: {},
        shortTermBuffer: [],
      },
      sentinelState: {
        lastVerdict: null,
        verificationCount: 0,
        vetoCount: 0,
        averageQualityScore: 100,
      },
      currentTaskId: '',
      taskProgress: 0,
      iterationCount: 0,
      reasoningTrace: [],
    };
  }

  private async cleanupOldSnapshots(projectId: string, keepCount: number): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM state_snapshots
      WHERE project_id = ? AND id NOT IN (
        SELECT id FROM state_snapshots
        WHERE project_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      )
    `);

    stmt.run(projectId, projectId, keepCount);
  }

  private rowToSnapshot(row: Record<string, unknown>): StateSnapshot {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      gitHash: row.git_hash as string,
      agentState: JSON.parse(row.agent_state_json as string),
      reasoningTrace: JSON.parse((row.reasoning_trace as string) || '[]'),
      createdAt: row.created_at as number,
    };
  }

  private emit(event: MidnightEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }
}

/**
 * Create a new durable state engine
 */
export function createStateEngine(db: Database.Database): DurableStateEngine {
  return new DurableStateEngine(db);
}
