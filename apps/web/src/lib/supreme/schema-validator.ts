import { z } from 'zod';
import type {
  DebateResult,
  ExecutionPlan,
  SupremeArtifact,
  SupremeTaskManifest,
} from './supreme-model';

const PathSchema = z.string().min(1);
const StringMapSchema = z.record(z.string(), z.unknown());

const ToolSchemas = {
  read_file: z.object({
    path: PathSchema,
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
  }),
  edit_file: z.object({
    path: PathSchema,
    old_string: z.string(),
    new_string: z.string(),
  }),
  create_file: z.object({
    path: PathSchema,
    content: z.string().optional().default(''),
  }),
  delete_file: z.object({
    path: PathSchema,
  }),
  list_directory: z.object({
    path: PathSchema.optional(),
  }),
  grep_search: z.object({
    query: z.string().min(1),
    path: PathSchema.optional(),
    glob: z.string().optional(),
  }),
  glob_search: z.object({
    pattern: z.string().min(1),
    path: PathSchema.optional(),
  }),
  run_command: z.object({
    command: z.string().min(1),
    cwd: PathSchema.optional(),
  }),
  web_search: z.object({
    query: z.string().min(1),
  }),
  web_fetch: z.object({
    url: z.string().url(),
  }),
  read_lints: z.object({
    path: PathSchema,
  }),
  semantic_search: z.object({
    query: z.string().min(1),
    path: PathSchema.optional(),
  }),
  generate_image: z.object({
    prompt: z.string().min(1),
    size: z.string().optional(),
    quality: z.string().optional(),
    style: z.string().optional(),
  }),
} as const;

const ToolNameSchema = z.enum([
  'read_file',
  'edit_file',
  'create_file',
  'delete_file',
  'list_directory',
  'grep_search',
  'glob_search',
  'run_command',
  'web_search',
  'web_fetch',
  'read_lints',
  'semantic_search',
  'generate_image',
]);

const SupremeTaskNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(['code', 'refactor', 'test', 'documentation', 'formatting', 'transformation']),
  complexity: z.number().min(1).max(10),
  dependsOn: z.array(z.string()),
  relevantFiles: z.array(z.string()),
  acceptanceCriteria: z.array(z.string().min(1)),
  verificationCriteria: z.array(z.string().min(1)),
  constraints: z.array(z.string()).optional(),
  assignedRole: z
    .enum(['OVERSEER', 'OPERATOR', 'PRIMARY_WORKER', 'SECONDARY_WORKER'])
    .optional(),
});

export const TaskManifestSchema = z.object({
  id: z.string().min(1),
  goal: z.string().min(1),
  createdAt: z.number(),
  status: z.enum(['ACTIVE', 'COMPLETE', 'FAILED', 'CANCELLED']),
  nodes: z.array(SupremeTaskNodeSchema),
});

const ToolCallLogEntrySchema = z.object({
  tool: ToolNameSchema,
  args: StringMapSchema,
  success: z.boolean(),
  result: z.string(),
  startedAt: z.number(),
  finishedAt: z.number(),
});

export const ArtifactSchema = z.object({
  laneId: z.string().min(1),
  nodeId: z.string().min(1),
  role: z.enum(['OVERSEER', 'OPERATOR', 'PRIMARY_WORKER', 'SECONDARY_WORKER']),
  model: z.string().min(1),
  inspectionEvidence: z.string(),
  codeChanges: z.string(),
  selfReview: z.string(),
  verificationHints: z.string(),
  filesModified: z.array(z.string()),
  toolCallLog: z.array(ToolCallLogEntrySchema),
  rawOutput: z.string().optional(),
  createdAt: z.number(),
});

const ExecutionPlanStepSchema = z.object({
  id: z.string().min(1),
  tool: ToolNameSchema,
  args: StringMapSchema,
  rationale: z.string(),
  requiresApproval: z.boolean(),
});

export const ExecutionPlanSchema = z.object({
  planId: z.string().min(1),
  laneId: z.string().min(1),
  nodeId: z.string().min(1),
  approvedBy: z.enum(['OVERSEER', 'OPERATOR', 'PRIMARY_WORKER', 'SECONDARY_WORKER']),
  approvedAt: z.number(),
  steps: z.array(ExecutionPlanStepSchema),
});

const DebateVerdictSchema = z.object({
  winner: z.enum(['artifactA', 'artifactB', 'synthesized']),
  rationale: z.string(),
  hiddenEdgeCases: z.array(z.string()),
  securityRisks: z.array(z.string()),
  chosenApproach: z.string(),
});

export const DebateResultSchema = z.object({
  laneId: z.string().min(1),
  triggered: z.boolean(),
  artifactA: ArtifactSchema.optional(),
  artifactB: ArtifactSchema.optional(),
  verdict: DebateVerdictSchema.optional(),
});

export function validateToolCall(tool: string, args: Record<string, unknown>) {
  const schema = ToolSchemas[tool as keyof typeof ToolSchemas];
  if (!schema) {
    return { valid: false, errors: [`Unknown tool: ${tool}`] };
  }
  const parsed = schema.safeParse(args);
  if (parsed.success) return { valid: true };
  return { valid: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}

export function validateManifest(manifest: SupremeTaskManifest) {
  const parsed = TaskManifestSchema.safeParse(manifest);
  if (parsed.success) return { valid: true };
  return { valid: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}

export function validateArtifact(artifact: SupremeArtifact) {
  const parsed = ArtifactSchema.safeParse(artifact);
  if (parsed.success) return { valid: true };
  return { valid: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}

export function validateExecutionPlan(plan: ExecutionPlan) {
  const parsed = ExecutionPlanSchema.safeParse(plan);
  if (parsed.success) return { valid: true };
  return { valid: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}

export function validateDebateResult(result: DebateResult) {
  const parsed = DebateResultSchema.safeParse(result);
  if (parsed.success) return { valid: true };
  return { valid: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}

export function safeParseJSON<T>(raw: string, schema: z.ZodSchema<T>) {
  try {
    const parsedRaw = JSON.parse(raw);
    const parsed = schema.safeParse(parsedRaw);
    if (!parsed.success) {
      return {
        success: false as const,
        error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      };
    }
    return { success: true as const, data: parsed.data };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Invalid JSON payload',
    };
  }
}

export const SupremeSchemas = {
  tools: ToolSchemas,
  taskManifest: TaskManifestSchema,
  artifact: ArtifactSchema,
  executionPlan: ExecutionPlanSchema,
  debateResult: DebateResultSchema,
};
