/**
 * Project Midnight - Sentinel Agent
 * The Critic that operates in READ-ONLY mode with adaptive thinking
 */

import type {
  MidnightTask,
  SentinelVerdict,
  AuditLog,
  AgentMessage,
} from '../types.js';
import {
  SENTINEL_ELITE_SYSTEM_PROMPT,
  generateSentinelVerificationPrompt,
  parseSentinelVerdict,
} from './prompts.js';
import CryptoJS from 'crypto-js';

export interface SentinelConfig {
  model: string;
  maxTokens: number;
  effort: 'low' | 'medium' | 'high' | 'max';
  qualityThreshold: number;
}

export interface SentinelContext {
  task: MidnightTask;
  gitDiff: string;
  projectPlan: string;
  definitionOfDone: string;
  repoMap: string;
  previousVerdicts: SentinelVerdict[];
}

export interface LLMClient {
  chat(messages: AgentMessage[], options?: {
    model?: string;
    maxTokens?: number;
    effort?: 'low' | 'medium' | 'high' | 'max';
  }): Promise<LLMResponse>;
}

export interface LLMResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

export class SentinelAgent {
  private config: SentinelConfig;
  private llmClient: LLMClient;
  private verificationCount = 0;
  private vetoCount = 0;
  private qualityScores: number[] = [];

  constructor(config: SentinelConfig, llmClient: LLMClient) {
    this.config = config;
    this.llmClient = llmClient;
  }

  /**
   * Verify a task's implementation
   */
  async verify(context: SentinelContext): Promise<SentinelVerdict> {
    this.verificationCount++;

    const messages: AgentMessage[] = [
      {
        role: 'system',
        content: SENTINEL_ELITE_SYSTEM_PROMPT,
        timestamp: Date.now(),
      },
      {
        role: 'user',
        content: generateSentinelVerificationPrompt(
          context.gitDiff,
          context.projectPlan,
          context.definitionOfDone,
          context.repoMap
        ),
        timestamp: Date.now(),
      },
    ];

    // Add context from previous verdicts if this is a retry
    if (context.previousVerdicts.length > 0) {
      const lastVerdict = context.previousVerdicts[context.previousVerdicts.length - 1];
      messages.push({
        role: 'user',
        content: `## PREVIOUS VERDICT
The Actor attempted this task before and failed.

Quality Score: ${lastVerdict.qualityScore}
Correction Directive: ${lastVerdict.correctionDirective}

Verify that the Actor has addressed ALL previous feedback.
If they ignored your correction directive, add -30 for "Ignoring Feedback" and VETO.
`,
        timestamp: Date.now(),
      });
    }

    // Call LLM with adaptive thinking at max effort
    const response = await this.llmClient.chat(messages, {
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      effort: this.config.effort,
    });

    // Parse verdict from response
    const verdictOutput = parseSentinelVerdict(response.content);

    if (!verdictOutput) {
      // Failed to parse - default to fail
      return this.createFailedVerdict(
        context.task.id,
        'Failed to parse Sentinel response. Manual review required.',
        context.gitDiff
      );
    }

    // Track statistics
    this.qualityScores.push(verdictOutput.quality_score);
    if (!verdictOutput.passed) {
      this.vetoCount++;
    }

    // Create verdict
    const verdict: SentinelVerdict = {
      id: `verdict-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      taskId: context.task.id,
      qualityScore: verdictOutput.quality_score,
      passed: verdictOutput.passed && verdictOutput.quality_score >= this.config.qualityThreshold,
      thinkingEffort: 'max',
      auditLog: {
        traceability: verdictOutput.audit_log.traceability,
        architecturalSins: verdictOutput.audit_log.architectural_sins,
        slopPatternsDetected: verdictOutput.audit_log.slop_patterns_detected,
      },
      correctionDirective: verdictOutput.passed ? null : verdictOutput.correction_directive,
      merkleVerificationHash: this.computeMerkleHash(context.gitDiff),
      createdAt: Date.now(),
    };

    return verdict;
  }

  /**
   * Check for VETO conditions (automatic fail regardless of score)
   */
  checkVetoConditions(context: SentinelContext): string[] {
    const violations: string[] = [];

    const diffLower = context.gitDiff.toLowerCase();

    // Check for hardcoded secrets
    const secretPatterns = [
      /api[_-]?key\s*[:=]\s*['"][^'"]{20,}['"]/i,
      /secret\s*[:=]\s*['"][^'"]{10,}['"]/i,
      /password\s*[:=]\s*['"][^'"]+['"]/i,
      /bearer\s+[a-zA-Z0-9\-_.]{20,}/i,
      /sk-[a-zA-Z0-9]{40,}/,  // OpenAI key pattern
      /ghp_[a-zA-Z0-9]{36}/,  // GitHub token pattern
    ];

    for (const pattern of secretPatterns) {
      if (pattern.test(context.gitDiff)) {
        violations.push('VETO: Hardcoded secret or API key detected');
        break;
      }
    }

    // Check for infinite loops
    if (diffLower.includes('while(true)') || diffLower.includes('for(;;)')) {
      violations.push('VETO: Potential infinite loop detected');
    }

    // Check for unbounded recursion without base case
    const recursivePatterns = [
      /function\s+(\w+)[^}]*\1\s*\([^}]*$/m,
    ];
    for (const pattern of recursivePatterns) {
      if (pattern.test(context.gitDiff) && !context.gitDiff.includes('return')) {
        violations.push('VETO: Unbounded recursion without clear base case');
        break;
      }
    }

    // Check for SQL injection vulnerabilities
    if (/`.*\$\{.*\}.*`.*query|execute/i.test(context.gitDiff)) {
      violations.push('VETO: Potential SQL injection vulnerability');
    }

    return violations;
  }

  /**
   * Compute Merkle hash for verification
   */
  private computeMerkleHash(gitDiff: string): string {
    const hash = CryptoJS.SHA256(gitDiff);
    return hash.toString(CryptoJS.enc.Hex).slice(0, 16);
  }

  /**
   * Create a failed verdict
   */
  private createFailedVerdict(
    taskId: string,
    reason: string,
    gitDiff: string
  ): SentinelVerdict {
    return {
      id: `verdict-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      taskId,
      qualityScore: 0,
      passed: false,
      thinkingEffort: 'max',
      auditLog: {
        traceability: { mapped: [], missing: [], unplannedAdditions: [] },
        architecturalSins: ['Parse error'],
        slopPatternsDetected: [],
      },
      correctionDirective: reason,
      merkleVerificationHash: this.computeMerkleHash(gitDiff),
      createdAt: Date.now(),
    };
  }

