import { NextRequest, NextResponse } from 'next/server';
import { callModelDirect } from '@/lib/llm-call';

export const maxDuration = 60;

const PLAN_SYSTEM_PROMPT = `You are a senior software architect specializing in autonomous build systems. Given a user's project idea, decompose it into structured project DNA with hierarchical task + subtask architecture.

Return ONLY valid JSON with this exact structure:
{
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
      "subtasks": [
        "Specific verifiable deliverable 1",
        "Specific verifiable deliverable 2",
        "Specific verifiable deliverable 3"
      ]
    }
  ]
}

SCALING RULES (NO HARDCODED CEILING):
- Static site / landing page: 5-8 tasks
- Multi-page website with forms: 10-15 tasks
- Full SaaS with auth, DB, payments: 20-35 tasks
- Enterprise platform with multiple subsystems: 35-60+ tasks
- Let the user's description drive the count. If they described 30 distinct features, create 30+ tasks.
- NEVER compress multiple unrelated systems into a single task.

SUBTASK RULES:
- Each task gets 3-8 subtasks as acceptance criteria
- Each subtask must be a single, verifiable YES/NO deliverable
- GOOD: "Add rate limiting: max 3 emails per hour per address"
- BAD: "Handle edge cases" or "Add styling" (too vague)
- Subtasks serve as the coder's checklist and the reviewer's scoring matrix

ORDERING:
- Setup/scaffolding and database schema first
- Core backend logic and API routes next
- Frontend components and pages after
- Integration, testing, and polish last
- Include a final "Run full test suite and verify all features" task

Do NOT wrap in markdown code fences. Return raw JSON only.`;

export async function POST(req: NextRequest) {
  try {
    const { instruction, projectName } = await req.json() as {
      instruction?: string;
      projectName?: string;
    };

    if (!instruction || instruction.trim().length < 5) {
      return NextResponse.json(
        { error: 'Please describe what you want to build (at least 5 characters)' },
        { status: 400 },
      );
    }

    const userPrompt = `Project name: ${projectName || 'Untitled Project'}

User's request:
${instruction}

Generate the project DNA (idea.md content, tech_stack.json, and definition_of_done.md tasks) as JSON. Scale the number of tasks proportionally to the project complexity described above. Each task MUST have subtasks.`;

    const raw = await callModelDirect(
      'google/gemini-2.0-flash-001',
      [
        { role: 'system', content: PLAN_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.3, maxTokens: 16000 },
    );

    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const plan = JSON.parse(cleaned) as {
      idea: string;
      techStack: Record<string, unknown>;
      tasks: Array<{ title: string; subtasks: string[] }>;
    };

    if (!plan.idea || !plan.tasks || !Array.isArray(plan.tasks)) {
      return NextResponse.json(
        { error: 'LLM returned invalid plan structure' },
        { status: 500 },
      );
    }

    const normalizedTasks = plan.tasks.map(t => ({
      title: typeof t === 'string' ? t : t.title || '',
      subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
    }));

    return NextResponse.json({
      projectName: projectName || 'Untitled Project',
      idea: plan.idea,
      techStack: plan.techStack || {},
      tasks: normalizedTasks,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
