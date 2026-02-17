/**
 * Titan AI Agents - Base Agent Class
 * Foundation for all specialized agents
 */

import type {
  AgentConfig,
  AgentState,
  AgentTask,
  TaskResult,
  AgentMessage,
  AgentMemory,
  ToolDefinition,
  ToolResult,
  NodeContext,
} from './types.js';
import { DecisionNode } from './nodes/decision-node.js';
import { AnalysisNode } from './nodes/analysis-node.js';
import { ModificationNode } from './nodes/modification-node.js';
import { VerificationNode } from './nodes/verification-node.js';

export class Agent {
  protected config: AgentConfig;
  protected state: AgentState;
  protected tools: Map<string, ToolDefinition>;

  // Pocket Flow nodes
  protected decisionNode: DecisionNode;
  protected analysisNode: AnalysisNode;
  protected modificationNode: ModificationNode;
  protected verificationNode: VerificationNode;

  constructor(config: AgentConfig) {
    this.config = config;
    this.tools = new Map();

    this.state = {
      id: `agent-${config.role}-${Date.now()}`,
      role: config.role,
      status: 'idle',
      memory: this.createEmptyMemory(),
      metrics: {
        tasksCompleted: 0,
        tasksFailed: 0,
        totalTokens: 0,
        averageLatency: 0,
        toolCallCount: 0,
      },
    };

    // Initialize Pocket Flow nodes
    this.decisionNode = new DecisionNode();
    this.analysisNode = new AnalysisNode();
    this.modificationNode = new ModificationNode();
    this.verificationNode = new VerificationNode();

    // Register configured tools
    this.registerTools(config.tools);
  }

  /**
   * Execute a task
   */
  async execute(task: AgentTask): Promise<TaskResult> {
    const startTime = Date.now();
    this.state.status = 'thinking';
    this.state.currentTask = task;

    try {
      // Create node context
      const context: NodeContext = {
        task,
        memory: this.state.memory,
        tools: this.tools,
        state: {},
      };

      // Pocket Flow execution loop
      let currentNode = 'decision';
      let iterations = 0;
      let result: TaskResult | null = null;

      while (iterations < this.config.maxIterations) {
        iterations++;
        this.state.status = 'executing';

        let nodeResult;
        switch (currentNode) {
          case 'decision':
            nodeResult = await this.decisionNode.execute(context);
            break;
          case 'analysis':
            nodeResult = await this.analysisNode.execute(context);
            break;
          case 'modification':
            nodeResult = await this.modificationNode.execute(context);
            break;
          case 'verification':
            nodeResult = await this.verificationNode.execute(context);
            break;
          default:
            throw new Error(`Unknown node type: ${currentNode}`);
        }

        // Check for termination
        if (nodeResult.shouldTerminate) {
          result = this.createResult(true, context, iterations, startTime);
          break;
        }

        // Move to next node
        currentNode = nodeResult.nextNode ?? this.getDefaultNextNode(currentNode);
      }

      // If no result yet, create timeout result
      if (!result) {
        result = this.createResult(false, context, iterations, startTime, 'Max iterations reached');
      }

      // Update metrics
      this.updateMetrics(result, startTime);

      return result;
    } catch (error) {
      this.state.status = 'error';
      return {
        success: false,
        output: '',
        artifacts: [],
        errors: [
          {
            code: 'EXECUTION_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
            recoverable: false,
          },
        ],
        metrics: {
          tokensUsed: 0,
          latencyMs: Date.now() - startTime,
          iterations: 0,
          toolCalls: 0,
        },
      };
    } finally {
      this.state.status = 'idle';
      this.state.currentTask = undefined;
    }
  }

  /**
   * Register tools from config
   */
  protected registerTools(toolNames: string[]): void {
    // Tools are registered by name - actual implementations come from tool modules
    // This is a placeholder - in production, dynamically import tools
    for (const name of toolNames) {
      this.tools.set(name, {
        name,
        description: `Tool: ${name}`,
        parameters: [],
        execute: async () => ({ success: true, output: 'Not implemented' }),
      });
    }
  }

  /**
   * Execute a tool
   */
  async executeTool(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, output: '', error: `Tool not found: ${name}` };
    }

    this.state.metrics.toolCallCount++;

    try {
      return await tool.execute(params);
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Tool execution failed',
      };
    }
  }

  /**
   * Add message to memory
   */
  addMessage(message: Omit<AgentMessage, 'timestamp'>): void {
    this.state.memory.messages.push({
      ...message,
      timestamp: Date.now(),
    });
  }

  /**
   * Get current status
   */
  getStatus(): string {
    return this.state.status;
  }

  /**
   * Get agent state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Create empty memory structure
   */
  private createEmptyMemory(): AgentMemory {
    return {
      messages: [
        {
          role: 'system',
          content: this.config.systemPrompt,
          timestamp: Date.now(),
        },
      ],
      context: {},
      shortTerm: [],
      longTerm: [],
    };
  }

  /**
   * Create task result
   */
  private createResult(
    success: boolean,
    context: NodeContext,
    iterations: number,
    startTime: number,
    errorMessage?: string
  ): TaskResult {
    const artifacts = (context.state.artifacts as TaskResult['artifacts']) ?? [];
    const output = (context.state.output as string) ?? '';

    return {
      success,
      output,
      artifacts,
      errors: errorMessage
        ? [{ code: 'TASK_ERROR', message: errorMessage, recoverable: true }]
        : [],
      metrics: {
        tokensUsed: (context.state.tokensUsed as number) ?? 0,
        latencyMs: Date.now() - startTime,
        iterations,
        toolCalls: this.state.metrics.toolCallCount,
      },
    };
  }

  /**
   * Get default next node in flow
   */
  private getDefaultNextNode(current: string): string {
    const flow: Record<string, string> = {
      decision: 'analysis',
      analysis: 'modification',
      modification: 'verification',
      verification: 'decision',
    };
    return flow[current] ?? 'decision';
  }

  /**
   * Update metrics after task completion
   */
  private updateMetrics(result: TaskResult, startTime: number): void {
    if (result.success) {
      this.state.metrics.tasksCompleted++;
    } else {
      this.state.metrics.tasksFailed++;
    }

    this.state.metrics.totalTokens += result.metrics.tokensUsed;

    // Update average latency
    const totalTasks = this.state.metrics.tasksCompleted + this.state.metrics.tasksFailed;
    const newLatency = Date.now() - startTime;
    this.state.metrics.averageLatency =
      ((totalTasks - 1) * this.state.metrics.averageLatency + newLatency) / totalTasks;
  }

  /**
   * Reset agent state
   */
  reset(): void {
    this.state.memory = this.createEmptyMemory();
    this.state.status = 'idle';
    this.state.currentTask = undefined;
  }
}
