import { NextRequest, NextResponse } from 'next/server';
import { TASK_DECOMPOSITION_RULES_COMPACT } from '@/lib/shared/coding-standards';

function envValue(...names: string[]): string {
  for (const name of names) {
    const raw = process.env[name];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return '';
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { prompt } = body as { prompt: string };
  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  }

  const openRouterKey = envValue('OPENROUTER_API_KEY');
  if (!openRouterKey) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });
  }

  const systemPrompt = `You are a project planning expert. The user will describe what they want to build. You MUST respond ONLY with a valid JSON array of task objects. No markdown, no explanation, no code fences — just the raw JSON array.

Each task object must have these fields:
- "title": string (short task title — one independently-buildable feature/module)
- "description": string (what needs to be done, specific about files, components, APIs)
- "phase": number (1 = setup/foundation, 2 = core features, 3 = polish/testing)
- "priority": "critical" | "high" | "medium" | "low"
- "tags": string[] (relevant tech tags like "react", "api", "database", "auth", "ui")
- "subtasks": string[] (3-8 specific, verifiable acceptance criteria per task)

SUBTASK RULES:
- Each subtask answers YES/NO: "Does this exist and work correctly?"
- NEVER use vague subtasks like "implement the feature" or "add styling"
- GOOD: "Create EmailVerificationToken table with userId, token, expiresAt columns"
- GOOD: "Rate limit: max 3 verification emails per hour per address"
- BAD: "Set up the email system" (too vague)
- BAD: "Handle errors" (which errors? what behavior?)

SCALING (proportional to project complexity):
- Landing page / static site: 5-8 tasks
- Multi-page website with forms: 10-15 tasks
- Full SaaS with auth, DB, payments: 20-35 tasks
- Enterprise platform: 35-60+ tasks
- NEVER compress multiple systems into one task

${TASK_DECOMPOSITION_RULES_COMPACT}

COVERAGE: frontend, backend, database schema, auth, API routes, components, pages, state management, testing, deployment, UI/UX polish, error handling, responsive design.
Tasks should be ordered logically (foundations first, features, then polish).
Each task should be completable in a single coding session.
Be specific — not "build the frontend" but "Create LoginPage component with email/password form, validation, and error display".`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://titan-ai.up.railway.app',
        'X-Title': 'Titan AI Plan Generator',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `OpenRouter error: ${response.status}`, detail: errText }, { status: 502 });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';

    let tasks: unknown[] = [];
    const cleaned = content.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
    try {
      tasks = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) {
        try { tasks = JSON.parse(match[0]); } catch { /* fallback */ }
      }
    }

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json({ error: 'Failed to parse tasks from AI response', raw: content }, { status: 422 });
    }

    const normalizedTasks = tasks.map((t: any) => ({
      title: t.title || 'Untitled task',
      description: t.description || '',
      phase: t.phase || 1,
      priority: t.priority || 'medium',
      tags: Array.isArray(t.tags) ? t.tags : [],
      subtasks: Array.isArray(t.subtasks) ? t.subtasks.filter((s: unknown) => typeof s === 'string') : [],
    }));

    return NextResponse.json({ tasks: normalizedTasks });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
