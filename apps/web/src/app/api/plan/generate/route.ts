import { NextRequest, NextResponse } from 'next/server';
import { callModelDirect } from '@/lib/llm-call';
import { TASK_DECOMPOSITION_RULES_COMPACT } from '@/lib/shared/coding-standards';

export const maxDuration = 60;

const PLAN_SYSTEM_PROMPT = `You are a senior software architect specializing in project planning and task decomposition. Given a user's project idea, produce a comprehensive plan with hierarchical task + subtask architecture.

Return ONLY valid JSON with this exact structure:
{
  "projectName": "Short project name derived from the description",
  "idea": "A 2-3 paragraph description of the project vision, goals, and key features",
  "techStack": {
    "runtime": "node|python|rust|go|etc",
    "framework": "next.js|express|django|etc",
    "language": "typescript|javascript|python|etc",
    "styling": "tailwindcss|css-modules|styled-components|etc",
    "database": "postgresql|sqlite|mongodb|none",
    "extras": ["list", "of", "additional", "tools"]
  },
  "tasks": [
    {
      "title": "Clear, actionable top-level task name",
      "description": "Detailed description of what needs to be done, specific about files, components, APIs",
      "phase": 1,
      "priority": "critical",
      "tags": ["relevant", "tech", "tags"],
      "subtasks": [
        "Specific verifiable deliverable 1",
        "Specific verifiable deliverable 2",
        "Specific verifiable deliverable 3"
      ]
    }
  ]
}

PHASE VALUES:
- 1 = Setup/foundation/scaffolding
- 2 = Core features/backend/API
- 3 = Frontend/UI/polish/testing

PRIORITY VALUES: "critical" | "high" | "medium" | "low"

SCALING RULES (NO HARDCODED CEILING):
- Static site / landing page: 5-8 tasks
- Multi-page website with forms: 10-15 tasks
- Full SaaS with auth, DB, payments: 20-35 tasks
- Enterprise platform with multiple subsystems: 35-60+ tasks
- Let the user's description drive the count. NEVER compress multiple unrelated systems into a single task.

SUBTASK RULES:
- Each task gets 3-8 subtasks as acceptance criteria
- Each subtask must be a single, verifiable YES/NO deliverable
- GOOD: "Create EmailVerificationToken table with userId, token, expiresAt columns"
- GOOD: "Rate limit: max 3 verification emails per hour per address"
- BAD: "Set up the email system" (too vague)
- BAD: "Handle errors" (which errors? what behavior?)

${TASK_DECOMPOSITION_RULES_COMPACT}

ORDERING:
- Setup/scaffolding and database schema first
- Core backend logic and API routes next
- Frontend components and pages after
- Integration, testing, and polish last
- Include a final "Run full test suite and verify all features" task

COVERAGE: frontend, backend, database schema, auth, API routes, components, pages, state management, testing, deployment, UI/UX polish, error handling, responsive design.
Each task should be completable in a single coding session.
Be specific. Do NOT wrap in markdown code fences. Return raw JSON only.`;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { prompt, projectName } = body as { prompt: string; projectName?: string };
  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  }

  const userPrompt = projectName
    ? `Project name: ${projectName}\n\nUser's request:\n${prompt}\n\nGenerate the full project plan as JSON.`
    : `User's request:\n${prompt}\n\nGenerate the full project plan as JSON. Derive a short project name from the description.`;

  try {
    const raw = await callModelDirect(
      'google/gemini-2.0-flash-001',
      [
        { role: 'system', content: PLAN_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.3, maxTokens: 16000 },
    );

    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let plan: { projectName?: string; idea?: string; techStack?: Record<string, unknown>; tasks?: unknown[] };
    try {
      plan = JSON.parse(cleaned);
    } catch {
      const arrMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        const tasks = JSON.parse(arrMatch[0]);
        plan = { tasks };
      } else {
        return NextResponse.json({ error: 'Failed to parse plan from AI response', raw: cleaned }, { status: 422 });
      }
    }

    if (!plan.tasks || !Array.isArray(plan.tasks) || plan.tasks.length === 0) {
      return NextResponse.json({ error: 'No tasks in plan', raw: cleaned }, { status: 422 });
    }

    const normalizedTasks = (plan.tasks as Record<string, unknown>[]).map((t) => ({
      title: (t.title as string) || 'Untitled task',
      description: (t.description as string) || '',
      phase: (t.phase as number) || 1,
      priority: (t.priority as string) || 'medium',
      tags: Array.isArray(t.tags) ? t.tags : [],
      subtasks: Array.isArray(t.subtasks) ? (t.subtasks as unknown[]).filter((s: unknown) => typeof s === 'string') : [],
    }));

    return NextResponse.json({
      projectName: plan.projectName || projectName || 'Untitled Project',
      idea: plan.idea || '',
      techStack: plan.techStack || {},
      tasks: normalizedTasks,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
