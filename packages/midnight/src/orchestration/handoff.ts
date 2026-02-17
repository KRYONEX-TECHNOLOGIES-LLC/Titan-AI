/**
 * Project Midnight - Project Handoff
 * Handles completion and transition to next project
 */

import type { QueuedProject, MidnightEvent } from '../types.js';
import type { ProjectQueue } from '../queue/project-queue.js';
import type { DurableStateEngine } from '../state/state-engine.js';

export interface HandoffConfig {
  pushToRemote: boolean;
  triggerDeployment: boolean;
  cleanupWorktrees: boolean;
  notifyWebhook?: string;
}

export interface DeploymentTrigger {
  trigger(projectPath: string, branch: string): Promise<boolean>;
}

export interface GitOperations {
  push(projectPath: string, remote: string, branch: string): Promise<void>;
  getCurrentBranch(projectPath: string): Promise<string>;
  createTag(projectPath: string, tag: string, message: string): Promise<void>;
  cleanWorktrees(projectPath: string): Promise<void>;
}

type EventCallback = (event: MidnightEvent) => void;

export class ProjectHandoff {
  private config: HandoffConfig;
  private projectQueue: ProjectQueue;
  private stateEngine: DurableStateEngine;
  private gitOps: GitOperations;
  private deploymentTrigger?: DeploymentTrigger;
  private eventListeners: Set<EventCallback> = new Set();

  constructor(
    config: HandoffConfig,
    projectQueue: ProjectQueue,
    stateEngine: DurableStateEngine,
    gitOps: GitOperations,
    deploymentTrigger?: DeploymentTrigger
  ) {
    this.config = config;
    this.projectQueue = projectQueue;
    this.stateEngine = stateEngine;
    this.gitOps = gitOps;
    this.deploymentTrigger = deploymentTrigger;
  }

  /**
   * Execute handoff from completed project to next project
   */
  async execute(
    completedProject: QueuedProject,
    nextProject: QueuedProject
  ): Promise<void> {
    this.log('info', `Handing off from ${completedProject.name} to ${nextProject.name}`);

    try {
      // Step 1: Finalize completed project
      await this.finalizeProject(completedProject);

      // Step 2: Push to remote if enabled
      if (this.config.pushToRemote) {
        await this.pushProject(completedProject);
      }

      // Step 3: Trigger deployment if enabled
      if (this.config.triggerDeployment && this.deploymentTrigger) {
        await this.triggerDeployment(completedProject);
      }

      // Step 4: Cleanup worktrees if enabled
      if (this.config.cleanupWorktrees) {
        await this.cleanupWorktrees(completedProject);
      }

      // Step 5: Send webhook notification if configured
      if (this.config.notifyWebhook) {
        await this.sendNotification(completedProject, nextProject);
      }

      // Step 6: Initialize next project
      await this.initializeNextProject(nextProject);

      this.emit({
        type: 'handoff_triggered',
        fromProject: completedProject.id,
        toProject: nextProject.id,
      });

      this.log('info', `Handoff complete: ${completedProject.name} -> ${nextProject.name}`);
    } catch (error) {
      this.log('error', `Handoff failed: ${error}`);
      throw error;
    }
  }

  /**
   * Finalize a completed project
   */
  private async finalizeProject(project: QueuedProject): Promise<void> {
    // Create completion tag
    const timestamp = new Date().toISOString().split('T')[0];
    const tag = `midnight-complete-${timestamp}`;

    try {
      await this.gitOps.createTag(
        project.localPath,
        tag,
        `Project Midnight completion: ${project.name}`
      );
    } catch {
      // Tag creation is optional
      this.log('warn', `Could not create completion tag: ${tag}`);
    }

    // Update project status
    await this.projectQueue.updateProjectStatus(project.id, 'completed');

    // Final snapshot
    await this.stateEngine.saveSnapshot(project.id);
  }

  /**
   * Push project to remote
   */
  private async pushProject(project: QueuedProject): Promise<void> {
    try {
      const branch = await this.gitOps.getCurrentBranch(project.localPath);
      await this.gitOps.push(project.localPath, 'origin', branch);
      this.log('info', `Pushed ${project.name} to origin/${branch}`);
    } catch (error) {
      this.log('error', `Failed to push ${project.name}: ${error}`);
      throw error;
    }
  }

  /**
   * Trigger deployment
   */
  private async triggerDeployment(project: QueuedProject): Promise<void> {
    if (!this.deploymentTrigger) return;

    try {
      const branch = await this.gitOps.getCurrentBranch(project.localPath);
      const success = await this.deploymentTrigger.trigger(project.localPath, branch);
      
      if (success) {
        this.log('info', `Deployment triggered for ${project.name}`);
      } else {
        this.log('warn', `Deployment trigger returned false for ${project.name}`);
      }
    } catch (error) {
      this.log('error', `Deployment trigger failed: ${error}`);
      // Don't throw - deployment failure shouldn't block handoff
    }
  }

  /**
   * Cleanup worktrees
   */
  private async cleanupWorktrees(project: QueuedProject): Promise<void> {
    try {
      await this.gitOps.cleanWorktrees(project.localPath);
      this.log('info', `Cleaned up worktrees for ${project.name}`);
    } catch (error) {
      this.log('warn', `Worktree cleanup failed: ${error}`);
      // Don't throw - cleanup failure shouldn't block handoff
    }
  }

  /**
   * Send webhook notification
   */
  private async sendNotification(
    completed: QueuedProject,
    next: QueuedProject
  ): Promise<void> {
    if (!this.config.notifyWebhook) return;

    const payload = {
      type: 'project_handoff',
      timestamp: Date.now(),
      completed: {
        id: completed.id,
        name: completed.name,
        path: completed.localPath,
      },
      next: {
        id: next.id,
        name: next.name,
        path: next.localPath,
      },
    };

    try {
      await fetch(this.config.notifyWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      this.log('info', `Webhook notification sent`);
    } catch (error) {
      this.log('warn', `Webhook notification failed: ${error}`);
      // Don't throw - notification failure shouldn't block handoff
    }
  }

  /**
   * Initialize next project
   */
  private async initializeNextProject(project: QueuedProject): Promise<void> {
    // Just update status - the orchestrator will pick it up
    await this.projectQueue.updateProjectStatus(project.id, 'queued');
    
    // Bump priority so it's processed next
    await this.projectQueue.reorderProject(project.id, 1000);
  }

  /**
   * Subscribe to handoff events
   */
  on(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  /**
   * Log helper
   */
  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string
  ): void {
    this.stateEngine.log(level, 'handoff', message);
  }

  /**
   * Emit event
   */
  private emit(event: MidnightEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore
      }
    }
  }
}

/**
 * Create a new project handoff handler
 */
export function createProjectHandoff(
  config: HandoffConfig,
  projectQueue: ProjectQueue,
  stateEngine: DurableStateEngine,
  gitOps: GitOperations,
  deploymentTrigger?: DeploymentTrigger
): ProjectHandoff {
  return new ProjectHandoff(config, projectQueue, stateEngine, gitOps, deploymentTrigger);
}

/**
 * Default handoff configuration
 */
export const DEFAULT_HANDOFF_CONFIG: HandoffConfig = {
  pushToRemote: true,
  triggerDeployment: false,
  cleanupWorktrees: true,
};
