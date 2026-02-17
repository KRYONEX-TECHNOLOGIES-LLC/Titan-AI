/**
 * Project Midnight - Snapshot Manager
 * High-level snapshot operations and recovery
 */

import type { StateSnapshot, AgentStateSnapshot } from '../types.js';
import type { DurableStateEngine } from './state-engine.js';

export interface SnapshotComparison {
  added: string[];
  removed: string[];
  modified: string[];
  gitDiff: string;
}

export class SnapshotManager {
  constructor(private stateEngine: DurableStateEngine) {}

  /**
   * Create a snapshot with a label
   */
  async createLabeledSnapshot(
    projectId: string,
    _label: string
  ): Promise<StateSnapshot> {
    const snapshotId = await this.stateEngine.saveSnapshot(projectId);
    const snapshot = await this.stateEngine.loadSnapshot(snapshotId);
    
    if (!snapshot) {
      throw new Error('Failed to create snapshot');
    }

    return snapshot;
  }

  /**
   * List snapshots with pagination
   */
  async listSnapshots(
    projectId: string,
    limit = 10,
    offset = 0
  ): Promise<{ snapshots: StateSnapshot[]; total: number }> {
    const all = await this.stateEngine.listSnapshots(projectId);
    
    return {
      snapshots: all.slice(offset, offset + limit),
      total: all.length,
    };
  }

  /**
   * Get snapshot details
   */
  async getSnapshot(snapshotId: string): Promise<StateSnapshot | null> {
    return this.stateEngine.loadSnapshot(snapshotId);
  }

  /**
   * Compare two snapshots
   */
  async compareSnapshots(
    snapshotIdA: string,
    snapshotIdB: string
  ): Promise<SnapshotComparison> {
    const [snapA, snapB] = await Promise.all([
      this.stateEngine.loadSnapshot(snapshotIdA),
      this.stateEngine.loadSnapshot(snapshotIdB),
    ]);

    if (!snapA || !snapB) {
      throw new Error('One or both snapshots not found');
    }

    // Compare agent states
    const stateA = snapA.agentState;
    const stateB = snapB.agentState;

    const added: string[] = [];
    const removed: string[] = [];
    const modified: string[] = [];

    // Compare task progress
    if (stateA.currentTaskId !== stateB.currentTaskId) {
      modified.push(`Current task changed: ${stateA.currentTaskId} -> ${stateB.currentTaskId}`);
    }

    if (stateA.taskProgress !== stateB.taskProgress) {
      modified.push(`Task progress: ${stateA.taskProgress}% -> ${stateB.taskProgress}%`);
    }

    if (stateA.iterationCount !== stateB.iterationCount) {
      modified.push(`Iteration count: ${stateA.iterationCount} -> ${stateB.iterationCount}`);
    }

    // Compare messages
    const messagesA = stateA.actorMemory.messages.length;
    const messagesB = stateB.actorMemory.messages.length;
    if (messagesA !== messagesB) {
      if (messagesB > messagesA) {
        added.push(`${messagesB - messagesA} new messages`);
      } else {
        removed.push(`${messagesA - messagesB} messages removed`);
      }
    }

    // Compare sentinel state
    if (stateA.sentinelState.verificationCount !== stateB.sentinelState.verificationCount) {
      modified.push(`Verification count: ${stateA.sentinelState.verificationCount} -> ${stateB.sentinelState.verificationCount}`);
    }

    if (stateA.sentinelState.vetoCount !== stateB.sentinelState.vetoCount) {
      modified.push(`Veto count: ${stateA.sentinelState.vetoCount} -> ${stateB.sentinelState.vetoCount}`);
    }

    return {
      added,
      removed,
      modified,
      gitDiff: `${snapA.gitHash}...${snapB.gitHash}`,
    };
  }

  /**
   * Find the best snapshot for recovery
   * (Last successful state before a failure)
   */
  async findRecoveryPoint(projectId: string): Promise<StateSnapshot | null> {
    const snapshots = await this.stateEngine.listSnapshots(projectId);

    // Find the most recent snapshot where the sentinel wasn't vetoing
    for (const snapshot of snapshots) {
      const state = snapshot.agentState;
      
      // Good recovery point: no recent vetoes, reasonable quality score
      if (
        state.sentinelState.vetoCount === 0 ||
        state.sentinelState.averageQualityScore >= 85
      ) {
        return snapshot;
      }
    }

    // Fall back to most recent snapshot
    return snapshots[0] || null;
  }

  /**
   * Calculate snapshot size in bytes (for storage management)
   */
  calculateSnapshotSize(snapshot: StateSnapshot): number {
    return Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
  }

  /**
   * Export snapshot to JSON
   */
  exportSnapshot(snapshot: StateSnapshot): string {
    return JSON.stringify(snapshot, null, 2);
  }

  /**
   * Import snapshot from JSON
   */
  parseSnapshot(json: string): StateSnapshot {
    const parsed = JSON.parse(json);
    
    // Validate required fields
    if (!parsed.id || !parsed.projectId || !parsed.gitHash || !parsed.agentState) {
      throw new Error('Invalid snapshot format');
    }

    return parsed as StateSnapshot;
  }

  /**
   * Get agent state diff between current and snapshot
   */
  getStateDiff(
    current: AgentStateSnapshot,
    previous: AgentStateSnapshot
  ): Record<string, unknown> {
    const diff: Record<string, unknown> = {};

    // Compare top-level fields
    const fields: (keyof AgentStateSnapshot)[] = [
      'currentTaskId',
      'taskProgress',
      'iterationCount',
    ];

    for (const field of fields) {
      if (current[field] !== previous[field]) {
        diff[field] = {
          from: previous[field],
          to: current[field],
        };
      }
    }

    // Compare message counts
    const currentMsgCount = current.actorMemory.messages.length;
    const previousMsgCount = previous.actorMemory.messages.length;
    if (currentMsgCount !== previousMsgCount) {
      diff.messageCount = {
        from: previousMsgCount,
        to: currentMsgCount,
      };
    }

    // Compare sentinel stats
    const sentinelDiff: Record<string, unknown> = {};
    if (current.sentinelState.verificationCount !== previous.sentinelState.verificationCount) {
      sentinelDiff.verificationCount = {
        from: previous.sentinelState.verificationCount,
        to: current.sentinelState.verificationCount,
      };
    }
    if (current.sentinelState.vetoCount !== previous.sentinelState.vetoCount) {
      sentinelDiff.vetoCount = {
        from: previous.sentinelState.vetoCount,
        to: current.sentinelState.vetoCount,
      };
    }
    if (Object.keys(sentinelDiff).length > 0) {
      diff.sentinelState = sentinelDiff;
    }

    return diff;
  }
}

/**
 * Create a new snapshot manager
 */
export function createSnapshotManager(stateEngine: DurableStateEngine): SnapshotManager {
  return new SnapshotManager(stateEngine);
}
