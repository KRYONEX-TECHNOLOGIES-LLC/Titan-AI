/**
 * THE NERD SQUAD — 3-Coder Escalation System
 *
 * Alpha Nerd (MiMo-V2-Flash, cheapest) → Beta Nerd (Qwen3 Coder Next) → Gamma Nerd (MiniMax M2.5, heavy hitter)
 * Each nerd gets the previous attempts + sentinel feedback so they learn from failures.
 */

import type { MidnightTask, TaskResult, AgentMessage } from '../types.js';
import type { LLMClient, ToolExecutor, ToolDefinition } from '../agents/actor.js';
import {
  PROTOCOL_ROLES,
  NERD_ESCALATION_ORDER,
  type ProtocolRole,
  type ProtocolCostTracker,
  type EscalationRecord,
  type ProtocolEvent,
} from './midnight-protocol.js';
import {
  ALPHA_NERD_SYSTEM_PROMPT,
  BETA_NERD_SYSTEM_PROMPT,
  GAMMA_NERD_SYSTEM_PROMPT,
  generateNerdTaskPrompt,
} from './prompts.js';

const NERD_PROMPTS: Record<string, string> = {
  alpha_nerd: ALPHA_NERD_SYSTEM_PROMPT,
  beta_nerd: BETA_NERD_SYSTEM_PROMPT,
  gamma_nerd: GAMMA_NERD_SYSTEM_PROMPT,
};

export interface NerdSquadConfig {
  maxIterationsPerNerd: number;
  toolsEnabled: string[];
  workspacePath: string;
}

export interface NerdSquadResult {
  success: boolean;
  activeNerd: ProtocolRole;
  output: string;
  taskResult: TaskResult;
  escalations: EscalationRecord[];
}

type EventEmitter = (event: ProtocolEvent) => void;

export class NerdSquad {
  private llmClient: LLMClient;
  private toolExecutor: ToolExecutor;
  private costTracker: ProtocolCostTracker;
  private config: NerdSquadConfig;
  private emit: EventEmitter;
  private toolDefs: ToolDefinition[];

  constructor(
    llmClient: LLMClient,
    toolExecutor: ToolExecutor,
    costTracker: ProtocolCostTracker,
    config: NerdSquadConfig,
    emit: EventEmitter
  ) {
    this.llmClient = llmClient;
    this.toolExecutor = toolExecutor;
    this.costTracker = costTracker;
    this.config = config;
    this.emit = emit;
    this.toolDefs = this.buildToolDefs();
  }

  async executeTask(
    task: MidnightTask,
    projectContext: string,
    sentinelFeedback?: string
  ): Promise<NerdSquadResult> {
    const escalations: EscalationRecord[] = [];
    const previousAttempts: { nerdName: string; output: string; feedback: string }[] = [];

    for (let i = 0; i < NERD_ESCALATION_ORDER.length; i++) {
      const role = NERD_ESCALATION_ORDER[i];
      const spec = PROTOCOL_ROLES[role];

      this.emit({
        type: 'protocol_squad_active',
        squad: 'nerd_squad',
        role,
        name: spec.name,
      });

      const systemPrompt = NERD_PROMPTS[role];
      const userPrompt = generateNerdTaskPrompt(
        task.description,
        projectContext,
        previousAttempts
      );

      const result = await this.runNerd(role, systemPrompt, userPrompt, task);

      if (result.success) {
        return {
          success: true,
          activeNerd: role,
          output: result.output,
          taskResult: result.taskResult,
          escalations,
        };
      }

      const feedback = sentinelFeedback || result.taskResult.errors.map(e => e.message).join('\n') || 'Task execution failed';
      escalations.push({
        nerdIndex: i,
        role,
        attempt: result.output,
        feedback,
        tokensUsed: result.taskResult.metrics.tokensUsed,
        costUsd: this.costTracker.totalCost,
      });

      previousAttempts.push({
        nerdName: spec.name,
        output: result.output,
        feedback,
      });

      if (i < NERD_ESCALATION_ORDER.length - 1) {
        const nextRole = NERD_ESCALATION_ORDER[i + 1];
        this.emit({
          type: 'protocol_escalation',
          from: role,
          to: nextRole,
          reason: feedback,
        });
      }

      sentinelFeedback = undefined;
    }

    const lastEscalation = escalations[escalations.length - 1];
    return {
      success: false,
      activeNerd: 'gamma_nerd',
      output: lastEscalation?.attempt || 'All nerds failed',
      taskResult: {
        success: false,
        output: 'All Nerd Squad members failed this task',
        artifacts: [],
        errors: [{ code: 'SQUAD_EXHAUSTED', message: 'Alpha, Beta, and Gamma nerds all failed', recoverable: false }],
        metrics: { tokensUsed: 0, latencyMs: 0, iterations: NERD_ESCALATION_ORDER.length, toolCalls: 0 },
      },
      escalations,
    };
  }

