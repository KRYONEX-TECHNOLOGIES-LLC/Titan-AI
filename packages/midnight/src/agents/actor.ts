/**
 * Project Midnight - Actor Agent
 * The Worker that executes tasks with full RWX permissions in sandbox
 */

import type {
  MidnightTask,
  TaskResult,
  TaskArtifact,
  TaskError,
  TaskMetrics,
  AgentMessage,
} from '../types.js';
import { ACTOR_SYSTEM_PROMPT, generateActorTaskPrompt } from './prompts.js';

export interface ActorConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  workspacePath: string;
  toolsEnabled: string[];
}

export interface ActorContext {
  task: MidnightTask;
  projectContext: string;
  previousAttempts: string[];
  worktreePath: string;
}

export interface LLMClient {
  chat(messages: AgentMessage[], options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    tools?: ToolDefinition[];
  }): Promise<LLMResponse>;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolExecutor {
  execute(name: string, args: Record<string, unknown>): Promise<string>;
}

export class ActorAgent {
  private config: ActorConfig;
  private llmClient: LLMClient;
  private toolExecutor: ToolExecutor;
  private messages: AgentMessage[] = [];
  private artifacts: TaskArtifact[] = [];
  private errors: TaskError[] = [];
  private metrics: TaskMetrics = {
    tokensUsed: 0,
    latencyMs: 0,
    iterations: 0,
    toolCalls: 0,
  };

  constructor(
    config: ActorConfig,
    llmClient: LLMClient,
    toolExecutor: ToolExecutor
  ) {
    this.config = config;
    this.llmClient = llmClient;
    this.toolExecutor = toolExecutor;
  }

  /**
   * Execute a task
   */
  async execute(context: ActorContext): Promise<TaskResult> {
    const startTime = Date.now();
    this.resetState();

    // Initialize with system prompt
    this.messages = [
      {
        role: 'system',
        content: ACTOR_SYSTEM_PROMPT,
        timestamp: Date.now(),
      },
      {
        role: 'user',
        content: generateActorTaskPrompt(
          context.task.description,
          context.projectContext,
          context.previousAttempts
        ),
        timestamp: Date.now(),
      },
    ];

    const maxIterations = 20;
    let completed = false;

    try {
      // Main execution loop: Code -> Run -> Fix
      for (let i = 0; i < maxIterations && !completed; i++) {
        this.metrics.iterations++;
        
        const response = await this.runIteration();
        
        // Check if task is complete
        if (this.isTaskComplete(response)) {
          completed = true;
        }
        
        // Check for blocking errors
        if (this.hasBlockingErrors()) {
          break;
        }
      }

      this.metrics.latencyMs = Date.now() - startTime;

      return {
        success: completed && this.errors.length === 0,
        output: this.getOutputSummary(),
        artifacts: this.artifacts,
        errors: this.errors,
        metrics: this.metrics,
      };
    } catch (error) {
      this.metrics.latencyMs = Date.now() - startTime;

      return {
        success: false,
        output: `Actor failed with error: ${error}`,
        artifacts: this.artifacts,
        errors: [
          {
            code: 'ACTOR_ERROR',
            message: String(error),
            recoverable: true,
          },
        ],
        metrics: this.metrics,
      };
    }
  }

