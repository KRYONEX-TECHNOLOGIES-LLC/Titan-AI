/**
 * Titan AI Agents - Delegation Logic
 * Intelligent task assignment to specialized agents
 */

import type { AgentRole, AgentTask } from './types.js';

export interface DelegationConfig {
  specialists: AgentRole[];
}

export interface DelegationResult {
  agent: AgentRole;
  confidence: number;
  reason: string;
  alternatives: AgentRole[];
}

export class DelegationLogic {
  private config: DelegationConfig;

  // Task type to agent mapping
  private static readonly TASK_AGENT_MAP: Record<string, AgentRole[]> = {
    'security': ['security-reviewer'],
    'vulnerability': ['security-reviewer'],
    'audit': ['security-reviewer'],
    'refactor': ['refactor-specialist'],
    'optimize': ['refactor-specialist'],
    'improve': ['refactor-specialist'],
    'test': ['test-writer'],
    'unit test': ['test-writer'],
    'coverage': ['test-writer'],
    'document': ['doc-writer'],
    'readme': ['doc-writer'],
    'jsdoc': ['doc-writer'],
    'review': ['code-reviewer'],
    'code review': ['code-reviewer'],
    'debug': ['debugger'],
    'fix': ['debugger', 'refactor-specialist'],
    'error': ['debugger'],
    'architect': ['architect'],
    'design': ['architect'],
    'plan': ['architect', 'coordinator'],
  };

  constructor(config: DelegationConfig) {
    this.config = config;
  }

  /**
   * Analyze a task and determine the best agent
   */
  async analyze(task: AgentTask): Promise<DelegationResult> {
    const description = task.description.toLowerCase();
    const taskType = task.type.toLowerCase();

    // Find matching agents based on keywords
    const candidates = this.findCandidates(description, taskType);

    if (candidates.length === 0) {
      // Default to coordinator for ambiguous tasks
      return {
        agent: 'coordinator',
        confidence: 0.5,
        reason: 'No specific specialist matched, defaulting to coordinator',
        alternatives: [],
      };
    }

    // Filter to available specialists
    const available = candidates.filter(c => this.config.specialists.includes(c));

    if (available.length === 0) {
      return {
        agent: 'coordinator',
        confidence: 0.6,
        reason: 'Required specialists not available',
        alternatives: candidates,
      };
    }

    // Rank by specificity
    const ranked = this.rankCandidates(available, description, taskType);

    return {
      agent: ranked[0],
      confidence: this.calculateConfidence(ranked[0], description, taskType),
      reason: this.generateReason(ranked[0], description),
      alternatives: ranked.slice(1),
    };
  }

  /**
   * Find candidate agents based on task content
   */
  private findCandidates(description: string, taskType: string): AgentRole[] {
    const candidates = new Set<AgentRole>();

    // Check against keyword map
    for (const [keyword, agents] of Object.entries(DelegationLogic.TASK_AGENT_MAP)) {
      if (description.includes(keyword) || taskType.includes(keyword)) {
        for (const agent of agents) {
          candidates.add(agent);
        }
      }
    }

    return Array.from(candidates);
  }

  /**
   * Rank candidates by relevance
   */
  private rankCandidates(
    candidates: AgentRole[],
    description: string,
    taskType: string
  ): AgentRole[] {
    const scores = candidates.map(agent => ({
      agent,
      score: this.scoreAgent(agent, description, taskType),
    }));

    return scores.sort((a, b) => b.score - a.score).map(s => s.agent);
  }

  /**
   * Score an agent for a task
   */
  private scoreAgent(agent: AgentRole, description: string, taskType: string): number {
    let score = 0;

    // Direct task type match
    const agentKeywords = this.getAgentKeywords(agent);
    for (const keyword of agentKeywords) {
      if (taskType.includes(keyword)) score += 3;
      if (description.includes(keyword)) score += 1;
    }

    // Complexity considerations
    if (description.length > 500 && agent === 'coordinator') {
      score += 1; // Complex tasks may need coordination
    }

    // Multi-file operations
    if (description.includes('all files') || description.includes('entire')) {
      if (agent === 'coordinator') score += 2;
    }

    return score;
  }

  /**
   * Get keywords associated with an agent
   */
  private getAgentKeywords(agent: AgentRole): string[] {
    const keywords: Record<AgentRole, string[]> = {
      'coordinator': ['plan', 'coordinate', 'multiple', 'complex'],
      'security-reviewer': ['security', 'vulnerability', 'audit', 'injection', 'xss', 'csrf'],
      'refactor-specialist': ['refactor', 'optimize', 'improve', 'clean', 'simplify'],
      'test-writer': ['test', 'unit', 'coverage', 'spec', 'jest', 'vitest'],
      'doc-writer': ['document', 'readme', 'jsdoc', 'comment', 'explain'],
      'code-reviewer': ['review', 'check', 'validate', 'quality'],
      'debugger': ['debug', 'fix', 'error', 'bug', 'issue'],
      'architect': ['architect', 'design', 'structure', 'pattern'],
    };

    return keywords[agent] ?? [];
  }

  /**
   * Calculate confidence in delegation
   */
  private calculateConfidence(agent: AgentRole, description: string, taskType: string): number {
    let confidence = 0.7;

    const keywords = this.getAgentKeywords(agent);
    let matches = 0;

    for (const keyword of keywords) {
      if (description.includes(keyword) || taskType.includes(keyword)) {
        matches++;
      }
    }

    // Higher confidence with more keyword matches
    confidence += Math.min(0.2, matches * 0.05);

    // Lower confidence for very short descriptions
    if (description.length < 50) {
      confidence -= 0.1;
    }

    return Math.max(0.4, Math.min(0.95, confidence));
  }

  /**
   * Generate reason for delegation
   */
  private generateReason(agent: AgentRole, description: string): string {
    const reasons: Record<AgentRole, string> = {
      'coordinator': 'Complex task requiring multi-step coordination',
      'security-reviewer': 'Task involves security analysis or vulnerability assessment',
      'refactor-specialist': 'Task involves code improvement or optimization',
      'test-writer': 'Task involves test creation or coverage improvement',
      'doc-writer': 'Task involves documentation or explanation',
      'code-reviewer': 'Task involves code quality review',
      'debugger': 'Task involves debugging or error resolution',
      'architect': 'Task involves system design or architecture decisions',
    };

    return reasons[agent] ?? 'Best match for task requirements';
  }

  /**
   * Check if delegation should be reconsidered
   */
  shouldReconsider(task: AgentTask, currentAgent: AgentRole, errors: number): boolean {
    // Reconsider if agent is failing repeatedly
    if (errors >= 3) return true;

    // Reconsider for certain task/agent mismatches
    if (task.type === 'security' && currentAgent !== 'security-reviewer') return true;
    if (task.type === 'test' && currentAgent !== 'test-writer') return true;

    return false;
  }
}