  private async runNerd(
    role: ProtocolRole,
    systemPrompt: string,
    userPrompt: string,
    task: MidnightTask
  ): Promise<{ success: boolean; output: string; taskResult: TaskResult }> {
    const spec = PROTOCOL_ROLES[role];
    const startTime = Date.now();
    let totalTokens = 0;
    let toolCallCount = 0;
    const artifacts: TaskResult['artifacts'] = [];
    const errors: TaskResult['errors'] = [];
    let output = '';

    const messages: AgentMessage[] = [
      { role: 'system', content: systemPrompt, timestamp: Date.now() },
      { role: 'user', content: userPrompt, timestamp: Date.now() },
    ];

    for (let iter = 0; iter < this.config.maxIterationsPerNerd; iter++) {
      const response = await this.llmClient.chat(messages, {
        model: spec.modelId,
        maxTokens: spec.maxTokens,
        temperature: spec.temperature,
        tools: this.toolDefs,
      });

      totalTokens += response.usage.promptTokens + response.usage.completionTokens;
      this.costTracker.record(role, response.usage.promptTokens, response.usage.completionTokens);

      output = response.content || '';

      if (response.toolCalls && response.toolCalls.length > 0) {
        messages.push({ role: 'assistant', content: response.content, timestamp: Date.now() });

        for (const tc of response.toolCalls) {
          toolCallCount++;
          try {
            const toolResult = await this.toolExecutor.execute(tc.name, tc.arguments);
            messages.push({
              role: 'tool',
              content: toolResult,
              timestamp: Date.now(),
              toolCallId: tc.id,
            });

            if (tc.name === 'task_complete') {
              return {
                success: true,
                output,
                taskResult: {
                  success: true,
                  output,
                  artifacts,
                  errors,
                  metrics: { tokensUsed: totalTokens, latencyMs: Date.now() - startTime, iterations: iter + 1, toolCalls: toolCallCount },
                },
              };
            }

            if (['write_file', 'run_command'].includes(tc.name)) {
              artifacts.push({
                type: tc.name === 'write_file' ? 'file' : 'command',
                path: tc.arguments.path as string | undefined,
                content: toolResult.slice(0, 500),
                action: tc.name === 'write_file' ? 'modify' : 'execute',
              });
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            errors.push({ code: 'TOOL_ERROR', message: errMsg, recoverable: true });
            messages.push({ role: 'tool', content: `Error: ${errMsg}`, timestamp: Date.now(), toolCallId: tc.id });
          }
        }
        continue;
      }

      // No tool calls — nerd finished (or gave up)
      if (output.toLowerCase().includes('task_complete') || output.toLowerCase().includes('implementation complete')) {
        return {
          success: true,
          output,
          taskResult: {
            success: true,
            output,
            artifacts,
            errors,
            metrics: { tokensUsed: totalTokens, latencyMs: Date.now() - startTime, iterations: iter + 1, toolCalls: toolCallCount },
          },
        };
      }
      break;
    }

    return {
      success: false,
      output,
      taskResult: {
        success: false,
        output,
        artifacts,
        errors: errors.length > 0 ? errors : [{ code: 'NERD_FAILED', message: `${spec.name} could not complete the task`, recoverable: true }],
        metrics: { tokensUsed: totalTokens, latencyMs: Date.now() - startTime, iterations: this.config.maxIterationsPerNerd, toolCalls: toolCallCount },
      },
    };
  }

  private buildToolDefs(): ToolDefinition[] {
    return this.config.toolsEnabled.map(name => {
      switch (name) {
        case 'read_file': return { name, description: 'Read a file from the workspace', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } };
        case 'write_file': return { name, description: 'Write content to a file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } };
        case 'run_command': return { name, description: 'Execute a shell command', parameters: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' } }, required: ['command'] } };
        case 'run_tests': return { name, description: 'Run the test suite', parameters: { type: 'object', properties: { testPath: { type: 'string' } } } };
        case 'git_diff': return { name, description: 'Get the current git diff', parameters: { type: 'object', properties: {} } };
        case 'git_commit': return { name, description: 'Commit current changes', parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } };
        case 'task_complete': return { name, description: 'Signal that the task is complete', parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } };
        default: return { name, description: name, parameters: { type: 'object', properties: {} } };
      }
    });
  }
}
