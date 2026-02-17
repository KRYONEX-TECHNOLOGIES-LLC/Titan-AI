// MCP Sub-Agent Sampler
// packages/mcp/sampling/src/sub-agent-sampler.ts

import { EventEmitter } from 'events';
import {
  SamplingRequest,
  SamplingResponse,
  SubAgentConfig,
  SubAgentTask,
  SamplingMessage,
} from './types';
import { DefaultSamplingProvider, ModelHandler } from './sampling-provider';

export class SubAgentSampler extends EventEmitter {
  private provider: DefaultSamplingProvider;
  private agents: Map<string, SubAgentConfig> = new Map();
  private tasks: Map<string, SubAgentTask> = new Map();
  private runningTasks: Map<string, Set<string>> = new Map(); // agentId -> taskIds

  constructor(modelHandler?: ModelHandler) {
    super();
    this.provider = new DefaultSamplingProvider();
    if (modelHandler) {
      this.provider.setModelHandler(modelHandler);
    }

    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    this.provider.on('request:start', (data) => this.emit('task:start', data));
    this.provider.on('request:complete', (data) => this.emit('task:complete', data));
    this.provider.on('request:error', (data) => this.emit('task:error', data));
    this.provider.on('request:retry', (data) => this.emit('task:retry', data));
  }

  registerAgent(config: SubAgentConfig): void {
    this.agents.set(config.id, config);
    this.runningTasks.set(config.id, new Set());
    this.emit('agent:registered', { agentId: config.id, config });
  }

  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.runningTasks.delete(agentId);
    this.emit('agent:unregistered', { agentId });
  }

  getAgent(agentId: string): SubAgentConfig | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): SubAgentConfig[] {
    return Array.from(this.agents.values());
  }

  async invokeAgent(
    agentId: string,
    messages: SamplingMessage[],
    additionalContext?: Record<string, unknown>
  ): Promise<SamplingResponse> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Check concurrency limit
    const running = this.runningTasks.get(agentId) || new Set();
    if (agent.maxConcurrent && running.size >= agent.maxConcurrent) {
      throw new Error(`Agent ${agentId} at max concurrency (${agent.maxConcurrent})`);
    }

    const taskId = this.generateId();
    const task: SubAgentTask = {
      id: taskId,
      agentId,
      request: {
        id: taskId,
        messages,
        systemPrompt: agent.systemPrompt,
        modelPreferences: agent.modelPreferences,
        metadata: {
          agentId,
          agentName: agent.name,
          ...additionalContext,
        },
      },
      status: 'pending',
      startTime: Date.now(),
    };

    this.tasks.set(taskId, task);
    running.add(taskId);

    try {
      task.status = 'running';
      this.emit('task:running', { taskId, agentId });

      const response = await this.provider.handleSamplingRequest(task.request);

      task.status = 'completed';
      task.response = response;
      task.endTime = Date.now();

      this.emit('task:success', { taskId, agentId, response });
      return response;
    } catch (error) {
      task.status = 'failed';
      task.error = error as Error;
      task.endTime = Date.now();

      this.emit('task:failed', { taskId, agentId, error });
      throw error;
    } finally {
      running.delete(taskId);
    }
  }

  async invokeAgentChain(
    chain: AgentChainStep[],
    initialInput: string
  ): Promise<ChainResult> {
    const results: ChainStepResult[] = [];
    let currentInput = initialInput;

    for (const step of chain) {
      const startTime = Date.now();

      try {
        const messages: SamplingMessage[] = [
          {
            role: 'user',
            content: {
              type: 'text',
              text: step.inputTransform
                ? step.inputTransform(currentInput, results)
                : currentInput,
            },
          },
        ];

        const response = await this.invokeAgent(step.agentId, messages, step.context);
        const outputText = response.content.type === 'text' ? response.content.text : '';

        results.push({
          stepId: step.id,
          agentId: step.agentId,
          input: currentInput,
          output: outputText,
          response,
          duration: Date.now() - startTime,
          success: true,
        });

        currentInput = step.outputTransform
          ? step.outputTransform(outputText, results)
          : outputText;
      } catch (error) {
        results.push({
          stepId: step.id,
          agentId: step.agentId,
          input: currentInput,
          output: '',
          duration: Date.now() - startTime,
          success: false,
          error: error as Error,
        });

        if (!step.continueOnError) {
          break;
        }
      }
    }

    return {
      steps: results,
      finalOutput: currentInput,
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
      success: results.every(r => r.success),
    };
  }

  async invokeAgentsParallel(
    invocations: ParallelInvocation[]
  ): Promise<Map<string, SamplingResponse | Error>> {
    const results = new Map<string, SamplingResponse | Error>();

    const promises = invocations.map(async (inv) => {
      try {
        const response = await this.invokeAgent(inv.agentId, inv.messages, inv.context);
        results.set(inv.id, response);
      } catch (error) {
        results.set(inv.id, error as Error);
      }
    });

    await Promise.all(promises);
    return results;
  }

  getTask(taskId: string): SubAgentTask | undefined {
    return this.tasks.get(taskId);
  }

  getAgentTasks(agentId: string): SubAgentTask[] {
    return Array.from(this.tasks.values())
      .filter(task => task.agentId === agentId);
  }

  getTaskStats(): TaskStats {
    const tasks = Array.from(this.tasks.values());
    const completed = tasks.filter(t => t.status === 'completed');
    const failed = tasks.filter(t => t.status === 'failed');

    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      running: tasks.filter(t => t.status === 'running').length,
      completed: completed.length,
      failed: failed.length,
      averageDuration: completed.length > 0
        ? completed.reduce((sum, t) => sum + ((t.endTime || 0) - (t.startTime || 0)), 0) / completed.length
        : 0,
    };
  }

  clearCompletedTasks(): number {
    let cleared = 0;
    for (const [id, task] of this.tasks) {
      if (task.status === 'completed' || task.status === 'failed') {
        this.tasks.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  private generateId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export interface AgentChainStep {
  id: string;
  agentId: string;
  inputTransform?: (input: string, previousResults: ChainStepResult[]) => string;
  outputTransform?: (output: string, allResults: ChainStepResult[]) => string;
  context?: Record<string, unknown>;
  continueOnError?: boolean;
}

export interface ChainStepResult {
  stepId: string;
  agentId: string;
  input: string;
  output: string;
  response?: SamplingResponse;
  duration: number;
  success: boolean;
  error?: Error;
}

export interface ChainResult {
  steps: ChainStepResult[];
  finalOutput: string;
  totalDuration: number;
  success: boolean;
}

export interface ParallelInvocation {
  id: string;
  agentId: string;
  messages: SamplingMessage[];
  context?: Record<string, unknown>;
}

export interface TaskStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  averageDuration: number;
}
