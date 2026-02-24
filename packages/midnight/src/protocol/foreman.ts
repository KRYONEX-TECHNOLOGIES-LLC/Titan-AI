/**
 * THE FOREMAN — Project Manager / Architect
 * Uses DeepSeek V3.2 Speciale to decompose projects into atomic tasks.
 */

import type { AgentMessage } from '../types.js';
import type { LLMClient } from '../agents/actor.js';
import {
  PROTOCOL_ROLES,
  type ProtocolCostTracker,
} from './midnight-protocol.js';
import { FOREMAN_SYSTEM_PROMPT, generateForemanPrompt } from './prompts.js';

export interface ForemanTask {
  id: string;
  description: string;
  dependencies: string[];
  estimatedLines: number;
  category: string;
  parallelSafe: boolean;
  priority: number;
}

export interface ForemanPlan {
  projectSummary: string;
  estimatedComplexity: 'low' | 'medium' | 'high';
  tasks: ForemanTask[];
  architectureNotes: string;
}

export class Foreman {
  private llmClient: LLMClient;
  private costTracker: ProtocolCostTracker;

  constructor(llmClient: LLMClient, costTracker: ProtocolCostTracker) {
    this.llmClient = llmClient;
    this.costTracker = costTracker;
  }

  async decompose(
    ideaMd: string,
    techStackJson: string,
    definitionOfDone: string
  ): Promise<ForemanPlan> {
    const spec = PROTOCOL_ROLES.foreman;

    const messages: AgentMessage[] = [
      { role: 'system', content: FOREMAN_SYSTEM_PROMPT, timestamp: Date.now() },
      { role: 'user', content: generateForemanPrompt(ideaMd, techStackJson, definitionOfDone), timestamp: Date.now() },
    ];

    const response = await this.llmClient.chat(messages, {
      model: spec.modelId,
      maxTokens: spec.maxTokens,
      temperature: spec.temperature,
    });

    this.costTracker.record('foreman', response.usage.promptTokens, response.usage.completionTokens);

    return this.parsePlan(response.content);
  }

  private parsePlan(raw: string): ForemanPlan {
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        projectSummary: 'Failed to parse plan',
        estimatedComplexity: 'medium',
        tasks: [],
        architectureNotes: raw,
      };
    }

    try {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      return {
        projectSummary: parsed.projectSummary || '',
        estimatedComplexity: parsed.estimatedComplexity || 'medium',
        tasks: (parsed.tasks || []).map((t: Record<string, unknown>, i: number) => ({
          id: (t.id as string) || `task-${String(i + 1).padStart(3, '0')}`,
          description: (t.description as string) || '',
          dependencies: (t.dependencies as string[]) || [],
          estimatedLines: (t.estimatedLines as number) || 100,
          category: (t.category as string) || 'backend',
          parallelSafe: (t.parallelSafe as boolean) ?? true,
          priority: (t.priority as number) || i + 1,
        })),
        architectureNotes: parsed.architectureNotes || '',
      };
    } catch {
      return {
        projectSummary: 'Failed to parse plan JSON',
        estimatedComplexity: 'medium',
        tasks: [],
        architectureNotes: raw,
      };
    }
  }
}
