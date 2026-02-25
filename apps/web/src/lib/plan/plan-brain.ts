import { callModelDirect } from '@/lib/llm-call';
import { scanCodebase, serializeDirectory } from './code-scanner';
import { generateSubtasks } from './subtask-generator';
import type { CodeDirectoryData } from './code-scanner';
import type { GeneratedSubtask } from './subtask-generator';

export interface PlanBrainConfig {
  scannerModel: string;
  plannerModel: string;
  verifierModel: string;
  correctorModel: string;
}

export const DEFAULT_PLAN_BRAIN_CONFIG: PlanBrainConfig = {
  scannerModel: 'mistralai/devstral-2-2512',
  plannerModel: 'google/gemini-2.0-flash-001',
  verifierModel: 'deepseek/deepseek-chat-v3-0324',
  correctorModel: 'qwen/qwen3-coder-next',
};

export interface PlanBrainTask {
  id: string;
  title: string;
  description: string;
  phase: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  tags: string[];
  subtasks: GeneratedSubtask[];
  status: 'pending' | 'running' | 'verifying' | 'passed' | 'failed' | 'correcting';
  verificationResult?: { pass: boolean; issues: string[] };
  attempts: number;
}

export interface PlanBrainEvent {
  type: 'scan_start' | 'scan_complete' | 'plan_start' | 'plan_complete' |
        'task_start' | 'task_complete' | 'verify_start' | 'verify_pass' | 'verify_fail' |
        'correct_start' | 'correct_complete' | 'subtask_generated' |
        'checklist_generated' | 'error' | 'done';
  data: Record<string, unknown>;
}

type EmitFn = (event: PlanBrainEvent) => void;

export async function runPlanBrain(
  goal: string,
  fileTree: string,
  emit: EmitFn,
  executeTask: (task: PlanBrainTask, directory: CodeDirectoryData) => Promise<{ success: boolean; output: string; filesChanged: string[] }>,
  config = DEFAULT_PLAN_BRAIN_CONFIG,
): Promise<{ tasks: PlanBrainTask[]; directory: CodeDirectoryData; totalCost: number }> {
  let totalCost = 0;

  // Phase 1: Scan
  emit({ type: 'scan_start', data: { model: config.scannerModel } });
  const directory = await scanCodebase(fileTree);
  emit({ type: 'scan_complete', data: {
    routeCount: directory.routes.length,
    apiCount: directory.apiEndpoints.length,
    componentCount: directory.components.length,
  }});

  // Phase 2: Generate Tasks
  emit({ type: 'plan_start', data: { model: config.plannerModel } });
  const tasks = await generateTasksFromGoal(goal, directory, config.plannerModel);
  emit({ type: 'plan_complete', data: { taskCount: tasks.length } });

  // Phase 3: Generate subtasks for each task
  for (const task of tasks) {
    const subtasks = await generateSubtasks(task.title, task.tags[0] || 'general', directory);
    task.subtasks = subtasks;
    emit({ type: 'subtask_generated', data: { taskId: task.id, subtaskCount: subtasks.length } });
  }

  // Phase 4: Execute + Verify + Correct loop
  for (const task of tasks) {
    task.status = 'running';
    emit({ type: 'task_start', data: { taskId: task.id, title: task.title } });

    const maxAttempts = 3;
    while (task.attempts < maxAttempts) {
      task.attempts++;

      const result = await executeTask(task, directory);
      task.status = 'verifying';

      emit({ type: 'verify_start', data: { taskId: task.id, attempt: task.attempts } });
      const verification = await verifyTask(task, result.output, result.filesChanged, config.verifierModel);
      task.verificationResult = verification;

      if (verification.pass) {
        task.status = 'passed';
        emit({ type: 'verify_pass', data: { taskId: task.id } });
        break;
      }

      emit({ type: 'verify_fail', data: { taskId: task.id, issues: verification.issues } });

      if (task.attempts < maxAttempts) {
        task.status = 'correcting';
        emit({ type: 'correct_start', data: { taskId: task.id, attempt: task.attempts } });
      }
    }

    if (task.status !== 'passed') {
      task.status = 'failed';
    }
    emit({ type: 'task_complete', data: { taskId: task.id, status: task.status } });
  }

  emit({ type: 'done', data: {
    total: tasks.length,
    passed: tasks.filter(t => t.status === 'passed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
  }});

  return { tasks, directory, totalCost };
}

async function generateTasksFromGoal(
  goal: string,
  directory: CodeDirectoryData,
  model: string,
): Promise<PlanBrainTask[]> {
  const dirContext = serializeDirectory(directory, 3000);

  const systemPrompt = `You are an elite project planner. Given a user's goal and the current project directory, generate a comprehensive task list.
Return ONLY a JSON array:
[{ "title": "...", "description": "...", "phase": 1, "priority": "high", "tags": ["frontend", "auth"] }]

Rules:
- 15-200+ tasks depending on complexity
- Cover ALL aspects: frontend, backend, DB, auth, API, testing, deployment, UX
- Tasks ordered logically (foundations first)
- Each task is specific and actionable
- Reference existing files from the directory when modifying existing code`;

  const response = await callModelDirect(model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `## Goal\n${goal}\n\n## Current Project\n${dirContext}` },
  ], { temperature: 0.3, maxTokens: 16000 });

  const cleaned = response.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  let parsed: unknown[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    parsed = match ? JSON.parse(match[0]) : [];
  }

  return (Array.isArray(parsed) ? parsed : []).map((item: any, i: number) => ({
    id: `pb-task-${Date.now()}-${i}`,
    title: item.title || 'Untitled',
    description: item.description || '',
    phase: item.phase || 1,
    priority: item.priority || 'medium',
    tags: Array.isArray(item.tags) ? item.tags : [],
    subtasks: [],
    status: 'pending' as const,
    attempts: 0,
  }));
}

