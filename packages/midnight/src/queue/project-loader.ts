/**
 * Project Midnight - Project DNA Loader
 * Loads and validates idea.md, tech_stack.json, definition_of_done.md
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { ProjectDNA, TechStack } from '../types.js';
import type { ValidationResult, TaskDefinition, ProjectLoader as IProjectLoader } from './queue-types.js';

export class ProjectLoader implements IProjectLoader {
  /**
   * Load project DNA from a directory
   */
  async loadDNA(projectPath: string): Promise<ProjectDNA> {
    const ideaPath = join(projectPath, 'idea.md');
    const techStackPath = join(projectPath, 'tech_stack.json');
    const definitionPath = join(projectPath, 'definition_of_done.md');

    // Validate all required files exist
    if (!existsSync(ideaPath)) {
      throw new Error(`Missing required file: idea.md in ${projectPath}`);
    }
    if (!existsSync(techStackPath)) {
      throw new Error(`Missing required file: tech_stack.json in ${projectPath}`);
    }
    if (!existsSync(definitionPath)) {
      throw new Error(`Missing required file: definition_of_done.md in ${projectPath}`);
    }

    // Load files
    const [ideaMd, techStackRaw, definitionOfDoneMd] = await Promise.all([
      readFile(ideaPath, 'utf-8'),
      readFile(techStackPath, 'utf-8'),
      readFile(definitionPath, 'utf-8'),
    ]);

    // Parse tech stack JSON
    let techStackJson: TechStack;
    try {
      techStackJson = JSON.parse(techStackRaw);
    } catch {
      throw new Error(`Invalid JSON in tech_stack.json: ${projectPath}`);
    }

    return {
      ideaMd,
      techStackJson,
      definitionOfDoneMd,
    };
  }

  /**
   * Validate project DNA
   */
  validateDNA(dna: ProjectDNA): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate idea.md
    if (!dna.ideaMd || dna.ideaMd.trim().length < 50) {
      errors.push('idea.md must contain at least 50 characters describing the project vision');
    }

    // Validate tech_stack.json
    if (!dna.techStackJson.runtime) {
      errors.push('tech_stack.json must specify a runtime (e.g., "node@20.11.0")');
    }

    if (!dna.techStackJson.dependencies || Object.keys(dna.techStackJson.dependencies).length === 0) {
      warnings.push('tech_stack.json has no dependencies specified');
    }

    // Validate version format
    const versionPattern = /^[\w-]+@\d+\.\d+\.\d+$/;
    if (dna.techStackJson.runtime && !versionPattern.test(dna.techStackJson.runtime)) {
      warnings.push(`Runtime version format should be "name@x.y.z", got: ${dna.techStackJson.runtime}`);
    }

    // Validate definition_of_done.md
    if (!dna.definitionOfDoneMd || dna.definitionOfDoneMd.trim().length < 100) {
      errors.push('definition_of_done.md must contain at least 100 characters of acceptance criteria');
    }

    // Check for checkboxes in definition_of_done.md
    if (!dna.definitionOfDoneMd.includes('- [ ]') && !dna.definitionOfDoneMd.includes('- [x]')) {
      warnings.push('definition_of_done.md should contain checkbox items (- [ ]) for tracking completion');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Extract task definitions from project DNA
   */
  extractTasks(dna: ProjectDNA): TaskDefinition[] {
    const tasks: TaskDefinition[] = [];

    // Parse definition_of_done.md for task items
    const lines = dna.definitionOfDoneMd.split('\n');
    let currentSection = '';
    let priority = 100;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect section headers
      if (trimmed.startsWith('## ')) {
        currentSection = trimmed.slice(3).trim();
        priority -= 10; // Lower priority for later sections
      }

      // Detect checkbox items
      const checkboxMatch = trimmed.match(/^- \[ \] (.+)$/);
      if (checkboxMatch) {
        const description = checkboxMatch[1];
        
        // Extract acceptance criteria from sub-items
        const acceptanceCriteria: string[] = [];
        const itemIndex = lines.indexOf(line);
        
        // Look for indented sub-items
        for (let i = itemIndex + 1; i < lines.length; i++) {
          const subLine = lines[i];
          if (subLine.match(/^\s{2,}- /)) {
            acceptanceCriteria.push(subLine.trim().replace(/^- /, ''));
          } else if (!subLine.match(/^\s/)) {
            break;
          }
        }

        tasks.push({
          description: `${currentSection}: ${description}`,
          priority: Math.max(0, priority),
          dependencies: this.inferDependencies(description, tasks),
          acceptanceCriteria,
        });
      }
    }

    // If no checkboxes found, create a single task from the whole document
    if (tasks.length === 0) {
      tasks.push({
        description: 'Implement project according to specification',
        priority: 100,
        dependencies: [],
        acceptanceCriteria: [dna.definitionOfDoneMd.slice(0, 500)],
      });
    }

    return tasks;
  }

  /**
   * Infer task dependencies based on keywords
   */
  private inferDependencies(description: string, existingTasks: TaskDefinition[]): string[] {
    const dependencies: string[] = [];
    const descLower = description.toLowerCase();

    // Keywords that suggest dependencies
    const dependencyKeywords = [
      { keyword: 'test', dependsOn: ['implement', 'create', 'add'] },
      { keyword: 'deploy', dependsOn: ['test', 'build'] },
      { keyword: 'document', dependsOn: ['implement', 'create'] },
      { keyword: 'integrate', dependsOn: ['implement', 'create'] },
      { keyword: 'optimize', dependsOn: ['implement', 'create'] },
      { keyword: 'refactor', dependsOn: ['implement', 'create'] },
    ];

    for (const rule of dependencyKeywords) {
      if (descLower.includes(rule.keyword)) {
        for (const task of existingTasks) {
          const taskLower = task.description.toLowerCase();
          for (const dep of rule.dependsOn) {
            if (taskLower.includes(dep)) {
              dependencies.push(task.description);
              break;
            }
          }
        }
      }
    }

    return [...new Set(dependencies)];
  }
}

/**
 * Create a new project loader
 */
export function createProjectLoader(): ProjectLoader {
  return new ProjectLoader();
}