  /**
   * Run a single iteration of the Code-Run-Fix loop
   */
  private async runIteration(): Promise<LLMResponse> {
    const response = await this.llmClient.chat(this.messages, {
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      tools: this.getToolDefinitions(),
    });

    this.metrics.tokensUsed += response.usage.promptTokens + response.usage.completionTokens;

    // Add assistant message
    this.messages.push({
      role: 'assistant',
      content: response.content,
      timestamp: Date.now(),
    });

    // Execute any tool calls
    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        this.metrics.toolCalls++;
        
        try {
          const result = await this.toolExecutor.execute(
            toolCall.name,
            toolCall.arguments
          );

          // Track artifacts
          this.trackArtifact(toolCall);

          // Add tool result to messages
          this.messages.push({
            role: 'tool',
            content: result,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
        } catch (error) {
          // Track error but continue
          this.errors.push({
            code: 'TOOL_ERROR',
            message: `Tool ${toolCall.name} failed: ${error}`,
            recoverable: true,
          });

          this.messages.push({
            role: 'tool',
            content: `Error: ${error}`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
        }
      }
    }

    return response;
  }

  /**
   * Get tool definitions for the LLM
   */
  private getToolDefinitions(): ToolDefinition[] {
    const allTools: ToolDefinition[] = [
      {
        name: 'read_file',
        description: 'Read the contents of a file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path relative to workspace' },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Write content to a file (creates or overwrites)',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path relative to workspace' },
            content: { type: 'string', description: 'Content to write' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'run_command',
        description: 'Execute a shell command',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Command to execute' },
            cwd: { type: 'string', description: 'Working directory (optional)' },
          },
          required: ['command'],
        },
      },
      {
        name: 'run_tests',
        description: 'Run test suite',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Test file pattern (optional)' },
          },
        },
      },
      {
        name: 'git_diff',
        description: 'Get git diff of current changes',
        parameters: {
          type: 'object',
          properties: {
            staged: { type: 'boolean', description: 'Show staged changes only' },
          },
        },
      },
      {
        name: 'git_commit',
        description: 'Stage and commit changes',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Commit message' },
            files: { type: 'array', items: { type: 'string' }, description: 'Files to stage' },
          },
          required: ['message'],
        },
      },
      {
        name: 'task_complete',
        description: 'Signal that the task is complete and ready for Sentinel review',
        parameters: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: 'Summary of changes made' },
          },
          required: ['summary'],
        },
      },
    ];

    // Filter to only enabled tools
    return allTools.filter(t => this.config.toolsEnabled.includes(t.name));
  }

  /**
   * Track an artifact from a tool call
   */
  private trackArtifact(toolCall: ToolCall): void {
    const args = toolCall.arguments;

    switch (toolCall.name) {
      case 'write_file':
        this.artifacts.push({
          type: 'file',
          path: args.path as string,
          content: args.content as string,
          action: 'modify',
        });
        break;
      case 'run_command':
        this.artifacts.push({
          type: 'command',
          content: args.command as string,
          action: 'execute',
        });
        break;
      case 'git_commit':
        this.artifacts.push({
          type: 'diff',
          content: args.message as string,
          action: 'create',
        });
        break;
      case 'run_tests':
        this.artifacts.push({
          type: 'test',
          content: args.pattern as string || 'all',
          action: 'execute',
        });
        break;
    }
  }

  /**
   * Check if the task is complete
   */
  private isTaskComplete(response: LLMResponse): boolean {
    // Check for explicit completion signal
    const hasCompleteTool = response.toolCalls?.some(
      tc => tc.name === 'task_complete'
    );

    if (hasCompleteTool) {
      return true;
    }

    // Check for completion keywords in content
    const completionKeywords = [
      'task complete',
      'implementation complete',
      'ready for review',
      'done implementing',
    ];

    const contentLower = response.content.toLowerCase();
    return completionKeywords.some(kw => contentLower.includes(kw));
  }

  /**
   * Check for blocking errors
   */
  private hasBlockingErrors(): boolean {
    const blockingErrors = this.errors.filter(e => !e.recoverable);
    return blockingErrors.length > 0;
  }

  /**
   * Get output summary
   */
  private getOutputSummary(): string {
    const lastMessages = this.messages.slice(-5);
    return lastMessages
      .map(m => `[${m.role}]: ${m.content.slice(0, 200)}...`)
      .join('\n');
  }

  /**
   * Reset state for new task
   */
  private resetState(): void {
    this.messages = [];
    this.artifacts = [];
    this.errors = [];
    this.metrics = {
      tokensUsed: 0,
      latencyMs: 0,
      iterations: 0,
      toolCalls: 0,
    };
  }

  /**
   * Get current messages (for state snapshots)
   */
  getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  /**
   * Get current artifacts
   */
  getArtifacts(): TaskArtifact[] {
    return [...this.artifacts];
  }
}

/**
 * Create a new Actor agent
 */
export function createActorAgent(
  config: ActorConfig,
  llmClient: LLMClient,
  toolExecutor: ToolExecutor
): ActorAgent {
  return new ActorAgent(config, llmClient, toolExecutor);
}

/**
 * Default Actor configuration
 */
export const DEFAULT_ACTOR_CONFIG: ActorConfig = {
  model: 'claude-4.6-sonnet',
  maxTokens: 128000,
  temperature: 0.3,
  workspacePath: '',
  toolsEnabled: [
    'read_file',
    'write_file',
    'run_command',
    'run_tests',
    'git_diff',
    'git_commit',
    'task_complete',
  ],
};