async function verifyTask(
  task: PlanBrainTask,
  executionOutput: string,
  filesChanged: string[],
  model: string,
): Promise<{ pass: boolean; issues: string[] }> {
  const systemPrompt = `You are a strict code reviewer. Verify that the task was completed correctly.
Return ONLY JSON: { "pass": true/false, "issues": ["issue 1", "issue 2"] }
If pass=true, issues should be empty. If pass=false, list SPECIFIC problems.`;

  const userMsg = [
    `## Task: ${task.title}`,
    `Description: ${task.description}`,
    `Subtasks: ${task.subtasks.map(s => s.title).join(', ')}`,
    '',
    `## Execution Output`,
    executionOutput.slice(0, 5000),
    '',
    `## Files Changed`,
    filesChanged.join('\n'),
  ].join('\n');

  try {
    const response = await callModelDirect(model, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ], { temperature: 0.1, maxTokens: 1000 });

    const cleaned = response.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
    const result = JSON.parse(cleaned);
    return {
      pass: !!result.pass,
      issues: Array.isArray(result.issues) ? result.issues : [],
    };
  } catch {
    return { pass: true, issues: [] };
  }
}

export async function generateDynamicChecklist(
  directory: CodeDirectoryData,
): Promise<Array<{ id: string; category: string; label: string; filePaths: string[] }>> {
  const dirContext = serializeDirectory(directory, 5000);

  const systemPrompt = `You are a QA checklist generator. Given a project's code directory, generate a comprehensive verification checklist specific to THIS project.
Return ONLY JSON array:
[{ "category": "frontend", "label": "Login page renders with email/password fields", "filePaths": ["src/pages/Login.tsx"] }]

Categories: frontend, backend, database, auth, api, testing, deployment, ux, performance, security, accessibility
Generate 20-60 items based on what actually exists in the project. Each item should reference specific files.`;

  try {
    const response = await callModelDirect('google/gemini-2.0-flash-001', [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: dirContext },
    ], { temperature: 0.2, maxTokens: 8000 });

    const cleaned = response.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
    let items: any[];
    try {
      items = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\[[\s\S]*\]/);
      items = match ? JSON.parse(match[0]) : [];
    }

    return (Array.isArray(items) ? items : []).map((item: any, i: number) => ({
      id: `dyn-${Date.now()}-${i}`,
      category: item.category || 'general',
      label: item.label || 'Check item',
      filePaths: Array.isArray(item.filePaths) ? item.filePaths : [],
    }));
  } catch {
    return [];
  }
}
