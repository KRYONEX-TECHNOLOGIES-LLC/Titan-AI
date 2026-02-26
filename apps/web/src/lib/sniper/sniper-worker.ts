// ── Titan Plan Sniper — CODER Role (Worker) ──────────────────────────────────
// Risk-based model routing: low/medium → MiniMax M2.1, high/critical → DeepSeek V3.2.
// Generates code changes as structured edit instructions for the EXECUTOR.

import { callModelDirect } from '@/lib/llm-call';
import { ZERO_DEFECT_RULES_COMPACT, TASK_DECOMPOSITION_RULES_COMPACT, GIT_RULES } from '@/lib/shared/coding-standards';
import type {
  SniperConfig,
  SniperDAGNode,
  ScanResult,
  CodeArtifact,
  SniperCostTracker,
} from './sniper-model';
import { estimateTokens, getCoderModel } from './sniper-model';

const WORKER_SYSTEM = `You are CODER, the implementation agent in the Titan Plan Sniper pipeline.
You receive a specific task with context about the codebase. Your job is to produce the exact
code changes needed to complete the task.

OUTPUT FORMAT:
1. First, briefly explain your approach (2-3 sentences).
2. Then output ALL file changes in this exact format:

--- FILE: <filepath> ---
<complete file content or specific edit instructions>
--- END FILE ---

RULES:
- Follow the codebase conventions exactly (naming, imports, patterns).
- Write production-quality code — no TODOs, no placeholders, no "implement here".
- Handle edge cases, errors, and loading states.
- If creating a new file, output the complete content.
- If editing an existing file, use SEARCH/REPLACE blocks:
  <<<SEARCH
  exact lines to find
  ===
  replacement lines
  REPLACE>>>
- Be thorough — implement everything needed for the acceptance criteria.
- Use TypeScript types, proper error handling, and follow existing patterns.
${TASK_DECOMPOSITION_RULES_COMPACT}
${ZERO_DEFECT_RULES_COMPACT}
${GIT_RULES}`;

export async function runWorker(
  node: SniperDAGNode,
  scanResult: ScanResult,
  config: SniperConfig,
  costTracker: SniperCostTracker,
  fileContents?: Record<string, string>,
): Promise<CodeArtifact> {
  const model = getCoderModel(node.risk, config);

  const contextParts = [
    `## Task: ${node.title}`,
    `Description: ${node.description}`,
    `Type: ${node.taskType} | Risk: ${node.risk}`,
    `\n## Acceptance Criteria\n${node.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
    `\n## Relevant Files: ${node.relevantFiles.join(', ') || 'none specified'}`,
    `\n## Codebase Context`,
    `Conventions: ${scanResult.conventions.join('; ')}`,
    `Patterns: ${scanResult.existingPatterns.join('; ')}`,
    `Dependencies: ${scanResult.dependencies.slice(0, 20).join(', ')}`,
  ];

  if (fileContents && Object.keys(fileContents).length > 0) {
    contextParts.push('\n## Existing File Contents');
    for (const [path, content] of Object.entries(fileContents)) {
      contextParts.push(`\n### ${path}\n\`\`\`\n${content.slice(0, 8000)}\n\`\`\``);
    }
  }

  const userMessage = contextParts.join('\n');

  const response = await callModelDirect(
    model,
    [
      { role: 'system', content: WORKER_SYSTEM },
      { role: 'user', content: userMessage },
    ],
    { temperature: 0.15, maxTokens: 8000 },
  );

  costTracker.record(model, estimateTokens(userMessage), estimateTokens(response));

  const filesModified = extractFilePaths(response);

  return {
    nodeId: node.id,
    model,
    role: 'CODER',
    output: response,
    codeChanges: response,
    filesModified,
    toolCalls: [],
    createdAt: Date.now(),
  };
}

function extractFilePaths(output: string): string[] {
  const paths = new Set<string>();
  const fileBlockRegex = /--- FILE: (.+?) ---/g;
  let match;
  while ((match = fileBlockRegex.exec(output)) !== null) {
    paths.add(match[1].trim());
  }
  const searchReplaceRegex = /(?:^|\n)(\S+\.[a-z]+)\s*$/gm;
  let m2;
  while ((m2 = searchReplaceRegex.exec(output)) !== null) {
    if (m2[1].includes('/') || m2[1].includes('\\')) {
      paths.add(m2[1]);
    }
  }
  return [...paths];
}
