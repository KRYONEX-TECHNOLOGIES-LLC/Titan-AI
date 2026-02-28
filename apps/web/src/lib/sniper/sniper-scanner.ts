// ── Titan Plan Sniper V2 — SCANNER Role ──────────────────────────────────────
// Reads the entire codebase using Devstral 2 ($0.05/$0.22) to map dependencies,
// conventions, and existing patterns before any code generation happens.

import { callModelDirect } from '@/lib/llm-call';
import type { SniperConfig, ScanResult, SniperCostTracker } from './sniper-model';
import { estimateTokens } from './sniper-model';

interface ScanContext {
  workspacePath: string;
  fileTree: string;
  openFiles?: string[];
  userGoal: string;
}

const SCANNER_SYSTEM = `You are SCANNER, the first agent in the Titan Plan Sniper pipeline.
Your job is to analyze a codebase and produce a structured summary that other agents will use
to write correct, idiomatic code.

INSTRUCTIONS:
1. Study the file tree and any provided file contents carefully.
2. Identify the tech stack, frameworks, package manager, and conventions.
3. List the key files (entry points, configs, shared utilities, types).
4. Note existing patterns: naming conventions, folder structure, import style, component patterns.
5. List all dependencies from package.json or similar.

OUTPUT FORMAT (JSON):
{
  "fileTree": "<condensed file tree>",
  "keyFiles": { "<path>": "<description of what it does>" },
  "dependencies": ["dep1", "dep2"],
  "conventions": ["Convention 1", "Convention 2"],
  "existingPatterns": ["Pattern 1", "Pattern 2"]
}

Be thorough but concise. This output feeds directly into the ARCHITECT agent.`;

export async function runScanner(
  ctx: ScanContext,
  config: SniperConfig,
  costTracker: SniperCostTracker,
  emit: (type: string, data: Record<string, unknown>) => void,
): Promise<ScanResult> {
  emit('scan_start', { model: config.models.scanner });

  const userMessage = [
    `## User Goal\n${ctx.userGoal}`,
    `## File Tree\n\`\`\`\n${ctx.fileTree.slice(0, 15000)}\n\`\`\``,
    ctx.openFiles?.length
      ? `## Currently Open Files\n${ctx.openFiles.join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n');

  const response = await callModelDirect(
    config.models.scanner,
    [
      { role: 'system', content: SCANNER_SYSTEM },
      { role: 'user', content: userMessage },
    ],
    { temperature: 0.1, maxTokens: 4000 },
  );

  costTracker.record(config.models.scanner, estimateTokens(userMessage), estimateTokens(response));

  let result: ScanResult;
  try {
    const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    const raw = jsonMatch ? jsonMatch[1] : response;
    const parsed = JSON.parse(raw.trim());
    result = {
      fileTree: parsed.fileTree || ctx.fileTree.slice(0, 5000),
      keyFiles: parsed.keyFiles || {},
      dependencies: parsed.dependencies || [],
      conventions: parsed.conventions || [],
      existingPatterns: parsed.existingPatterns || [],
    };
  } catch {
    result = {
      fileTree: ctx.fileTree.slice(0, 5000),
      keyFiles: {},
      dependencies: [],
      conventions: ['Unable to parse scanner output — using defaults'],
      existingPatterns: [],
    };
  }

  emit('scan_complete', {
    keyFilesCount: Object.keys(result.keyFiles).length,
    dependenciesCount: result.dependencies.length,
    conventionsCount: result.conventions.length,
  });

  return result;
}
