import { callModelDirect } from '@/lib/llm-call';
import type { CodeDirectoryData } from '@/lib/plan/code-scanner';

export interface GeneratedSubtask {
  title: string;
  verificationCriteria: string;
  filePath: string | null;
  category: string;
}

const SUBTASK_PROMPT = `You are a QA verification specialist. Given a checklist item and a project's code directory, generate specific subtasks to verify that checklist item is fully satisfied.

Rules:
- Each subtask targets ONE specific file, route, endpoint, or component
- Include the exact file path when known
- Include concrete verification criteria (what to check, expected behavior)
- Be exhaustive: don't miss any file/route/endpoint that relates to this checklist item
- Return ONLY a JSON array, no markdown

Output format:
[
  { "title": "Verify /login route renders correctly", "verificationCriteria": "Route /login exists, renders LoginPage, has email+password fields", "filePath": "src/pages/Login.tsx", "category": "frontend" },
  ...
]`;

export async function generateSubtasks(
  checklistLabel: string,
  checklistCategory: string,
  directory: CodeDirectoryData,
): Promise<GeneratedSubtask[]> {
  const dirContext = buildDirectoryContext(directory, checklistCategory);

  const userMsg = [
    `## Checklist Item`,
    `Category: ${checklistCategory}`,
    `Item: "${checklistLabel}"`,
    '',
    `## Project Code Directory`,
    dirContext,
  ].join('\n');

  try {
    const response = await callModelDirect(
      'google/gemini-2.0-flash-001',
      [
        { role: 'system', content: SUBTASK_PROMPT },
        { role: 'user', content: userMsg },
      ],
      { temperature: 0.2, maxTokens: 4000 },
    );

    const cleaned = response.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
    let tasks: GeneratedSubtask[];
    try {
      tasks = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\[[\s\S]*\]/);
      tasks = match ? JSON.parse(match[0]) : [];
    }

    return Array.isArray(tasks)
      ? tasks.map(t => ({
          title: t.title || 'Untitled subtask',
          verificationCriteria: t.verificationCriteria || '',
          filePath: t.filePath || null,
          category: t.category || checklistCategory,
        }))
      : [];
  } catch (err) {
    console.error('[subtask-generator] Failed:', (err as Error).message);
    return [];
  }
}

function buildDirectoryContext(dir: CodeDirectoryData, category: string): string {
  const lines: string[] = [];

  const relevant = (items: Array<{ path: string; name: string; description: string }>, label: string) => {
    if (items.length === 0) return;
    lines.push(`\n${label}:`);
    items.forEach(i => lines.push(`  - ${i.path}: ${i.name} — ${i.description}`));
  };

  if (['frontend', 'ux', 'accessibility'].includes(category)) {
    relevant(dir.routes, 'Routes/Pages');
    relevant(dir.components, 'Components');
    relevant(dir.styles, 'Styles');
  }
  if (['backend', 'api'].includes(category)) {
    relevant(dir.apiEndpoints, 'API Endpoints');
    relevant(dir.configs, 'Configs');
  }
  if (['auth'].includes(category)) {
    relevant(dir.routes, 'Routes/Pages');
    relevant(dir.apiEndpoints, 'API Endpoints');
    relevant(dir.stores, 'Stores');
  }
  if (['database'].includes(category)) {
    relevant(dir.configs, 'Configs');
    relevant(dir.types, 'Types');
  }
  if (['testing', 'deployment', 'performance', 'security'].includes(category)) {
    relevant(dir.routes, 'Routes/Pages');
    relevant(dir.apiEndpoints, 'API Endpoints');
    relevant(dir.components, 'Components');
    relevant(dir.configs, 'Configs');
  }

  if (lines.length === 0) {
    relevant(dir.routes, 'Routes');
    relevant(dir.apiEndpoints, 'API');
    relevant(dir.components, 'Components');
  }

  return lines.join('\n') || '(No directory data available — scan needed)';
}