  /**
   * Get Sentinel statistics
   */
  getStats(): {
    verificationCount: number;
    vetoCount: number;
    averageQualityScore: number;
  } {
    const avg = this.qualityScores.length > 0
      ? this.qualityScores.reduce((a, b) => a + b, 0) / this.qualityScores.length
      : 100;

    return {
      verificationCount: this.verificationCount,
      vetoCount: this.vetoCount,
      averageQualityScore: Math.round(avg * 100) / 100,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.verificationCount = 0;
    this.vetoCount = 0;
    this.qualityScores = [];
  }

  /**
   * Generate a Correction Directive using Socratic questioning
   */
  generateCorrectionDirective(auditLog: AuditLog): string {
    const questions: string[] = [];

    // Traceability issues
    if (auditLog.traceability.missing.length > 0) {
      questions.push(
        `The following requirements are not addressed: ${auditLog.traceability.missing.join(', ')}. ` +
        `Which part of the definition_of_done did you believe covered these?`
      );
    }

    if (auditLog.traceability.unplannedAdditions.length > 0) {
      questions.push(
        `You added features not in the spec: ${auditLog.traceability.unplannedAdditions.join(', ')}. ` +
        `Why did you believe these were necessary?`
      );
    }

    // Architectural sins
    for (const sin of auditLog.architecturalSins) {
      if (sin.includes('deep nesting')) {
        questions.push(
          `Your code has deep nesting. How would you refactor to use guard clauses or early returns?`
        );
      }
      if (sin.includes('monolithic')) {
        questions.push(
          `The function is over 60 lines. What sub-functions could you extract to give each a single responsibility?`
        );
      }
      if (sin.includes('error handling')) {
        questions.push(
          `There are unhandled error paths. What happens when this fails? How should the system recover?`
        );
      }
    }

    // Slop patterns
    for (const slop of auditLog.slopPatternsDetected) {
      if (slop.includes('TODO')) {
        questions.push(
          `You left TODO comments. Why wasn't this work completed before submission?`
        );
      }
      if (slop.includes('console.log')) {
        questions.push(
          `Debugging statements were left in the code. What's your pre-submission checklist?`
        );
      }
      if (slop.includes('unused import')) {
        questions.push(
          `There are unused imports. What tool could catch these before submission?`
        );
      }
    }

    if (questions.length === 0) {
      questions.push('Review your implementation against the quality standards and try again.');
    }

    return questions.join('\n\n');
  }
}

/**
 * Create a new Sentinel agent
 */
export function createSentinelAgent(
  config: SentinelConfig,
  llmClient: LLMClient
): SentinelAgent {
  return new SentinelAgent(config, llmClient);
}

/**
 * Default Sentinel configuration
 */
export const DEFAULT_SENTINEL_CONFIG: SentinelConfig = {
  model: 'claude-4.6-opus',
  maxTokens: 32000,
  effort: 'max',
  qualityThreshold: 85,
};
