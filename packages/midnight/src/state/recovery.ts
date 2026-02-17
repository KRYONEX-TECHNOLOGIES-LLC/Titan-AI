/**
 * Project Midnight - Recovery System
 * Handles crash recovery and state restoration
 */

import type { StateSnapshot, QueuedProject, MidnightTask } from '../types.js';
import type { DurableStateEngine } from './state-engine.js';
import type { SnapshotManager } from './snapshot-manager.js';
import type { ProjectQueue } from '../queue/project-queue.js';

export interface RecoveryResult {
  success: boolean;
  projectId: string;
  snapshotId: string | null;
  restoredTasks: number;
  message: string;
}

export interface RecoveryOptions {
  forceSnapshot?: string;
  skipGitReset?: boolean;
  clearFailedTasks?: boolean;
}

export class RecoverySystem {
  constructor(
    private stateEngine: DurableStateEngine,
    private snapshotManager: SnapshotManager,
    private projectQueue: ProjectQueue
  ) {}

  /**
   * Check if recovery is needed on startup
   */
  async checkNeedsRecovery(): Promise<boolean> {
    // Check for projects that were in progress but not completed
    const projects = await this.projectQueue.listProjects();
    
    const inProgressStatuses = ['loading', 'planning', 'building', 'verifying'];
    const needsRecovery = projects.some(p => 
      inProgressStatuses.includes(p.status)
    );

    return needsRecovery;
  }

