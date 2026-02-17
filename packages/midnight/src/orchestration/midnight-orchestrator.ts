/**
 * Project Midnight - Orchestrator
 * Implements Queue -> Research -> Plan -> Build -> Verify -> Handoff flow
 */

import type {
  QueuedProject,
  MidnightTask,
  MidnightConfig,
  MidnightStatus,
  MidnightEvent,
  TrustLevel,
} from '../types.js';
import type { ProjectQueue } from '../queue/project-queue.js';
import type { ProjectLoader } from '../queue/project-loader.js';
import type { DurableStateEngine } from '../state/state-engine.js';
import type { AgentLoop } from '../agents/agent-loop.js';
import type { PocketFlowEngine, FlowState } from './pocket-flow.js';
import type { ProjectHandoff } from './handoff.js';

type EventCallback = (event: MidnightEvent) => void;

export interface MidnightOrchestratorDependencies {
  projectQueue: ProjectQueue;
  projectLoader: ProjectLoader;
  stateEngine: DurableStateEngine;
  agentLoop: AgentLoop;
  pocketFlow: PocketFlowEngine;
  handoff: ProjectHandoff;
}

export class MidnightOrchestrator {
  private config: MidnightConfig;
  private deps: MidnightOrchestratorDependencies;
  private eventListeners: Set<EventCallback> = new Set();
  private running = false;
  private currentProject: QueuedProject | null = null;
  private currentState: FlowState = 'idle';
  private tasksCompleted = 0;
  private tasksFailed = 0;
  private startTime = 0;
  private confidenceScore = 100;
  private confidenceStatus: 'healthy' | 'warning' | 'error' = 'healthy';

  constructor(
    config: MidnightConfig,
    deps: MidnightOrchestratorDependencies
  ) {
    this.config = config;
    this.deps = deps;

    // Wire up event forwarding
    this.deps.stateEngine.on(event => this.emit(event));
    this.deps.agentLoop.on(event => this.handleAgentEvent(event));
    this.deps.pocketFlow.on(state => this.handleStateChange(state));
  }

  /**
   * Start Project Midnight
   */
  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    this.startTime = Date.now();

    // Check for recovery needed
    const needsRecovery = await this.checkNeedsRecovery();
    if (needsRecovery) {
      await this.recover();
    }

