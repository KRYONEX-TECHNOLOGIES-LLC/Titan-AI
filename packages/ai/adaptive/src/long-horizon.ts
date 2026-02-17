/**
 * Long-horizon reasoning and planning
 */

import { EventEmitter } from 'events';
import type { HorizonPlan, PlanPhase, Checkpoint, Task } from './types';

export interface LongHorizonConfig {
  maxPhases: number;
  checkpointInterval: number;
  enableBacktracking: boolean;
  adaptiveReplanning: boolean;
}

export class LongHorizonPlanner extends EventEmitter {
  private config: LongHorizonConfig;
  private activePlan: HorizonPlan | null = null;
  private planHistory: HorizonPlan[] = [];
  private idCounter: number = 0;

  constructor(config: Partial<LongHorizonConfig> = {}) {
    super();
    this.config = {
      maxPhases: config.maxPhases ?? 10,
      checkpointInterval: config.checkpointInterval ?? 3,
      enableBacktracking: config.enableBacktracking ?? true,
      adaptiveReplanning: config.adaptiveReplanning ?? true,
    };
  }

  createPlan(goal: string, constraints: string[] = [], successCriteria: string[] = []): HorizonPlan {
    const plan: HorizonPlan = {
      id: `plan-${++this.idCounter}`,
      goal,
      phases: [],
      currentPhase: 0,
      checkpoints: [],
      constraints,
      successCriteria,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.activePlan = plan;
    this.emit('plan:created', plan);
    return plan;
  }

  addPhase(name: string, description: string, milestones: string[] = []): PlanPhase {
    if (!this.activePlan) {
      throw new Error('No active plan');
    }

    if (this.activePlan.phases.length >= this.config.maxPhases) {
      throw new Error(`Maximum phases (${this.config.maxPhases}) reached`);
    }

    const phase: PlanPhase = {
      id: `phase-${++this.idCounter}`,
      name,
      description,
      tasks: [],
      milestones,
      status: 'pending',
    };

    this.activePlan.phases.push(phase);
    this.activePlan.updatedAt = new Date();

    // Add checkpoint if interval reached
    if (this.activePlan.phases.length % this.config.checkpointInterval === 0) {
      this.addCheckpoint(phase.id, `Checkpoint after ${phase.name}`);
    }

    this.emit('phase:added', phase);
    return phase;
  }

  addTaskToPhase(phaseId: string, task: Omit<Task, 'id' | 'createdAt'>): Task {
    if (!this.activePlan) {
      throw new Error('No active plan');
    }

    const phase = this.activePlan.phases.find(p => p.id === phaseId);
    if (!phase) {
      throw new Error(`Phase not found: ${phaseId}`);
    }

    const newTask: Task = {
      ...task,
      id: `task-${++this.idCounter}`,
      createdAt: new Date(),
    };

    phase.tasks.push(newTask);
    this.activePlan.updatedAt = new Date();

    this.emit('task:added', { phaseId, task: newTask });
    return newTask;
  }

  addCheckpoint(phaseId: string, description: string, validationCriteria: string[] = []): Checkpoint {
    if (!this.activePlan) {
      throw new Error('No active plan');
    }

    const checkpoint: Checkpoint = {
      id: `checkpoint-${++this.idCounter}`,
      phaseId,
      description,
      validationCriteria,
      isReached: false,
    };

    this.activePlan.checkpoints.push(checkpoint);
    this.emit('checkpoint:added', checkpoint);
    return checkpoint;
  }

  async advancePhase(): Promise<PlanPhase | null> {
    if (!this.activePlan) {
      throw new Error('No active plan');
    }

    const currentPhaseIndex = this.activePlan.currentPhase;
    const currentPhase = this.activePlan.phases[currentPhaseIndex];

    if (!currentPhase) {
      this.emit('plan:completed', this.activePlan);
      return null;
    }

    // Mark current phase as completed
    currentPhase.status = 'completed';

    // Check for checkpoint
    const checkpoint = this.activePlan.checkpoints.find(
      c => c.phaseId === currentPhase.id && !c.isReached
    );

    if (checkpoint) {
      checkpoint.isReached = true;
      checkpoint.reachedAt = new Date();
      this.emit('checkpoint:reached', checkpoint);
    }

    // Move to next phase
    this.activePlan.currentPhase++;
    this.activePlan.updatedAt = new Date();

    const nextPhase = this.activePlan.phases[this.activePlan.currentPhase];
    if (nextPhase) {
      nextPhase.status = 'active';
      this.emit('phase:started', nextPhase);
    } else {
      this.emit('plan:completed', this.activePlan);
    }

    return nextPhase;
  }

  backtrack(toPhaseId: string): PlanPhase | null {
    if (!this.config.enableBacktracking) {
      throw new Error('Backtracking is disabled');
    }

    if (!this.activePlan) {
      throw new Error('No active plan');
    }

    const targetIndex = this.activePlan.phases.findIndex(p => p.id === toPhaseId);
    if (targetIndex === -1) {
      throw new Error(`Phase not found: ${toPhaseId}`);
    }

    if (targetIndex >= this.activePlan.currentPhase) {
      throw new Error('Cannot backtrack to a future phase');
    }

    // Reset phases after target
    for (let i = targetIndex; i < this.activePlan.phases.length; i++) {
      const phase = this.activePlan.phases[i];
      phase.status = i === targetIndex ? 'active' : 'pending';
      
      // Reset tasks
      for (const task of phase.tasks) {
        if (task.status === 'completed' || task.status === 'failed') {
          task.status = 'pending';
          task.completedAt = undefined;
          task.result = undefined;
          task.error = undefined;
        }
      }
    }

    // Reset related checkpoints
    for (const checkpoint of this.activePlan.checkpoints) {
      const checkpointPhaseIndex = this.activePlan.phases.findIndex(
        p => p.id === checkpoint.phaseId
      );
      if (checkpointPhaseIndex >= targetIndex) {
        checkpoint.isReached = false;
        checkpoint.reachedAt = undefined;
      }
    }

    this.activePlan.currentPhase = targetIndex;
    this.activePlan.updatedAt = new Date();

    this.emit('backtracked', { toPhase: toPhaseId });
    return this.activePlan.phases[targetIndex];
  }

  replan(reason: string): HorizonPlan {
    if (!this.config.adaptiveReplanning) {
      throw new Error('Adaptive replanning is disabled');
    }

    if (!this.activePlan) {
      throw new Error('No active plan');
    }

    // Archive current plan
    this.planHistory.push({ ...this.activePlan });

    // Create new plan based on current progress
    const completedPhases = this.activePlan.phases.filter(p => p.status === 'completed');
    const newPlan = this.createPlan(
      this.activePlan.goal,
      this.activePlan.constraints,
      this.activePlan.successCriteria
    );

    // Copy completed phases
    for (const phase of completedPhases) {
      newPlan.phases.push({ ...phase });
    }
    newPlan.currentPhase = completedPhases.length;

    this.emit('replanned', { reason, previousPlan: this.planHistory[this.planHistory.length - 1] });
    return newPlan;
  }

  getCurrentPhase(): PlanPhase | null {
    if (!this.activePlan) return null;
    return this.activePlan.phases[this.activePlan.currentPhase] ?? null;
  }

  getPlan(): HorizonPlan | null {
    return this.activePlan;
  }

  getPlanHistory(): HorizonPlan[] {
    return [...this.planHistory];
  }

  getProgress(): { completed: number; total: number; percentage: number } {
    if (!this.activePlan) {
      return { completed: 0, total: 0, percentage: 0 };
    }

    const completed = this.activePlan.phases.filter(p => p.status === 'completed').length;
    const total = this.activePlan.phases.length;
    
    return {
      completed,
      total,
      percentage: total > 0 ? (completed / total) * 100 : 0,
    };
  }

  reset(): void {
    if (this.activePlan) {
      this.planHistory.push(this.activePlan);
    }
    this.activePlan = null;
    this.emit('reset');
  }
}

/**
 * Creates a long-horizon planner instance
 */
export function createLongHorizonPlanner(config?: Partial<LongHorizonConfig>): LongHorizonPlanner {
  return new LongHorizonPlanner(config);
}
