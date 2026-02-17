/**
 * Titan AI Router - Frontier Router
 * Intelligent model selection based on task complexity
 */

import type { ModelDefinition, Message } from '@titan/ai-gateway';
import { MODEL_REGISTRY } from '@titan/ai-gateway';
import type {
  RouterConfig,
  RoutingDecision,
  TaskAnalysis,
  TaskComplexity,
  TaskType,
} from './types.js';
import { CascadeLogic } from './cascade-logic.js';
import { CostOptimizer } from './cost-optimizer.js';

export class FrontierRouter {
  private config: RouterConfig;
  private cascade: CascadeLogic;
  private costOptimizer: CostOptimizer;

  constructor(config: RouterConfig) {
    this.config = config;
    this.cascade = new CascadeLogic(config.cascade);
    this.costOptimizer = new CostOptimizer({
      budget: config.costBudget,
    });
  }

  /**
   * Route a request to the optimal model
   */
  route(messages: Message[], taskType?: TaskType): RoutingDecision {
    // Analyze the task
    const analysis = this.analyzeTask(messages, taskType);

    // Check cost budget
    const budgetCheck = this.costOptimizer.checkBudget(analysis);
    if (!budgetCheck.allowed) {
      return this.createEconomyFallback(analysis, budgetCheck.reason);
    }

    // Get model from cascade
    const model = this.cascade.selectModel(analysis);

    // Check for local preference
    if (this.config.preferLocal && this.canUseLocal(analysis)) {
      const localModel = this.getLocalModel();
      if (localModel) {
        return this.createDecision(localModel, analysis, 'Local preference enabled');
      }
    }

    // Check for speed preference
    if (this.config.preferSpeed && analysis.complexity !== 'frontier') {
      const fastModel = this.getFastestModel(analysis);
      if (fastModel) {
        return this.createDecision(fastModel, analysis, 'Speed preference enabled');
      }
    }

    return this.createDecision(model, analysis, this.getRoutingReason(analysis));
  }

  /**
   * Analyze task complexity and requirements
   */
  analyzeTask(messages: Message[], providedType?: TaskType): TaskAnalysis {
    const lastMessage = messages[messages.length - 1];
    const content = this.extractContent(lastMessage);

    // Estimate tokens
    const inputTokens = this.estimateTokens(messages);
    const outputTokens = this.estimateOutputTokens(content, providedType);

    // Detect task type
    const taskType = providedType ?? this.detectTaskType(content);

    // Analyze complexity
    const complexity = this.analyzeComplexity(content, taskType, inputTokens);

    // Check requirements
    const requiresVision = this.hasImages(messages);
    const requiresTools = this.requiresTools(content);
    const requiresThinking = this.requiresThinking(taskType, complexity);
    const requiresLargeContext = inputTokens > 32000;

    return {
      complexity,
      type: taskType,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      requiresVision,
      requiresTools,
      requiresThinking,
      requiresLargeContext,
      contextTokens: inputTokens,
    };
  }

  /**
   * Detect task type from content
   */
  private detectTaskType(content: string): TaskType {
    const lower = content.toLowerCase();

    if (lower.includes('complete') || lower.includes('finish this')) {
      return 'completion';
    }
    if (lower.includes('refactor') || lower.includes('improve')) {
      return 'refactor';
    }
    if (lower.includes('debug') || lower.includes('fix this error') || lower.includes('why is this')) {
      return 'debug';
    }
    if (lower.includes('explain') || lower.includes('what does') || lower.includes('how does')) {
      return 'explain';
    }
    if (lower.includes('test') || lower.includes('unit test') || lower.includes('write tests')) {
      return 'test';
    }
    if (lower.includes('document') || lower.includes('jsdoc') || lower.includes('readme')) {
      return 'documentation';
    }
    if (lower.includes('security') || lower.includes('vulnerability') || lower.includes('audit')) {
      return 'security-review';
    }
    if (lower.includes('architect') || lower.includes('design') || lower.includes('plan')) {
      return 'architecture';
    }
    if (lower.includes('step by step') || lower.includes('multiple files') || lower.includes('entire')) {
      return 'long-horizon';
    }
    if (lower.includes('edit') || lower.includes('change') || lower.includes('modify')) {
      return 'edit';
    }

    return 'chat';
  }

  /**
   * Analyze task complexity
   */
  private analyzeComplexity(content: string, taskType: TaskType, tokens: number): TaskComplexity {
    // Task type complexity mapping
    const typeComplexity: Record<TaskType, number> = {
      completion: 1,
      chat: 2,
      explain: 2,
      documentation: 2,
      edit: 3,
      test: 3,
      debug: 4,
      refactor: 4,
      'security-review': 5,
      architecture: 5,
      'long-horizon': 5,
    };

    let score = typeComplexity[taskType];

    // Token-based adjustments
    if (tokens > 50000) score += 2;
    else if (tokens > 20000) score += 1;

    // Content-based adjustments
    if (content.includes('```') && content.split('```').length > 4) score += 1;
    if (content.length > 5000) score += 1;
    if (content.includes('entire codebase') || content.includes('all files')) score += 2;

    // Map to complexity level
    if (score <= 1) return 'trivial';
    if (score <= 2) return 'simple';
    if (score <= 3) return 'moderate';
    if (score <= 4) return 'complex';
    return 'frontier';
  }

