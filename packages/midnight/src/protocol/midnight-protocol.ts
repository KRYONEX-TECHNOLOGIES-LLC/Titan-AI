/**
 * Midnight Protocol Team — Configuration & Types
 *
 * 4-squad, 8-model architecture that replaces the single Actor/Sentinel
 * with specialized cheap models exploiting each model's unique strength.
 */

// ═══════════════════════════════════════════════════════════════════════════
// ROLES
// ═══════════════════════════════════════════════════════════════════════════

export type ProtocolRole =
  | 'foreman'
  | 'alpha_nerd'
  | 'beta_nerd'
  | 'gamma_nerd'
  | 'inspector'
  | 'surgeon'
  | 'chief_sentinel'
  | 'shadow_sentinel';

export type SquadName = 'foreman' | 'nerd_squad' | 'cleanup_crew' | 'sentinel_council';

export interface RoleSpec {
  role: ProtocolRole;
  squad: SquadName;
  modelId: string;
  name: string;
  specialty: string;
  costPer1MInput: number;
  costPer1MOutput: number;
  maxTokens: number;
  temperature: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL MAP
// ═══════════════════════════════════════════════════════════════════════════

export const PROTOCOL_ROLES: Record<ProtocolRole, RoleSpec> = {
  foreman: {
    role: 'foreman',
    squad: 'foreman',
    modelId: 'deepseek/deepseek-v3.2-speciale',
    name: 'The Foreman',
    specialty: 'Project decomposition, task planning, architecture design',
    costPer1MInput: 0.27,
    costPer1MOutput: 0.41,
    maxTokens: 64000,
    temperature: 0.1,
  },
  alpha_nerd: {
    role: 'alpha_nerd',
    squad: 'nerd_squad',
    modelId: 'xiaomi/mimo-v2-flash',
    name: 'Alpha Nerd',
    specialty: '#1 SWE-Bench open-source, primary implementer',
    costPer1MInput: 0.09,
    costPer1MOutput: 0.29,
    maxTokens: 64000,
    temperature: 0.2,
  },
  beta_nerd: {
    role: 'beta_nerd',
    squad: 'nerd_squad',
    modelId: 'qwen/qwen3-coder-next',
    name: 'Beta Nerd',
    specialty: 'Coding agent specialist, tool calling, failure recovery',
    costPer1MInput: 0.12,
    costPer1MOutput: 0.75,
    maxTokens: 64000,
    temperature: 0.2,
  },
  gamma_nerd: {
    role: 'gamma_nerd',
    squad: 'nerd_squad',
    modelId: 'minimax/minimax-m2.5',
    name: 'Gamma Nerd',
    specialty: '80.2% SWE-Bench Verified, #1 Programming, heavy hitter',
    costPer1MInput: 0.30,
    costPer1MOutput: 1.10,
    maxTokens: 64000,
    temperature: 0.15,
  },
  inspector: {
    role: 'inspector',
    squad: 'cleanup_crew',
    modelId: 'google/gemini-2.5-flash',
    name: 'The Inspector',
    specialty: '1M context scanner, finds bugs/security/lint issues blazing fast',
    costPer1MInput: 0.15,
    costPer1MOutput: 0.60,
    maxTokens: 32000,
    temperature: 0.0,
  },
  surgeon: {
    role: 'surgeon',
    squad: 'cleanup_crew',
    modelId: 'xiaomi/mimo-v2-flash',
    name: 'The Surgeon',
    specialty: 'Targeted, minimal fixes with SWE-Bench precision',
    costPer1MInput: 0.09,
    costPer1MOutput: 0.29,
    maxTokens: 32000,
    temperature: 0.1,
  },
  chief_sentinel: {
    role: 'chief_sentinel',
    squad: 'sentinel_council',
    modelId: 'deepseek/deepseek-v3.2',
    name: 'Chief Sentinel',
    specialty: 'GPT-5 class reasoning, Slop Penalty Matrix enforcer',
    costPer1MInput: 0.25,
    costPer1MOutput: 0.38,
    maxTokens: 32000,
    temperature: 0.0,
  },
  shadow_sentinel: {
    role: 'shadow_sentinel',
    squad: 'sentinel_council',
    modelId: 'deepseek/deepseek-v3.2-speciale',
    name: 'Shadow Sentinel',
    specialty: 'Architecture review, hallucination detection, requirement traceability',
    costPer1MInput: 0.27,
    costPer1MOutput: 0.41,
    maxTokens: 32000,
    temperature: 0.0,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// PROTOCOL CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface MidnightProtocolConfig {
  maxNerdEscalations: number;   // Alpha → Beta → Gamma
  maxCleanupCycles: number;     // Inspector → Surgeon → re-scan
  qualityThreshold: number;     // Score >= this to pass sentinel
  consensusRequired: boolean;   // Both sentinels must agree
  enableCleanupCrew: boolean;
  enableForeman: boolean;
}

export const DEFAULT_PROTOCOL_CONFIG: MidnightProtocolConfig = {
  maxNerdEscalations: 3,
  maxCleanupCycles: 2,
  qualityThreshold: 85,
  consensusRequired: true,
  enableCleanupCrew: true,
  enableForeman: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// ESCALATION & RESULT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface EscalationRecord {
  nerdIndex: number;           // 0=Alpha, 1=Beta, 2=Gamma
  role: ProtocolRole;
  attempt: string;             // Output from this attempt
  feedback: string;            // Sentinel/cleanup feedback
  tokensUsed: number;
  costUsd: number;
}

export interface CleanupFinding {
  severity: 'critical' | 'major' | 'minor';
  category: 'bug' | 'security' | 'lint' | 'dead_code' | 'type_error' | 'missing_error_handling';
  file: string;
  line?: number;
  description: string;
  suggestedFix: string;
}

export interface CleanupReport {
  findings: CleanupFinding[];
  fixesApplied: number;
  fixesFailed: number;
  cyclesRun: number;
}

export interface SentinelConsensus {
  chiefScore: number;
  chiefPassed: boolean;
  chiefFeedback: string;
  shadowScore: number;
  shadowPassed: boolean;
  shadowFeedback: string;
  consensusReached: boolean;
  finalPassed: boolean;
  combinedFeedback: string;
}

export interface ProtocolTaskResult {
  success: boolean;
  escalations: EscalationRecord[];
  cleanupReport: CleanupReport | null;
  consensus: SentinelConsensus | null;
  totalTokensUsed: number;
  totalCostUsd: number;
  activeNerd: ProtocolRole;
  output: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COST TRACKER
// ═══════════════════════════════════════════════════════════════════════════

export class ProtocolCostTracker {
  private entries: Array<{ role: ProtocolRole; inputTokens: number; outputTokens: number; costUsd: number }> = [];

  record(role: ProtocolRole, inputTokens: number, outputTokens: number): number {
    const spec = PROTOCOL_ROLES[role];
    const cost = (inputTokens / 1_000_000) * spec.costPer1MInput +
                 (outputTokens / 1_000_000) * spec.costPer1MOutput;
    this.entries.push({ role, inputTokens, outputTokens, costUsd: cost });
    return cost;
  }

  get totalCost(): number {
    return this.entries.reduce((sum, e) => sum + e.costUsd, 0);
  }

  get totalTokens(): number {
    return this.entries.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0);
  }

  get breakdown(): Record<SquadName, number> {
    const result: Record<SquadName, number> = { foreman: 0, nerd_squad: 0, cleanup_crew: 0, sentinel_council: 0 };
    for (const e of this.entries) {
      result[PROTOCOL_ROLES[e.role].squad] += e.costUsd;
    }
    return result;
  }

  reset(): void {
    this.entries = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PROTOCOL EVENTS (extends MidnightEvent)
// ═══════════════════════════════════════════════════════════════════════════

export type ProtocolEvent =
  | { type: 'protocol_squad_active'; squad: SquadName; role: ProtocolRole; name: string }
  | { type: 'protocol_escalation'; from: ProtocolRole; to: ProtocolRole; reason: string }
  | { type: 'protocol_cleanup_finding'; finding: CleanupFinding }
  | { type: 'protocol_cleanup_fixed'; finding: CleanupFinding }
  | { type: 'protocol_consensus'; consensus: SentinelConsensus }
  | { type: 'protocol_cost_update'; totalCostUsd: number; breakdown: Record<SquadName, number> }
  | { type: 'protocol_task_complete'; result: ProtocolTaskResult };

export const NERD_ESCALATION_ORDER: ProtocolRole[] = ['alpha_nerd', 'beta_nerd', 'gamma_nerd'];
