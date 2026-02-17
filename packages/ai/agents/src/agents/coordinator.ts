/**
 * Titan AI Agents - Coordinator Agent
 * Central agent that orchestrates and delegates to specialists
 */

import { Agent } from '../agent-base.js';
import type { AgentConfig, AgentTask, TaskResult, NodeContext } from '../types.js';

export class CoordinatorAgent extends Agent {
  constructor(config: AgentConfig) {
    super({
      ...config,
      role: 'coordinator',
      systemPrompt: config.systemPrompt || COORDINATOR_SYSTEM_PROMPT,
    });
  }

  /**
   * Analyze a complex task and create subtasks
   */
  async analyzeAndDecompose(task: AgentTask): Promise<AgentTask[]> {
    const subtasks: AgentTask[] = [];

    // Analyze task complexity
    const complexity = this.assessComplexity(task);

    if (complexity === 'simple') {
      // No decomposition needed
      return [task];
    }

    // Decompose based on task type
    if (task.description.toLowerCase().includes('security')) {
      subtasks.push(this.createSubtask(task, 'security-review', 'Security analysis'));
    }

    if (task.description.toLowerCase().includes('test')) {
      subtasks.push(this.createSubtask(task, 'test-generation', 'Generate tests'));
    }

    if (task.description.toLowerCase().includes('refactor')) {
      subtasks.push(this.createSubtask(task, 'refactor', 'Code refactoring'));
    }

    if (task.description.toLowerCase().includes('document')) {
      subtasks.push(this.createSubtask(task, 'documentation', 'Update documentation'));
    }

    // If no specific subtasks, create a general review subtask
    if (subtasks.length === 0) {
      subtasks.push(this.createSubtask(task, 'analysis', 'Analyze and implement'));
    }

    return subtasks;
  }

  /**
   * Assess task complexity
   */
  private assessComplexity(task: AgentTask): 'simple' | 'moderate' | 'complex' {
    const description = task.description.toLowerCase();

    // Check for complexity indicators
    const complexIndicators = [
      'entire codebase',
      'all files',
      'multiple',
      'comprehensive',
      'full',
      'complete',
    ];

    const moderateIndicators = [
      'several',
      'few',
      'some',
      'related',
    ];

    for (const indicator of complexIndicators) {
      if (description.includes(indicator)) {
        return 'complex';
      }
    }

    for (const indicator of moderateIndicators) {
      if (description.includes(indicator)) {
        return 'moderate';
      }
    }

    return 'simple';
  }

  /**
   * Create a subtask
   */
  private createSubtask(
    parent: AgentTask,
    type: string,
    description: string
  ): AgentTask {
    return {
      id: `${parent.id}-${type}`,
      type,
      description: `${description}: ${parent.description}`,
      priority: parent.priority,
      dependencies: [],
      status: 'pending',
      createdAt: Date.now(),
    };
  }

  /**
   * Synthesize results from multiple subtasks
   */
  async synthesizeResults(results: TaskResult[]): Promise<TaskResult> {
    const success = results.every(r => r.success);
    const allArtifacts = results.flatMap(r => r.artifacts);
    const allErrors = results.flatMap(r => r.errors);

    const totalMetrics = results.reduce(
      (acc, r) => ({
        tokensUsed: acc.tokensUsed + r.metrics.tokensUsed,
        latencyMs: acc.latencyMs + r.metrics.latencyMs,
        iterations: acc.iterations + r.metrics.iterations,
        toolCalls: acc.toolCalls + r.metrics.toolCalls,
      }),
      { tokensUsed: 0, latencyMs: 0, iterations: 0, toolCalls: 0 }
    );

    // Combine outputs
    const outputs = results.map(r => r.output).filter(Boolean);
    const combinedOutput = outputs.join('\n\n---\n\n');

    return {
      success,
      output: combinedOutput,
      artifacts: allArtifacts,
      errors: allErrors,
      metrics: totalMetrics,
    };
  }
}

const COORDINATOR_SYSTEM_PROMPT = `You are a Coordinator Agent in the Titan AI system. Your role is to:

1. Analyze complex tasks and break them down into manageable subtasks
2. Delegate subtasks to appropriate specialist agents
3. Monitor progress and handle failures
4. Synthesize results from multiple agents
5. Ensure consistency across agent outputs

When analyzing a task:
- Identify the core objectives
- Determine which specialists are needed
- Create clear, actionable subtasks
- Define dependencies between subtasks

When delegating:
- Security tasks → Security Reviewer Agent
- Refactoring tasks → Refactor Specialist Agent
- Testing tasks → Test Writer Agent
- Documentation tasks → Doc Writer Agent
- Code review tasks → Code Reviewer Agent
- Debugging tasks → Debugger Agent
- Architecture tasks → Architect Agent

Always ensure:
- Clear communication of requirements
- Proper handling of conflicts
- Comprehensive error recovery
- Quality verification of results`;