  /**
   * Recover from an interrupted session
   */
  async recover(options: RecoveryOptions = {}): Promise<RecoveryResult[]> {
    const results: RecoveryResult[] = [];
    const projects = await this.projectQueue.listProjects();

    const inProgressStatuses = ['loading', 'planning', 'building', 'verifying'];
    const interruptedProjects = projects.filter(p => 
      inProgressStatuses.includes(p.status)
    );

    for (const project of interruptedProjects) {
      const result = await this.recoverProject(project, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Recover a specific project
   */
  async recoverProject(
    project: QueuedProject,
    options: RecoveryOptions = {}
  ): Promise<RecoveryResult> {
    try {
      // Find the best snapshot for recovery
      let snapshot: StateSnapshot | null = null;

      if (options.forceSnapshot) {
        snapshot = await this.snapshotManager.getSnapshot(options.forceSnapshot);
      } else {
        snapshot = await this.snapshotManager.findRecoveryPoint(project.id);
      }

      if (!snapshot) {
        // No snapshot available, restart from beginning
        await this.projectQueue.updateProjectStatus(project.id, 'queued');
        
        return {
          success: true,
          projectId: project.id,
          snapshotId: null,
          restoredTasks: 0,
          message: 'No snapshot found, project reset to queue',
        };
      }

      // Reset git to snapshot state (if not skipped)
      if (!options.skipGitReset) {
        await this.resetGitToSnapshot(project.localPath, snapshot.gitHash);
      }

      // Restore task states
      const restoredTasks = await this.restoreTaskStates(project.id, snapshot, options);

      // Update project status based on snapshot state
      const newStatus = this.determineRecoveryStatus(snapshot);
      await this.projectQueue.updateProjectStatus(project.id, newStatus);

      // Log recovery
      this.stateEngine.log(
        'info',
        'recovery',
        `Recovered project ${project.id} from snapshot ${snapshot.id}`,
        { 
          projectId: project.id, 
          snapshotId: snapshot.id,
          gitHash: snapshot.gitHash,
          restoredTasks,
        }
      );

      return {
        success: true,
        projectId: project.id,
        snapshotId: snapshot.id,
        restoredTasks,
        message: `Recovered from snapshot at ${new Date(snapshot.createdAt).toISOString()}`,
      };
    } catch (error) {
      this.stateEngine.log(
        'error',
        'recovery',
        `Failed to recover project ${project.id}: ${error}`,
        { projectId: project.id, error: String(error) }
      );

      return {
        success: false,
        projectId: project.id,
        snapshotId: null,
        restoredTasks: 0,
        message: `Recovery failed: ${error}`,
      };
    }
  }

  /**
   * Recover from a specific snapshot
   */
  async recoverFromSnapshot(snapshotId: string): Promise<RecoveryResult> {
    const snapshot = await this.snapshotManager.getSnapshot(snapshotId);
    
    if (!snapshot) {
      return {
        success: false,
        projectId: '',
        snapshotId,
        restoredTasks: 0,
        message: 'Snapshot not found',
      };
    }

    const project = await this.projectQueue.getProject(snapshot.projectId);
    
    if (!project) {
      return {
        success: false,
        projectId: snapshot.projectId,
        snapshotId,
        restoredTasks: 0,
        message: 'Project not found',
      };
    }

    return this.recoverProject(project, { forceSnapshot: snapshotId });
  }

  /**
   * Reset git to a specific hash
   */
  private async resetGitToSnapshot(_projectPath: string, gitHash: string): Promise<void> {
    // In production, this would use simple-git to reset:
    // const git = simpleGit(projectPath);
    // await git.reset(['--hard', gitHash]);
    
    // For now, log the action
    this.stateEngine.log(
      'info',
      'recovery',
      `Git reset to ${gitHash}`,
      { gitHash }
    );
  }

  /**
   * Restore task states from snapshot
   */
  private async restoreTaskStates(
    projectId: string,
    snapshot: StateSnapshot,
    options: RecoveryOptions
  ): Promise<number> {
    const tasks = await this.projectQueue.getProjectTasks(projectId);
    let restoredCount = 0;

    for (const task of tasks) {
      // Reset running tasks back to assigned
      if (task.status === 'running' || task.status === 'verifying') {
        await this.projectQueue.updateTask(task.id, {
          status: 'assigned',
          startedAt: undefined,
        });
        restoredCount++;
      }

      // Optionally clear failed tasks
      if (options.clearFailedTasks && task.status === 'failed') {
        await this.projectQueue.updateTask(task.id, {
          status: 'pending',
          retryCount: 0,
          result: undefined,
        });
        restoredCount++;
      }

      // Reset locked tasks if the lock was from a veto
      if (task.status === 'locked') {
        const wasRecentLock = task.completedAt && 
          task.completedAt > snapshot.createdAt;
        
        if (wasRecentLock) {
          await this.projectQueue.updateTask(task.id, {
            status: 'pending',
          });
          restoredCount++;
        }
      }
    }

    return restoredCount;
  }

  /**
   * Determine the appropriate status after recovery
   */
  private determineRecoveryStatus(snapshot: StateSnapshot): QueuedProject['status'] {
    const state = snapshot.agentState;

    // If there was a task in progress, go back to building
    if (state.currentTaskId && state.taskProgress > 0) {
      return 'building';
    }

    // If sentinel was verifying, continue verification
    if (state.sentinelState.lastVerdict) {
      return 'verifying';
    }

    // Default to planning phase
    return 'planning';
  }

  /**
   * Clean up orphaned resources after recovery
   */
  async cleanupOrphans(projectId: string): Promise<void> {
    // Clean up any orphaned worktrees
    const tasks = await this.projectQueue.getProjectTasks(projectId);
    
    for (const task of tasks) {
      if (task.worktreePath && task.status !== 'running') {
        // In production, would delete the worktree directory
        await this.projectQueue.updateTask(task.id, {
          worktreePath: undefined,
        });
      }
    }

    // Process any expired cooldowns
    await this.stateEngine.processExpiredCooldowns();
  }
}

/**
 * Create a new recovery system
 */
export function createRecoverySystem(
  stateEngine: DurableStateEngine,
  snapshotManager: SnapshotManager,
  projectQueue: ProjectQueue
): RecoverySystem {
  return new RecoverySystem(stateEngine, snapshotManager, projectQueue);
}
