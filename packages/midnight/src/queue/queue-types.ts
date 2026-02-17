/**
 * Project Midnight - Queue Type Definitions
 */

import type { QueuedProject, ProjectDNA, MidnightTask, ProjectStatus } from '../types.js';

export interface QueueOperations {
  // Project operations
  addProject(projectPath: string, priority?: number): Promise<QueuedProject>;
  removeProject(projectId: string): Promise<boolean>;
  getProject(projectId: string): Promise<QueuedProject | null>;
  getNextProject(): Promise<QueuedProject | null>;
  updateProjectStatus(projectId: string, status: ProjectStatus): Promise<void>;
  
  // Queue management
  listProjects(): Promise<QueuedProject[]>;
  reorderProject(projectId: string, newPriority: number): Promise<void>;
  clearQueue(): Promise<void>;
  
  // Task operations
  addTask(task: Omit<MidnightTask, 'id' | 'createdAt'>): Promise<MidnightTask>;
  getTask(taskId: string): Promise<MidnightTask | null>;
  getProjectTasks(projectId: string): Promise<MidnightTask[]>;
  updateTask(taskId: string, updates: Partial<MidnightTask>): Promise<void>;
}

export interface ProjectLoader {
  loadDNA(projectPath: string): Promise<ProjectDNA>;
  validateDNA(dna: ProjectDNA): ValidationResult;
  extractTasks(dna: ProjectDNA): TaskDefinition[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TaskDefinition {
  description: string;
  priority: number;
  dependencies: string[];
  acceptanceCriteria: string[];
}

export interface QueueStats {
  totalProjects: number;
  pendingProjects: number;
  completedProjects: number;
  failedProjects: number;
  averageCompletionTime: number;
}
