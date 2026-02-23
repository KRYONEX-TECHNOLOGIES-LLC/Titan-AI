export type RiskLevel = 'low' | 'medium' | 'high';

export type WorkOrderStatus =
  | 'PENDING'
  | 'SCAFFOLDED'
  | 'DISPATCHED'
  | 'WORKING'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'REJECTED'
  | 'REWORKING'
  | 'ESCALATED'
  | 'STAGED'
  | 'EXECUTING'
  | 'COMPLETE'
  | 'FAILED';

export interface InputContract {
  requiredFiles: string[];
  requiredContext: string[];
  preloadedContent?: Record<string, string>;
}

export interface OutputContract {
  expectedArtifacts: string[];
  expectedFiles: string[];
  mustNotModify?: string[];
}

export interface WorkOrder {
  id: string;
  taskDescription: string;
  inputContract: InputContract;
  outputContract: OutputContract;
  acceptanceCriteria: string[];
  predictedRisk: RiskLevel;
  dependencies: string[];
  assignedModel?: string;
  status: WorkOrderStatus;
  reworkCount?: number;
}

export interface WorkOrderDAG {
  manifestId: string;
  goal: string;
  nodes: Map<string, WorkOrder>;
  edges: Array<{ from: string; to: string }>;
  createdAt: number;
}

export type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'other';

export type ASTOperation =
  | { type: 'insert_import'; module: string; specifiers: string[] }
  | { type: 'add_function'; name: string; code: string; position: 'before' | 'after'; anchor?: string }
  | { type: 'modify_function'; name: string; newBody: string }
  | { type: 'add_class_method'; className: string; methodName: string; code: string }
  | { type: 'replace_block'; startLine: number; endLine: number; newCode: string }
  | { type: 'create_file'; content: string }
  | { type: 'delete_lines'; startLine: number; endLine: number }
  | { type: 'wrap_in_try_catch'; functionName: string }
  | { type: 'add_type_annotation'; target: string; typeStr: string }
  | { type: 'raw_edit'; oldString: string; newString: string };

export interface ASTModification {
  filePath: string;
  language: SupportedLanguage;
  operations: ASTOperation[];
  rawFallback?: { oldString: string; newString: string };
}

export interface ToolCallLogEntry {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  success: boolean;
  result: string;
  startedAt: number;
  finishedAt: number;
}

export interface EvidencePackage {
  workOrderId: string;
  modifications: ASTModification[];
  assumptions: string[];
  edgeCasesHandled: string[];
  selfAssessment: string;
  filesRead: string[];
  toolCallLog: ToolCallLogEntry[];
}

export interface FailedCheck {
  category: 'static' | 'dynamic' | 'semantic';
  checkName: string;
  expected: string;
  actual: string;
  evidence: string;
}

export interface RejectionMemo {
  workOrderId: string;
  verdict: 'FAIL';
  rootCause: string;
  failedChecks: FailedCheck[];
  actionableRecommendation: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
}

export interface VerificationResult {
  workOrderId: string;
  verdict: 'PASS';
  staticAnalysis: {
    lintPassed: boolean;
    typeCheckPassed: boolean;
    complexityScore: number;
    securityIssues: string[];
  };
  dynamicAnalysis: {
    testsGenerated: number;
    testsPassed: number;
    testsFailed: number;
    failedTestDetails?: string[];
  };
  semanticValidation: { intentMet: boolean; rationale: string };
  stagedModifications: ASTModification[];
}

export interface ExecutionStep {
  stepId: string;
  tool: 'create_file' | 'edit_file' | 'delete_file' | 'run_command';
  args: Record<string, unknown>;
  sourceWorkOrderId: string;
  rationale: string;
}

export interface SignedExecutionPlan {
  planId: string;
  manifestId: string;
  signature: string;
  createdBy: 'architect';
  steps: ExecutionStep[];
  totalFilesAffected: number;
  estimatedToolCalls: number;
}

