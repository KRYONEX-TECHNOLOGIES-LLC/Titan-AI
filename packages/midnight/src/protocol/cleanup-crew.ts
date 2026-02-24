/**
 * THE CLEANUP CREW — Inspector + Surgeon Double-Check Loop
 *
 * Inspector (Gemini 2.5 Flash, 1M context) scans for issues →
 * Surgeon (MiMo-V2-Flash) applies targeted fixes →
 * Inspector re-scans to verify (max 2 cycles)
 */

import type { AgentMessage } from '../types.js';
import type { LLMClient, ToolExecutor } from '../agents/actor.js';
import {
  PROTOCOL_ROLES,
  type ProtocolCostTracker,
  type CleanupFinding,
  type CleanupReport,
  type ProtocolEvent,
} from './midnight-protocol.js';
import {
  INSPECTOR_SYSTEM_PROMPT,
  SURGEON_SYSTEM_PROMPT,
  generateInspectorPrompt,
  generateSurgeonPrompt,
} from './prompts.js';

type EventEmitter = (event: ProtocolEvent) => void;

export class CleanupCrew {
  private llmClient: LLMClient;
  private toolExecutor: ToolExecutor;
  private costTracker: ProtocolCostTracker;
  private maxCycles: number;
  private emit: EventEmitter;

  constructor(
    llmClient: LLMClient,
    toolExecutor: ToolExecutor,
    costTracker: ProtocolCostTracker,
    maxCycles: number,
    emit: EventEmitter
  ) {
    this.llmClient = llmClient;
    this.toolExecutor = toolExecutor;
    this.costTracker = costTracker;
    this.maxCycles = maxCycles;
    this.emit = emit;
  }

  async sweep(gitDiff: string, repoMap: string): Promise<CleanupReport> {
    let totalFixesApplied = 0;
    let totalFixesFailed = 0;

    for (let cycle = 0; cycle < this.maxCycles; cycle++) {
      // ─── INSPECTOR PHASE ───
      this.emit({
        type: 'protocol_squad_active',
        squad: 'cleanup_crew',
        role: 'inspector',
        name: PROTOCOL_ROLES.inspector.name,
      });

      const findings = await this.inspect(gitDiff, repoMap);

      if (findings.length === 0) {
        return {
          findings: [],
          fixesApplied: totalFixesApplied,
          fixesFailed: totalFixesFailed,
          cyclesRun: cycle + 1,
        };
      }

      for (const f of findings) {
        this.emit({ type: 'protocol_cleanup_finding', finding: f });
      }

      // ─── SURGEON PHASE ───
      this.emit({
        type: 'protocol_squad_active',
        squad: 'cleanup_crew',
        role: 'surgeon',
        name: PROTOCOL_ROLES.surgeon.name,
      });

      const { applied, failed } = await this.operate(gitDiff, findings);
      totalFixesApplied += applied;
      totalFixesFailed += failed;

      // Re-read diff for next cycle verification
      try {
        const diffResult = await this.toolExecutor.execute('git_diff', {});
        gitDiff = diffResult;
      } catch {
        break;
      }
    }

    // Final inspection after all cycles
    const remainingFindings = await this.inspect(gitDiff, repoMap);

    return {
      findings: remainingFindings,
      fixesApplied: totalFixesApplied,
      fixesFailed: totalFixesFailed,
      cyclesRun: this.maxCycles,
    };
  }

  private async inspect(gitDiff: string, repoMap: string): Promise<CleanupFinding[]> {
    const spec = PROTOCOL_ROLES.inspector;

    const messages: AgentMessage[] = [
      { role: 'system', content: INSPECTOR_SYSTEM_PROMPT, timestamp: Date.now() },
      { role: 'user', content: generateInspectorPrompt(gitDiff, repoMap), timestamp: Date.now() },
    ];

    const response = await this.llmClient.chat(messages, {
      model: spec.modelId,
      maxTokens: spec.maxTokens,
      temperature: spec.temperature,
    });

    this.costTracker.record('inspector', response.usage.promptTokens, response.usage.completionTokens);

    return this.parseInspectorFindings(response.content);
  }

  private async operate(
    gitDiff: string,
    findings: CleanupFinding[]
  ): Promise<{ applied: number; failed: number }> {
    const spec = PROTOCOL_ROLES.surgeon;
    let applied = 0;
    let failed = 0;

    const messages: AgentMessage[] = [
      { role: 'system', content: SURGEON_SYSTEM_PROMPT, timestamp: Date.now() },
      { role: 'user', content: generateSurgeonPrompt(gitDiff, findings), timestamp: Date.now() },
    ];

    const response = await this.llmClient.chat(messages, {
      model: spec.modelId,
      maxTokens: spec.maxTokens,
      temperature: spec.temperature,
      tools: [
        { name: 'write_file', description: 'Write content to a file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
        { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      ],
    });

    this.costTracker.record('surgeon', response.usage.promptTokens, response.usage.completionTokens);

    if (response.toolCalls) {
      for (const tc of response.toolCalls) {
        try {
          await this.toolExecutor.execute(tc.name, tc.arguments);
          if (tc.name === 'write_file') applied++;
        } catch {
          failed++;
        }
      }
    }

    // Mark successful fixes
    for (let i = 0; i < Math.min(applied, findings.length); i++) {
      this.emit({ type: 'protocol_cleanup_fixed', finding: findings[i] });
    }

    return { applied, failed };
  }

  private parseInspectorFindings(raw: string): CleanupFinding[] {
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    try {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      const findings = parsed.findings || [];
      if (parsed.overallAssessment === 'clean' || findings.length === 0) return [];

      return findings.map((f: Record<string, unknown>) => ({
        severity: (f.severity as string) || 'minor',
        category: (f.category as string) || 'lint',
        file: (f.file as string) || 'unknown',
        line: f.line as number | undefined,
        description: (f.description as string) || '',
        suggestedFix: (f.suggestedFix as string) || '',
      }));
    } catch {
      return [];
    }
  }
}