    // Start the main loop
    await this.runLoop();
  }

  /**
   * Stop Project Midnight gracefully
   */
  async stop(graceful = true): Promise<void> {
    if (!this.running) return;

    if (graceful && this.currentProject) {
      // Save state snapshot before stopping
      await this.deps.stateEngine.saveSnapshot(this.currentProject.id);
    }

    this.running = false;
    this.currentState = 'idle';
  }

  /**
   * Pause execution (can be resumed)
   */
  async pause(): Promise<void> {
    if (!this.running) return;

    if (this.currentProject) {
      await this.deps.projectQueue.updateProjectStatus(
        this.currentProject.id,
        'paused'
      );
    }

    this.running = false;
  }

  /**
   * Resume from pause
   */
  async resume(): Promise<void> {
    if (this.running) return;

    if (this.currentProject) {
      await this.deps.projectQueue.updateProjectStatus(
        this.currentProject.id,
        'building'
      );
    }

    this.running = true;
    await this.runLoop();
  }

  /**
   * Get current status
   */
  getStatus(): MidnightStatus {
    const cooldowns = this.deps.stateEngine.checkCooldowns();

    return {
      running: this.running,
      currentProject: this.currentProject,
      queueLength: 0, // Will be populated async
      confidenceScore: this.confidenceScore,
      confidenceStatus: this.confidenceStatus,
      uptime: this.running ? Date.now() - this.startTime : 0,
      tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed,
      cooldowns: [], // Will be populated async
    };
  }

  /**
   * Get current status async (with queue and cooldown info)
   */
  async getStatusAsync(): Promise<MidnightStatus> {
    const [projects, cooldowns] = await Promise.all([
      this.deps.projectQueue.listProjects(),
      this.deps.stateEngine.checkCooldowns(),
    ]);

    return {
      running: this.running,
      currentProject: this.currentProject,
      queueLength: projects.filter(p => p.status === 'queued').length,
      confidenceScore: this.confidenceScore,
      confidenceStatus: this.confidenceStatus,
      uptime: this.running ? Date.now() - this.startTime : 0,
      tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed,
      cooldowns,
    };
  }

  /**
   * Subscribe to orchestrator events
   */
  on(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN LOOP
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Main orchestration loop
   */
  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        // Check for cooldowns
        const cooldowns = await this.deps.stateEngine.checkCooldowns();
        if (cooldowns.length > 0) {
          const nextResume = Math.min(...cooldowns.map(c => c.resumeAt));
          const waitTime = nextResume - Date.now();
          if (waitTime > 0) {
            await this.sleep(waitTime);
            await this.deps.stateEngine.processExpiredCooldowns();
            continue;
          }
        }

        // Get next project
        const project = await this.deps.projectQueue.getNextProject();
        
        if (!project) {
          // No projects in queue, wait and retry
          await this.sleep(5000);
          continue;
        }

        this.currentProject = project;
        this.emit({ type: 'project_started', project });

        // Run project through Pocket Flow
        const success = await this.processProject(project);

        if (success) {
          // Trigger handoff to next project
          const nextProject = await this.deps.projectQueue.getNextProject();
          if (nextProject && this.config.trustLevel === 3) {
            await this.deps.handoff.execute(project, nextProject);
            this.emit({
              type: 'handoff_triggered',
              fromProject: project.id,
              toProject: nextProject.id,
            });
          }
        }

        this.currentProject = null;
      } catch (error) {
        // Log error and continue
        this.deps.stateEngine.log(
          'error',
          'orchestrator',
          `Loop error: ${error}`,
          { error: String(error) },
          this.currentProject?.id
        );

        // Wait before retrying
        await this.sleep(10000);
      }
    }
  }

  /**
   * Process a single project through all phases
   */
  private async processProject(project: QueuedProject): Promise<boolean> {
    try {
      // Phase 1: Loading
      await this.deps.projectQueue.updateProjectStatus(project.id, 'loading');
      await this.deps.pocketFlow.transition('loading');

      const dna = await this.deps.projectLoader.loadDNA(project.localPath);
      const validation = this.deps.projectLoader.validateDNA(dna);

      if (!validation.valid) {
        throw new Error(`Invalid project DNA: ${validation.errors.join(', ')}`);
      }

      await this.deps.projectQueue.storeDNA(project.id, dna);
      project.dna = dna;

      // Phase 2: Planning
      await this.deps.projectQueue.updateProjectStatus(project.id, 'planning');
      await this.deps.pocketFlow.transition('planning');

      const taskDefinitions = this.deps.projectLoader.extractTasks(dna);
      const tasks: MidnightTask[] = [];

      for (const def of taskDefinitions) {
        const task = await this.deps.projectQueue.addTask({
          projectId: project.id,
          description: def.description,
          status: 'pending',
          assignedAgent: 'actor',
          priority: def.priority,
          dependencies: def.dependencies,
          retryCount: 0,
        });
        tasks.push(task);
      }

      // Start auto-snapshots
      this.deps.stateEngine.startAutoSnapshot(
        project.id,
        this.config.snapshotIntervalMs
      );

      // Phase 3: Building
      await this.deps.projectQueue.updateProjectStatus(project.id, 'building');
      await this.deps.pocketFlow.transition('building');

      for (const task of tasks) {
        if (!this.running) break;

        const result = await this.deps.agentLoop.executeTask(
          task,
          dna.ideaMd,
          '', // Project plan
          dna.definitionOfDoneMd
        );

        if (result.success) {
          await this.deps.projectQueue.updateTask(task.id, {
            status: 'completed',
            completedAt: Date.now(),
            result: result.result,
          });
          this.tasksCompleted++;
        } else {
          await this.deps.projectQueue.updateTask(task.id, {
            status: result.result.errors.some(e => !e.recoverable) ? 'failed' : 'locked',
            result: result.result,
          });
          this.tasksFailed++;

          // Update confidence
          const confidence = this.deps.agentLoop.calculateConfidence(result.verdicts);
          this.confidenceScore = confidence.score;
          this.confidenceStatus = confidence.status;
          this.emit({ type: 'confidence_update', score: confidence.score, status: confidence.status });
        }
      }

      // Phase 4: Verification (final check)
      await this.deps.projectQueue.updateProjectStatus(project.id, 'verifying');
      await this.deps.pocketFlow.transition('verifying');

      const projectTasks = await this.deps.projectQueue.getProjectTasks(project.id);
      const allCompleted = projectTasks.every(t => t.status === 'completed');

      // Stop auto-snapshots
      this.deps.stateEngine.stopAutoSnapshot();

      if (allCompleted) {
        await this.deps.projectQueue.updateProjectStatus(project.id, 'completed');
        await this.deps.pocketFlow.transition('idle');
        this.emit({ type: 'project_completed', project });
        return true;
      } else {
        await this.deps.projectQueue.updateProjectStatus(project.id, 'failed');
        await this.deps.pocketFlow.transition('idle');
        this.emit({
          type: 'project_failed',
          project,
          error: 'Not all tasks completed successfully',
        });
        return false;
      }
    } catch (error) {
      await this.deps.projectQueue.updateProjectStatus(project.id, 'failed');
      await this.deps.pocketFlow.transition('idle');
      this.deps.stateEngine.stopAutoSnapshot();

      this.emit({
        type: 'project_failed',
        project,
        error: String(error),
      });

      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async checkNeedsRecovery(): Promise<boolean> {
    const projects = await this.deps.projectQueue.listProjects();
    const inProgressStatuses = ['loading', 'planning', 'building', 'verifying'];
    return projects.some(p => inProgressStatuses.includes(p.status));
  }

  private async recover(): Promise<void> {
    const projects = await this.deps.projectQueue.listProjects();
    const inProgressStatuses = ['loading', 'planning', 'building', 'verifying'];
    
    for (const project of projects) {
      if (inProgressStatuses.includes(project.status)) {
        // Reset to queued for re-processing
        await this.deps.projectQueue.updateProjectStatus(project.id, 'queued');
      }
    }
  }

  private handleAgentEvent(event: MidnightEvent): void {
    this.emit(event);

    // Update confidence on verdicts
    if (event.type === 'sentinel_verdict') {
      const score = event.verdict.qualityScore;
      this.confidenceScore = Math.round((this.confidenceScore + score) / 2);
      
      if (this.confidenceScore >= 85) {
        this.confidenceStatus = 'healthy';
      } else if (this.confidenceScore >= 70) {
        this.confidenceStatus = 'warning';
      } else {
        this.confidenceStatus = 'error';
      }

      this.emit({
        type: 'confidence_update',
        score: this.confidenceScore,
        status: this.confidenceStatus,
      });
    }
  }

  private handleStateChange(state: FlowState): void {
    this.currentState = state;
  }

  private emit(event: MidnightEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a new Midnight orchestrator
 */
export function createMidnightOrchestrator(
  config: MidnightConfig,
  deps: MidnightOrchestratorDependencies
): MidnightOrchestrator {
  return new MidnightOrchestrator(config, deps);
}
