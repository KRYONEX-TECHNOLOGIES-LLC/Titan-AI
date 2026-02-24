/**
 * THE SENTINEL COUNCIL — Dual-Sentinel Consensus Review
 *
 * Chief Sentinel (DeepSeek V3.2) + Shadow Sentinel (DeepSeek V3.2 Speciale)
 * Both review independently. Consensus required for approval.
 * Safety-first: if EITHER rejects, the code is rejected.
 */

import type { AgentMessage, SentinelVerdict, AuditLog } from '../types.js';
import type { LLMClient } from '../agents/actor.js';
import {
  PROTOCOL_ROLES,
  type ProtocolRole,
  type ProtocolCostTracker,
  type SentinelConsensus,
  type ProtocolEvent,
} from './midnight-protocol.js';
import {
  CHIEF_SENTINEL_SYSTEM_PROMPT,
  SHADOW_SENTINEL_SYSTEM_PROMPT,
  generateSentinelReviewPrompt,
} from './prompts.js';

type EventEmitter = (event: ProtocolEvent) => void;

interface SentinelResult {
  score: number;
  passed: boolean;
  feedback: string;
  auditLog: AuditLog;
  verdict: SentinelVerdict;
}

export class SentinelCouncil {
  private llmClient: LLMClient;
  private costTracker: ProtocolCostTracker;
  private qualityThreshold: number;
  private consensusRequired: boolean;
  private emit: EventEmitter;

  constructor(
    llmClient: LLMClient,
    costTracker: ProtocolCostTracker,
    qualityThreshold: number,
    consensusRequired: boolean,
    emit: EventEmitter
  ) {
    this.llmClient = llmClient;
    this.costTracker = costTracker;
    this.qualityThreshold = qualityThreshold;
    this.consensusRequired = consensusRequired;
    this.emit = emit;
  }

  async review(
    gitDiff: string,
    taskDescription: string,
    definitionOfDone: string,
    repoMap: string,
    taskId: string
  ): Promise<SentinelConsensus> {
    // Run both sentinels in parallel for speed
    const [chiefResult, shadowResult] = await Promise.all([
      this.runSentinel('chief_sentinel', CHIEF_SENTINEL_SYSTEM_PROMPT, gitDiff, taskDescription, definitionOfDone, repoMap, taskId),
      this.runSentinel('shadow_sentinel', SHADOW_SENTINEL_SYSTEM_PROMPT, gitDiff, taskDescription, definitionOfDone, repoMap, taskId),
    ]);

    const consensusReached = chiefResult.passed === shadowResult.passed;
    // Safety-first: if either rejects AND consensus is required, the whole thing fails
    const finalPassed = this.consensusRequired
      ? chiefResult.passed && shadowResult.passed
      : chiefResult.passed || shadowResult.passed;

    const combinedFeedback = this.combineFeedback(chiefResult, shadowResult);

    const consensus: SentinelConsensus = {
      chiefScore: chiefResult.score,
      chiefPassed: chiefResult.passed,
      chiefFeedback: chiefResult.feedback,
      shadowScore: shadowResult.score,
      shadowPassed: shadowResult.passed,
      shadowFeedback: shadowResult.feedback,
      consensusReached,
      finalPassed,
      combinedFeedback,
    };

    this.emit({ type: 'protocol_consensus', consensus });

    return consensus;
  }

  private async runSentinel(
    role: ProtocolRole,
    systemPrompt: string,
    gitDiff: string,
    taskDescription: string,
    definitionOfDone: string,
    repoMap: string,
    taskId: string
  ): Promise<SentinelResult> {
    const spec = PROTOCOL_ROLES[role];

    this.emit({
      type: 'protocol_squad_active',
      squad: 'sentinel_council',
      role,
      name: spec.name,
    });

    const messages: AgentMessage[] = [
      { role: 'system', content: systemPrompt, timestamp: Date.now() },
      {
        role: 'user',
        content: generateSentinelReviewPrompt(gitDiff, taskDescription, definitionOfDone, repoMap),
        timestamp: Date.now(),
      },
    ];

    const response = await this.llmClient.chat(messages, {
      model: spec.modelId,
      maxTokens: spec.maxTokens,
      effort: 'max',
    });

    this.costTracker.record(role, response.usage.promptTokens, response.usage.completionTokens);

    return this.parseVerdict(response.content, taskId, role);
  }

  private parseVerdict(raw: string, taskId: string, role: ProtocolRole): SentinelResult {
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*\}/);

    const defaultAuditLog: AuditLog = {
      traceability: { mapped: [], missing: [], unplannedAdditions: [] },
      architecturalSins: [],
      slopPatternsDetected: [],
    };

    if (!jsonMatch) {
      return {
        score: 50,
        passed: false,
        feedback: `${PROTOCOL_ROLES[role].name} could not produce structured verdict: ${raw.slice(0, 300)}`,
        auditLog: defaultAuditLog,
        verdict: this.buildVerdict(taskId, 50, false, defaultAuditLog, raw.slice(0, 500)),
      };
    }

    try {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      const score = typeof parsed.quality_score === 'number' ? parsed.quality_score : 50;
      const passed = score >= this.qualityThreshold && parsed.passed !== false;
      const auditLog: AuditLog = {
        traceability: parsed.audit_log?.traceability || defaultAuditLog.traceability,
        architecturalSins: parsed.audit_log?.architectural_sins || [],
        slopPatternsDetected: parsed.audit_log?.slop_patterns_detected || [],
      };
      const feedback = parsed.correction_directive || (passed ? 'Approved' : 'Rejected without directive');

      return {
        score,
        passed,
        feedback,
        auditLog,
        verdict: this.buildVerdict(taskId, score, passed, auditLog, feedback),
      };
    } catch {
      return {
        score: 50,
        passed: false,
        feedback: `${PROTOCOL_ROLES[role].name} produced invalid JSON verdict`,
        auditLog: defaultAuditLog,
        verdict: this.buildVerdict(taskId, 50, false, defaultAuditLog, 'Parse error'),
      };
    }
  }

  private buildVerdict(
    taskId: string,
    score: number,
    passed: boolean,
    auditLog: AuditLog,
    directive: string
  ): SentinelVerdict {
    return {
      id: `verdict-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      taskId,
      qualityScore: score,
      passed,
      thinkingEffort: 'max',
      auditLog,
      correctionDirective: passed ? null : directive,
      merkleVerificationHash: Math.abs(this.simpleHash(directive)).toString(36),
      createdAt: Date.now(),
    };
  }

  private combineFeedback(chief: SentinelResult, shadow: SentinelResult): string {
    const parts: string[] = [];

    if (!chief.passed) {
      parts.push(`CHIEF SENTINEL (Score: ${chief.score}/100):\n${chief.feedback}`);
    }
    if (!shadow.passed) {
      parts.push(`SHADOW SENTINEL (Score: ${shadow.score}/100):\n${shadow.feedback}`);
    }

    if (parts.length === 0) {
      return `APPROVED — Chief: ${chief.score}/100, Shadow: ${shadow.score}/100`;
    }

    return parts.join('\n\n---\n\n');
  }

  private simpleHash(s: string): number {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash) + s.charCodeAt(i);
      hash = hash & hash;
    }
    return hash;
  }
}
