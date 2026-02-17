// MCP Conflict Resolver
// packages/mcp/coordination/src/conflict-resolver.ts

import { EventEmitter } from 'events';
import {
  CoordinatedTask,
  ConflictEvent,
  ConflictType,
  ConflictResolution,
  AgentResult,
} from './types';

export type ResolutionStrategy = 'first-wins' | 'merge' | 'vote' | 'priority' | 'confidence';

export class ConflictResolver extends EventEmitter {
  private strategy: ResolutionStrategy;
  private conflicts: Map<string, ConflictEvent> = new Map();
  private customMergers: Map<string, MergeFunction> = new Map();

  constructor(strategy: ResolutionStrategy = 'merge') {
    super();
    this.strategy = strategy;
  }

  async resolve(task: CoordinatedTask): Promise<ConflictResolution> {
    const results = Array.from(task.results.values());
    const conflictingOutputs = new Map<string, unknown>();

    for (const result of results) {
      if (result.success) {
        conflictingOutputs.set(result.agentId, result.output);
      }
    }

    const conflict: ConflictEvent = {
      id: this.generateId(),
      taskId: task.id,
      type: 'output-mismatch',
      agents: Array.from(conflictingOutputs.keys()),
      conflictingOutputs,
      createdAt: Date.now(),
    };

    this.conflicts.set(conflict.id, conflict);
    this.emit('conflict:detected', conflict);

    let resolution: ConflictResolution;

    switch (this.strategy) {
      case 'first-wins':
        resolution = this.resolveFirstWins(results);
        break;
      case 'merge':
        resolution = await this.resolveMerge(results, task);
        break;
      case 'vote':
        resolution = this.resolveVote(results);
        break;
      case 'priority':
        resolution = this.resolvePriority(results, task);
        break;
      case 'confidence':
        resolution = this.resolveConfidence(results);
        break;
      default:
        resolution = this.resolveFirstWins(results);
    }

    conflict.resolution = resolution;
    conflict.resolvedAt = Date.now();

    this.emit('conflict:resolved', { conflictId: conflict.id, resolution });
    return resolution;
  }

  private resolveFirstWins(results: AgentResult[]): ConflictResolution {
    const firstSuccess = results.find(r => r.success);
    return {
      strategy: 'first-wins',
      winner: firstSuccess?.agentId,
      mergedOutput: firstSuccess?.output,
    };
  }

  private async resolveMerge(
    results: AgentResult[],
    task: CoordinatedTask
  ): Promise<ConflictResolution> {
    const successfulResults = results.filter(r => r.success);
    
    // Check for custom merger
    const taskType = task.metadata?.outputType as string;
    const customMerger = taskType ? this.customMergers.get(taskType) : undefined;

    if (customMerger) {
      const mergedOutput = await customMerger(successfulResults.map(r => r.output));
      return {
        strategy: 'merge',
        mergedOutput,
      };
    }

    // Default merge strategies based on output type
    const outputs = successfulResults.map(r => r.output);
    
    if (outputs.every(o => typeof o === 'string')) {
      // For strings, use longest common subsequence or concatenate unique parts
      return {
        strategy: 'merge',
        mergedOutput: this.mergeStrings(outputs as string[]),
      };
    }

    if (outputs.every(o => Array.isArray(o))) {
      // For arrays, merge and deduplicate
      return {
        strategy: 'merge',
        mergedOutput: this.mergeArrays(outputs as unknown[][]),
      };
    }

    if (outputs.every(o => typeof o === 'object' && o !== null)) {
      // For objects, deep merge
      return {
        strategy: 'merge',
        mergedOutput: this.mergeObjects(outputs as object[]),
      };
    }

    // Fallback: return array of all outputs
    return {
      strategy: 'merge',
      mergedOutput: outputs,
    };
  }

  private resolveVote(results: AgentResult[]): ConflictResolution {
    const voteCounts = new Map<string, number>();

    for (const result of results) {
      if (!result.success) continue;
      const key = JSON.stringify(result.output);
      voteCounts.set(key, (voteCounts.get(key) || 0) + 1);
    }

    let maxVotes = 0;
    let winningOutput: unknown = null;

    for (const [key, count] of voteCounts) {
      if (count > maxVotes) {
        maxVotes = count;
        winningOutput = JSON.parse(key);
      }
    }

    return {
      strategy: 'vote',
      mergedOutput: winningOutput,
      voteCounts,
    };
  }

  private resolvePriority(results: AgentResult[], task: CoordinatedTask): ConflictResolution {
    // This would need agent priority information
    // For now, sort by agent ID as proxy for priority
    const sorted = [...results]
      .filter(r => r.success)
      .sort((a, b) => a.agentId.localeCompare(b.agentId));

    const winner = sorted[0];
    return {
      strategy: 'priority',
      winner: winner?.agentId,
      mergedOutput: winner?.output,
    };
  }

  private resolveConfidence(results: AgentResult[]): ConflictResolution {
    const successful = results.filter(r => r.success && r.confidence !== undefined);
    
    if (successful.length === 0) {
      return this.resolveFirstWins(results);
    }

    const highest = successful.reduce((max, r) => 
      (r.confidence || 0) > (max.confidence || 0) ? r : max
    );

    return {
      strategy: 'confidence',
      winner: highest.agentId,
      mergedOutput: highest.output,
    };
  }

  private mergeStrings(strings: string[]): string {
    // Simple strategy: return unique lines
    const lines = new Set<string>();
    for (const str of strings) {
      for (const line of str.split('\n')) {
        lines.add(line);
      }
    }
    return Array.from(lines).join('\n');
  }

  private mergeArrays(arrays: unknown[][]): unknown[] {
    const seen = new Set<string>();
    const result: unknown[] = [];

    for (const arr of arrays) {
      for (const item of arr) {
        const key = JSON.stringify(item);
        if (!seen.has(key)) {
          seen.add(key);
          result.push(item);
        }
      }
    }

    return result;
  }

  private mergeObjects(objects: object[]): object {
    const result: Record<string, unknown> = {};

    for (const obj of objects) {
      for (const [key, value] of Object.entries(obj)) {
        if (result[key] === undefined) {
          result[key] = value;
        } else if (Array.isArray(result[key]) && Array.isArray(value)) {
          result[key] = this.mergeArrays([result[key] as unknown[], value]);
        } else if (typeof result[key] === 'object' && typeof value === 'object') {
          result[key] = this.mergeObjects([result[key] as object, value]);
        }
        // If conflicting primitive values, keep first
      }
    }

    return result;
  }

  registerCustomMerger(outputType: string, merger: MergeFunction): void {
    this.customMergers.set(outputType, merger);
  }

  setStrategy(strategy: ResolutionStrategy): void {
    this.strategy = strategy;
  }

  getStrategy(): ResolutionStrategy {
    return this.strategy;
  }

  getConflict(conflictId: string): ConflictEvent | undefined {
    return this.conflicts.get(conflictId);
  }

  getConflictsForTask(taskId: string): ConflictEvent[] {
    return Array.from(this.conflicts.values())
      .filter(c => c.taskId === taskId);
  }

  private generateId(): string {
    return `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export type MergeFunction = (outputs: unknown[]) => Promise<unknown>;
