// ── Titan Plan Sniper — ARCHITECT Role ───────────────────────────────────────
// Uses MiMo-V2-Flash (FREE) to create a task DAG from Plan Mode tasks,
// assign risk levels, identify dependencies, and route to optimal models.

import { callModelDirect } from '@/lib/llm-call';
import { ZERO_DEFECT_RULES_COMPACT, GIT_RULES } from '@/lib/shared/coding-standards';
import type {
  SniperConfig,
  ScanResult,
  SniperDAG,
  SniperDAGNode,
  SniperTaskType,
  RiskLevel,
  SniperCostTracker,
} from './sniper-model';
import { estimateTokens, generateDAGId, getDefaultRisk } from './sniper-model';

interface PlanTaskInput {
  id: string;
  title: string;
  description: string;
  phase: number;
  priority: string;
  tags: string[];
  blockedBy: string[];
}

const ARCHITECT_SYSTEM = `You are ARCHITECT, the planning agent in the Titan Plan Sniper pipeline.
You receive a codebase scan and a list of tasks from Plan Mode.
Your job is to create an execution DAG — a directed acyclic graph of tasks with dependencies.

For each task, determine:
1. taskType: one of "code", "refactor", "debug", "test", "documentation", "styling", "architecture", "api", "database", "deployment", "general"
2. risk: "low", "medium", "high", or "critical" based on complexity and impact
3. dependencies: which other task IDs must complete first
4. relevantFiles: files this task will likely touch (use codebase scan to determine)
5. acceptanceCriteria: 2-4 concrete checks to verify the task is done correctly

OUTPUT FORMAT (JSON):
{
  "nodes": [
    {
      "id": "<matches planTaskId>",
      "planTaskId": "<original plan task id>",
      "title": "<task title>",
      "description": "<enriched description with implementation details>",
      "taskType": "<type>",
      "risk": "<risk level>",
      "dependencies": ["<id of tasks that must finish first>"],
      "relevantFiles": ["<file paths>"],
      "acceptanceCriteria": ["<criterion 1>", "<criterion 2>"]
    }
  ]
}

RULES:
- Order tasks so independent ones can run in parallel.
- Minimize dependencies — only add them when truly required.
- Architecture/database tasks should come before code that depends on them.
- Tests should depend on the code they test.
- Keep descriptions actionable — tell the CODER exactly what to implement.
${ZERO_DEFECT_RULES_COMPACT}
${GIT_RULES}`;

export async function runArchitect(
  tasks: PlanTaskInput[],
  scanResult: ScanResult,
  userGoal: string,
  config: SniperConfig,
  costTracker: SniperCostTracker,
  emit: (type: string, data: Record<string, unknown>) => void,
): Promise<SniperDAG> {
  const userMessage = [
    `## Goal\n${userGoal}`,
    `## Codebase Context\nConventions: ${scanResult.conventions.join(', ')}`,
    `Key files: ${Object.entries(scanResult.keyFiles).map(([k, v]) => `${k}: ${v}`).join('\n')}`,
    `Dependencies: ${scanResult.dependencies.slice(0, 30).join(', ')}`,
    `Patterns: ${scanResult.existingPatterns.join(', ')}`,
    `\n## Tasks (${tasks.length} total)\n${JSON.stringify(tasks.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      phase: t.phase,
      priority: t.priority,
      tags: t.tags,
      blockedBy: t.blockedBy,
    })), null, 2)}`,
  ].join('\n\n');

  const response = await callModelDirect(
    config.models.architect,
    [
      { role: 'system', content: ARCHITECT_SYSTEM },
      { role: 'user', content: userMessage },
    ],
    { temperature: 0.15, maxTokens: 8000 },
  );

  costTracker.record(config.models.architect, estimateTokens(userMessage), estimateTokens(response));

  let nodes: SniperDAGNode[];
  try {
    const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    const raw = jsonMatch ? jsonMatch[1] : response;
    const parsed = JSON.parse(raw.trim());
    const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : parsed;

    nodes = rawNodes.map((n: Record<string, unknown>) => ({
      id: String(n.id || n.planTaskId || ''),
      planTaskId: String(n.planTaskId || n.id || ''),
      title: String(n.title || ''),
      description: String(n.description || ''),
      taskType: (n.taskType as SniperTaskType) || 'code',
      risk: (n.risk as RiskLevel) || getDefaultRisk((n.taskType as SniperTaskType) || 'code'),
      dependencies: Array.isArray(n.dependencies) ? n.dependencies.map(String) : [],
      relevantFiles: Array.isArray(n.relevantFiles) ? n.relevantFiles.map(String) : [],
      acceptanceCriteria: Array.isArray(n.acceptanceCriteria) ? n.acceptanceCriteria.map(String) : [],
      status: 'pending' as const,
    }));
  } catch {
    nodes = tasks.map(t => ({
      id: t.id,
      planTaskId: t.id,
      title: t.title,
      description: t.description,
      taskType: 'code' as const,
      risk: 'medium' as const,
      dependencies: t.blockedBy,
      relevantFiles: [],
      acceptanceCriteria: [`${t.title} is implemented correctly`],
      status: 'pending' as const,
    }));
  }

  const dag: SniperDAG = {
    id: generateDAGId(),
    goal: userGoal,
    nodes,
    createdAt: Date.now(),
  };

  emit('dag_created', {
    dagId: dag.id,
    nodeCount: dag.nodes.length,
    parallelizable: dag.nodes.filter(n => n.dependencies.length === 0).length,
  });

  return dag;
}
