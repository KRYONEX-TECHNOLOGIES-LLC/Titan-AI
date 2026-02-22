# Omega Protocol Schemas

This document is the canonical schema reference for Titan Omega Protocol planning and execution.
All definitions are aligned to `apps/web/src/lib/omega/omega-model.ts`.

## Core Enums

### RiskLevel
- `low`
- `medium`
- `high`

### WorkOrderStatus
- `PENDING`
- `SCAFFOLDED`
- `DISPATCHED`
- `WORKING`
- `PENDING_VERIFICATION`
- `VERIFIED`
- `REJECTED`
- `REWORKING`
- `ESCALATED`
- `STAGED`
- `EXECUTING`
- `COMPLETE`
- `FAILED`

## Work Order Model

### InputContract
- `requiredFiles: string[]`
- `requiredContext: string[]`
- `preloadedContent?: Record<string, string>`

### OutputContract
- `expectedArtifacts: string[]`
- `expectedFiles: string[]`
- `mustNotModify?: string[]`

### WorkOrder
- `id: string`
- `taskDescription: string`
- `inputContract: InputContract`
- `outputContract: OutputContract`
- `acceptanceCriteria: string[]`
- `predictedRisk: RiskLevel`
- `dependencies: string[]`
- `assignedModel?: string`
- `status: WorkOrderStatus`
- `reworkCount?: number`

### WorkOrderDAG
- `manifestId: string`
- `goal: string`
- `nodes: Map<string, WorkOrder>`
- `edges: Array<{ from: string; to: string }>`
- `createdAt: number`

## AST Modification Model

### SupportedLanguage
- `typescript`
- `javascript`
- `python`
- `other`

### ASTOperation
Supported operation variants:
- `insert_import`
- `add_function`
- `modify_function`
- `add_class_method`
- `replace_block`
- `create_file`
- `delete_lines`
- `wrap_in_try_catch`
- `add_type_annotation`
- `raw_edit`

### ASTModification
- `filePath: string`
- `language: SupportedLanguage`
- `operations: ASTOperation[]`
- `rawFallback?: { oldString: string; newString: string }`

## Evidence and Verification

### ToolCallLogEntry
- `id: string`
- `tool: string`
- `args: Record<string, unknown>`
- `success: boolean`
- `result: string`
- `startedAt: number`
- `finishedAt: number`

### EvidencePackage
- `workOrderId: string`
- `modifications: ASTModification[]`
- `assumptions: string[]`
- `edgeCasesHandled: string[]`
- `selfAssessment: string`
- `filesRead: string[]`
- `toolCallLog: ToolCallLogEntry[]`

### FailedCheck
- `category: 'static' | 'dynamic' | 'semantic'`
- `checkName: string`
- `expected: string`
- `actual: string`
- `evidence: string`

### RejectionMemo
- `workOrderId: string`
- `verdict: 'FAIL'`
- `rootCause: string`
- `failedChecks: FailedCheck[]`
- `actionableRecommendation: string`
- `severity: 'CRITICAL' | 'MAJOR' | 'MINOR'`

### VerificationResult
- `workOrderId: string`
- `verdict: 'PASS'`
- `staticAnalysis`:
  - `lintPassed: boolean`
  - `typeCheckPassed: boolean`
  - `complexityScore: number`
  - `securityIssues: string[]`
- `dynamicAnalysis`:
  - `testsGenerated: number`
  - `testsPassed: number`
  - `testsFailed: number`
  - `failedTestDetails?: string[]`
- `semanticValidation`:
  - `intentMet: boolean`
  - `rationale: string`
- `stagedModifications: ASTModification[]`

## Plan and Execution

### ExecutionStep
- `stepId: string`
- `tool: 'create_file' | 'edit_file' | 'delete_file' | 'run_command'`
- `args: Record<string, unknown>`
- `sourceWorkOrderId: string`
- `rationale: string`

### SignedExecutionPlan
- `planId: string`
- `manifestId: string`
- `signature: string`
- `createdBy: 'architect'`
- `steps: ExecutionStep[]`
- `totalFilesAffected: number`
- `estimatedToolCalls: number`

### ExecutionStepResult
- `stepId: string`
- `tool: string`
- `success: boolean`
- `output: string`
- `error?: string`

### ExecutionResult
- `success: boolean`
- `stepsExecuted: number`
- `failedStepId?: string`
- `results: ExecutionStepResult[]`

## Project Autopsy

### ProjectAutopsy
- `projectName: string`
- `projectType: 'node' | 'python' | 'monorepo' | 'mixed' | 'unknown'`
- `packageManager?: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry'`
- `entryPoints: string[]`
- `keyFiles: Record<string, string>`
- `directoryStructure: string`
- `dependencies: string[]`
- `devDependencies: string[]`
- `testFramework?: string`
- `testCommand?: string`
- `buildCommand?: string`
- `lintCommand?: string`
- `typeCheckCommand?: string`
- `conventions: string[]`

## Runtime Configuration

### OmegaConfig
- `architectModel: string`
- `sentinelModel: string`
- `operatorModel: string`
- `specialistModels`:
  - `lowRisk: string`
  - `mediumRisk: string`
  - `highRisk: string`
- `maxConcurrentSpecialists: number`
- `maxReworkAttempts: number`
- `maxDAGNodes: number`
- `laneTimeoutMs: number`
- `enableAST: boolean`
- `enableDynamicTests: boolean`
- `enableIntegrationTest: boolean`
- `tokenBudget`:
  - `perRequest: number`
  - `daily: number`
- `stepBudget`:
  - `maxTotalSteps: number`
  - `warningAt: number`

## Callback Contracts

### ToolResult
- `success: boolean`
- `output: string`
- `error?: string`
- `metadata?: Record<string, unknown>`

### ToolCallFn
- Signature: `(tool: string, args: Record<string, unknown>) => Promise<ToolResult>`

### InvokeModelFn
- Signature:
  `(model: string, messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>) => Promise<string>`

### OmegaCallbacks
- `onEvent: (type: string, payload: Record<string, unknown>) => void`
- `executeToolCall: ToolCallFn`
- `invokeModel: InvokeModelFn`

## Integration Output

### IntegrationTestResult
- `success: boolean`
- `command: string`
- `output: string`
- `testsPassed?: number`
- `testsFailed?: number`

### OmegaResult
- `success: boolean`
- `manifestId: string`
- `workOrdersTotal: number`
- `workOrdersVerified: number`
- `workOrdersFailed: number`
- `planStepCount: number`
- `execution: ExecutionResult`
- `integrationTest?: IntegrationTestResult`
- `summary: string`
