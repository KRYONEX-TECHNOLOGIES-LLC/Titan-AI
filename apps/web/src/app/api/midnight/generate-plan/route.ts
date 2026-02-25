import { NextRequest, NextResponse } from 'next/server';
import { callModelDirect } from '@/lib/llm-call';

const PLAN_SYSTEM_PROMPT = `You are a senior software architect. Given a user's project idea, decompose it into structured project DNA.

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
    "Task description as a checkbox item - be specific and actionable",
    "Each task should be completable independently",
    "Order from foundation to features to polish"
  ]
}

Rules:
- Generate 5-15 tasks depending on complexity
- Tasks should be ordered: setup/scaffolding first, then core features, then polish/testing
- Each task must be specific enough that an AI coder can complete it without ambiguity
- Include a final "Run tests and verify all features work" task
- Do NOT wrap in markdown code fences, return raw JSON only`;

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

Generate the project DNA (idea.md content, tech_stack.json, and definition_of_done.md tasks) as JSON.`;

    const raw = await callModelDirect(
      'qwen3.5-plus-02-15',
      [
        { role: 'system', content: PLAN_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.3, maxTokens: 4000 },
    );

    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const plan = JSON.parse(cleaned) as {
      idea: string;
      techStack: Record<string, unknown>;
      tasks: string[];
    };

    if (!plan.idea || !plan.tasks || !Array.isArray(plan.tasks)) {
      return NextResponse.json(
        { error: 'LLM returned invalid plan structure' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      projectName: projectName || 'Untitled Project',
      idea: plan.idea,
      techStack: plan.techStack || {},
      tasks: plan.tasks,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
