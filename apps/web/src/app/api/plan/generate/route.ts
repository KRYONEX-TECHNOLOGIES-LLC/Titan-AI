import { NextRequest, NextResponse } from 'next/server';

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
- "title": string (short task title)
- "description": string (what needs to be done, be specific about files, components, APIs)
- "phase": number (1 = setup/foundation, 2 = core features, 3 = polish/testing)
- "priority": "critical" | "high" | "medium" | "low"
- "tags": string[] (relevant tech tags like "react", "api", "database", "auth", "ui")

Rules:
- Break the project into 15-200+ specific, actionable tasks depending on complexity.
- Cover ALL aspects: frontend, backend, database schema, auth, API routes, components, pages, state management, testing, deployment, UI/UX polish, error handling, responsive design.
- Tasks should be ordered logically (foundations first, then features, then polish).
- Each task should be completable in a single coding session.
- Be specific — not "build the frontend" but "Create LoginPage component with email/password form, validation, and error display".
- Include database migrations, API endpoints, component creation, hook creation, state management, styling, and integration tasks separately.`;

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

    return NextResponse.json({ tasks });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