  /**
   * Estimate token count for messages
   */
  private estimateTokens(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      const content = this.extractContent(msg);
      // Rough estimate: ~4 chars per token
      total += Math.ceil(content.length / 4);
    }
    return total;
  }

  /**
   * Estimate output tokens
   */
  private estimateOutputTokens(content: string, taskType?: TaskType): number {
    const baseEstimates: Record<TaskType, number> = {
      completion: 200,
      chat: 500,
      edit: 1000,
      explain: 800,
      refactor: 2000,
      debug: 1500,
      test: 2500,
      documentation: 1500,
      'security-review': 2000,
      architecture: 3000,
      'long-horizon': 5000,
    };

    const base = baseEstimates[taskType ?? 'chat'];

    // Scale based on input complexity
    if (content.length > 10000) return base * 2;
    if (content.length > 5000) return base * 1.5;

    return base;
  }

  /**
   * Extract text content from message
   */
  private extractContent(message: Message): string {
    if (typeof message.content === 'string') {
      return message.content;
    }
    return message.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join(' ');
  }

  /**
   * Check if messages contain images
   */
  private hasImages(messages: Message[]): boolean {
    return messages.some(msg => {
      if (typeof msg.content === 'string') return false;
      return msg.content.some(c => c.type === 'image');
    });
  }

  /**
   * Check if task requires tool use
   */
  private requiresTools(content: string): boolean {
    const toolKeywords = [
      'search', 'find', 'grep', 'file', 'directory',
      'run', 'execute', 'terminal', 'command',
      'browse', 'web', 'fetch'
    ];
    const lower = content.toLowerCase();
    return toolKeywords.some(k => lower.includes(k));
  }

  /**
   * Check if task requires thinking mode
   */
  private requiresThinking(taskType: TaskType, complexity: TaskComplexity): boolean {
    const thinkingTasks: TaskType[] = ['architecture', 'long-horizon', 'security-review'];
    const thinkingComplexities: TaskComplexity[] = ['complex', 'frontier'];

    return thinkingTasks.includes(taskType) || thinkingComplexities.includes(complexity);
  }

  /**
   * Check if local model can handle the task
   */
  private canUseLocal(analysis: TaskAnalysis): boolean {
    if (analysis.requiresVision) return false;
    if (analysis.requiresThinking) return false;
    if (analysis.complexity === 'frontier') return false;
    if (analysis.contextTokens > 32000) return false;
    return true;
  }

  /**
   * Get local model
   */
  private getLocalModel(): ModelDefinition | undefined {
    return MODEL_REGISTRY.find(m => m.provider === 'ollama' && m.supportsTools);
  }

  /**
   * Get fastest model for task
   */
  private getFastestModel(analysis: TaskAnalysis): ModelDefinition | undefined {
    const candidates = MODEL_REGISTRY.filter(m => {
      if (analysis.requiresVision && !m.supportsVision) return false;
      if (analysis.requiresTools && !m.supportsTools) return false;
      if (analysis.contextTokens > m.contextWindow) return false;
      return true;
    });

    // Prefer economy tier for speed
    return candidates.find(m => m.tier === 'economy');
  }

  /**
   * Create routing decision
   */
  private createDecision(
    model: ModelDefinition,
    analysis: TaskAnalysis,
    reason: string
  ): RoutingDecision {
    const estimatedCost = this.costOptimizer.estimateCost(
      model,
      analysis.estimatedInputTokens,
      analysis.estimatedOutputTokens
    );

    const fallbacks = this.cascade.getFallbacks(model, analysis);

    return {
      model,
      provider: model.provider,
      reason,
      estimatedCost,
      estimatedLatency: this.estimateLatency(model, analysis),
      fallbacks,
      confidence: this.calculateConfidence(model, analysis),
    };
  }

  /**
   * Create economy fallback decision
   */
  private createEconomyFallback(
    analysis: TaskAnalysis,
    reason: string
  ): RoutingDecision {
    const model = this.config.cascade.economy;
    return this.createDecision(model, analysis, `Budget constraint: ${reason}`);
  }

  /**
   * Get routing reason
   */
  private getRoutingReason(analysis: TaskAnalysis): string {
    if (analysis.complexity === 'frontier') {
      return 'Frontier-level task requiring advanced reasoning';
    }
    if (analysis.requiresThinking) {
      return 'Task requires extended thinking mode';
    }
    if (analysis.requiresLargeContext) {
      return 'Large context window required';
    }
    if (analysis.type === 'security-review') {
      return 'Security analysis requires thorough reasoning';
    }
    if (analysis.type === 'architecture') {
      return 'Architecture planning requires high-capability model';
    }

    return `${analysis.complexity} complexity ${analysis.type} task`;
  }

  /**
   * Estimate latency
   */
  private estimateLatency(model: ModelDefinition, analysis: TaskAnalysis): number {
    // Base latency per tier (ms)
    const tierLatency: Record<string, number> = {
      frontier: 5000,
      standard: 2000,
      economy: 1000,
      local: 3000,
    };

    let base = tierLatency[model.tier] ?? 2000;

    // Add time for token generation
    base += analysis.estimatedOutputTokens * 10; // ~100 tokens/sec

    return base;
  }

  /**
   * Calculate routing confidence
   */
  private calculateConfidence(model: ModelDefinition, analysis: TaskAnalysis): number {
    let confidence = 0.8;

    // Higher confidence for matched capabilities
    if (analysis.requiresVision && model.supportsVision) confidence += 0.05;
    if (analysis.requiresTools && model.supportsTools) confidence += 0.05;
    if (analysis.requiresThinking && model.supportsThinking) confidence += 0.1;

    // Adjust for context fit
    if (analysis.contextTokens < model.contextWindow * 0.5) confidence += 0.05;

    return Math.min(confidence, 1.0);
  }
}