export interface ProjectAutopsy {
  projectName: string;
  projectType: 'node' | 'python' | 'monorepo' | 'mixed' | 'unknown';
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry';
  entryPoints: string[];
  keyFiles: Record<string, string>;
  directoryStructure: string;
  dependencies: string[];
  devDependencies: string[];
  testFramework?: string;
  testCommand?: string;
  buildCommand?: string;
  lintCommand?: string;
  typeCheckCommand?: string;
  conventions: string[];
}

export interface OmegaConfig {
  architectModel: string;
  sentinelModel: string;
  operatorModel: string;
  specialistModels: {
    lowRisk: string;
    mediumRisk: string;
    highRisk: string;
  };
  maxConcurrentSpecialists: number;
  maxReworkAttempts: number;
  maxDAGNodes: number;
  laneTimeoutMs: number;
  enableAST: boolean;
  enableDynamicTests: boolean;
  enableIntegrationTest: boolean;
  tokenBudget: { perRequest: number; daily: number };
  stepBudget: { maxTotalSteps: number; warningAt: number };
}

export const DEFAULT_OMEGA_CONFIG: OmegaConfig = {
  // TITAN OMEGA COST ARCHITECTURE:
  // Architect uses Qwen3.5-Plus ($0.40/$2.40) — 1M context, frontier reasoning, 37x cheaper than Opus.
  // Sentinel uses DeepSeek-Reasoner ($0.55/$2.19) — chain-of-thought verification catches regressions.
  // Operator uses DeepSeek-Reasoner ($0.55/$2.19) — structured planning with visible reasoning trace.
  // Low-risk specialist uses Gemini 2.0 Flash ($0.075/$0.30) — trivial edits, formatting, docs.
  // Medium-risk specialist uses Qwen3-Coder-Next ($0.12/$0.75) — standard feature implementation.
  // High-risk specialist uses Qwen3.5-Plus ($0.40/$2.40) — complex logic, security-sensitive code.
  //   Previously used Opus ($15/$75) for high-risk — now 37x cheaper with equivalent reasoning depth.
  architectModel: 'qwen3.5-plus-02-15',
  sentinelModel: 'deepseek-r1',
  operatorModel: 'deepseek-r1',
  specialistModels: {
    lowRisk: 'gemini-2.0-flash',
    mediumRisk: 'qwen3-coder-next',
    highRisk: 'qwen3.5-plus-02-15',
  },
  maxConcurrentSpecialists: 4,
  maxReworkAttempts: 2,
  maxDAGNodes: 12,
  laneTimeoutMs: 300_000,
  enableAST: true,
  enableDynamicTests: true,
  enableIntegrationTest: true,
  tokenBudget: { perRequest: 800_000, daily: 15_000_000 },
  stepBudget: { maxTotalSteps: 150, warningAt: 100 },
};

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export type ToolCallFn = (
  tool: string,
  args: Record<string, unknown>,
) => Promise<ToolResult>;

export type InvokeModelFn = (
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
) => Promise<string>;

export interface OmegaEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface OmegaCallbacks {
  onEvent: (type: string, payload: Record<string, unknown>) => void;
  executeToolCall: ToolCallFn;
  invokeModel: InvokeModelFn;
}

export interface ExecutionStepResult {
  stepId: string;
  tool: string;
  success: boolean;
  output: string;
  error?: string;
}

export interface ExecutionResult {
  success: boolean;
  stepsExecuted: number;
  failedStepId?: string;
  results: ExecutionStepResult[];
}

export interface IntegrationTestResult {
  success: boolean;
  command: string;
  output: string;
  testsPassed?: number;
  testsFailed?: number;
}

export interface OmegaResult {
  success: boolean;
  manifestId: string;
  workOrdersTotal: number;
  workOrdersVerified: number;
  workOrdersFailed: number;
  planStepCount: number;
  execution: ExecutionResult;
  integrationTest?: IntegrationTestResult;
  summary: string;
}
