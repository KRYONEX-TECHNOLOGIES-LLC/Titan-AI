import { NextRequest, NextResponse } from 'next/server';
import { callModelDirect } from '@/lib/llm-call';
import { TASK_DECOMPOSITION_RULES_COMPACT } from '@/lib/shared/coding-standards';

export const maxDuration = 120;

async function webSearch(query: string): Promise<string> {
  try {
    const encoded = encodeURIComponent(query);
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
      headers: { 'User-Agent': 'Titan AI Agent/1.0' },
    });
    const html = await res.text();
    const results: string[] = [];
    const titleMatches = html.matchAll(/<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/g);
    for (const m of titleMatches) {
      const text = m[1].replace(/<[^>]+>/g, '').trim();
      if (text) results.push(text);
    }
    const snippetMatches = html.matchAll(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g);
    for (const m of snippetMatches) {
      const text = m[1].replace(/<[^>]+>/g, '').trim();
      if (text) results.push(text);
    }
    return results.slice(0, 10).join('\n') || 'No results found';
  } catch {
    return 'Search unavailable';
  }
}

function buildPlanSystemPrompt(researchContext: string): string {
  return `You are a world-class software architect specializing in project planning. Given a user's project idea, produce a COMPREHENSIVE plan with hierarchical tasks and subtasks. You must be EXHAUSTIVE — never skip a step, never leave anything vague.

${researchContext ? `RESEARCH CONTEXT (use this to make correct technology decisions):\n${researchContext}\n` : ''}

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
      "description": "Detailed description: WHICH files to create/edit, WHAT code to write, HOW it connects to other parts",
      "phase": 1,
      "priority": "critical",
      "tags": ["relevant", "tech", "tags"],
      "subtasks": [
        "Create <filepath> with <specific content/purpose>",
        "Install <package> and configure in <filepath>",
        "Implement <function/component> that does <specific behavior>"
      ]
    }
  ]
}

PHASE VALUES:
- 1 = Setup/foundation/scaffolding (project init, package.json, configs, folder structure)
- 2 = Core features/backend/API (database, routes, business logic, auth)
- 3 = Frontend/UI/components (pages, components, styling, interactions)
- 4 = Integration/testing/polish (connecting everything, tests, responsive, error handling)

PRIORITY VALUES: "critical" | "high" | "medium" | "low"

SCALING RULES (NO HARDCODED CEILING):
- Static site / landing page: 5-8 tasks
- Multi-page website with forms: 10-15 tasks
- Full SaaS with auth, DB, payments: 20-35 tasks
- Enterprise platform with multiple subsystems: 35-60+ tasks
- Let the user's description drive the count. NEVER compress unrelated systems into one task.

SUBTASK RULES (MANDATORY — enforced by system):
- Each task MUST have at least 3 subtasks, up to 8.
- Each subtask MUST specify a file path or concrete action.
- Each subtask must be a single, verifiable YES/NO deliverable.
- GOOD: "Create src/components/Header.tsx with logo, nav links (Home, About, Contact), and responsive hamburger menu"
- GOOD: "Create src/lib/db.ts with Prisma client initialization and connection pooling"
- GOOD: "Add rate limiting middleware in src/middleware/rateLimit.ts: max 100 req/min per IP"
- BAD: "Set up the email system" (too vague — which files? which service?)
- BAD: "Handle errors" (which errors? what behavior? what files?)
- BAD: "Style the page" (which page? what styles? which file?)

MANDATORY TASK TYPES (include when relevant):
1. SETUP TASK: Initialize project, create package.json with ALL dependencies, tsconfig.json, .gitignore, folder structure
2. CONFIG TASK: Tailwind config, ESLint, database config, environment variables (.env.example)
3. DESIGN SYSTEM TASK: If a design template is selected, create the CSS variables, theme file, global styles
4. DATABASE TASK: Schema definition, migrations, seed data
5. API TASK: Each major API endpoint or resource gets its own task
6. COMPONENT TASK: Each major UI component or page
7. INTEGRATION TASK: Connecting frontend to backend, state management
8. FINAL VERIFICATION TASK: "Run full test suite and verify all features work end-to-end"

${TASK_DECOMPOSITION_RULES_COMPACT}

ORDERING:
- Setup/scaffolding and database schema first (Phase 1)
- Core backend logic and API routes next (Phase 2)
- Frontend components and pages after (Phase 3)
- Integration, testing, and polish last (Phase 4)

COVERAGE CHECKLIST (include tasks for ALL that apply):
frontend, backend, database schema, auth, API routes, components, pages, layouts, navigation, state management, testing, deployment config, UI/UX polish, error handling, responsive design, loading states, empty states, form validation, environment variables, README.

ULTIMATE PLAN PROTOCOL — NOTHING MISSED:
- The plan will be executed by an agent that must implement every subtask. If a subtask is vague or missing a file path, the agent cannot deliver. Therefore: EVERY subtask MUST name a specific file path (e.g. src/components/X.tsx) or a specific command/config file. No "set up X" without saying which files.
- At the end of execution, the user must not be able to say "you forgot Y." Every feature, page, component, route, and config the project needs must appear as a task or subtask with a clear deliverable.
- Prefer more subtasks over fewer when in doubt. Breaking "Add auth" into "Create src/lib/auth.ts with verifyToken", "Create src/middleware/auth.ts for protected routes", "Add login form in src/components/LoginForm.tsx" is correct. One vague "Add auth" subtask is wrong.
- Each task description must state WHICH files to create or edit and WHAT to put in them. No shortcuts.

Each task should be completable in a single coding session.
Be SPECIFIC about file paths. Do NOT wrap in markdown code fences. Return raw JSON only.`;
}

function extractTechTerms(prompt: string): string[] {
  const techPatterns = [
    /\b(react|next\.?js|vue|angular|svelte|remix|astro|nuxt)\b/gi,
    /\b(express|fastify|django|flask|rails|spring|laravel|nest\.?js)\b/gi,
    /\b(typescript|javascript|python|rust|go|java|ruby|php)\b/gi,
    /\b(tailwind|bootstrap|material[- ]?ui|chakra|shadcn|radix)\b/gi,
    /\b(postgres|mysql|mongodb|sqlite|redis|supabase|firebase|prisma|drizzle)\b/gi,
    /\b(auth|oauth|jwt|stripe|payments|websocket|graphql|rest|trpc)\b/gi,
    /\b(docker|kubernetes|vercel|railway|netlify|aws|gcp|azure)\b/gi,
  ];
  const terms = new Set<string>();
  for (const pattern of techPatterns) {
    const matches = prompt.matchAll(pattern);
    for (const m of matches) terms.add(m[0].toLowerCase());
  }
  return [...terms];
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { prompt, projectName, designTemplate } = body as { prompt: string; projectName?: string; designTemplate?: string };
  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  }

  let researchContext = '';
  try {
    const techTerms = extractTechTerms(prompt);
    if (techTerms.length > 0) {
      const searchQueries = [
        `${techTerms.slice(0, 3).join(' ')} project setup guide 2026 best practices`,
      ];
      if (techTerms.includes('next.js') || techTerms.includes('nextjs')) {
        searchQueries.push('Next.js 15 app router setup 2026');
      }
      if (techTerms.includes('prisma')) {
        searchQueries.push('Prisma ORM setup guide 2026');
      }
      if (techTerms.includes('tailwind')) {
        searchQueries.push('Tailwind CSS v4 setup 2026');
      }

      const searchResults = await Promise.allSettled(
        searchQueries.slice(0, 3).map(q => webSearch(q))
      );
      const validResults = searchResults
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && r.value !== 'Search unavailable')
        .map(r => r.value);

      if (validResults.length > 0) {
        researchContext = validResults.join('\n---\n').slice(0, 4000);
      }
    }
  } catch {
    // Research is best-effort, continue without it
  }

  const systemPrompt = buildPlanSystemPrompt(researchContext);

  let userPrompt = projectName
    ? `Project name: ${projectName}\n\nUser's request:\n${prompt}`
    : `User's request:\n${prompt}\n\nDerive a short project name from the description.`;

  if (designTemplate) {
    userPrompt += `\n\nDESIGN TEMPLATE SELECTED: ${designTemplate}\nInclude a "Design System Setup" task in Phase 1 that creates CSS variables, theme file, and global styles matching this template.`;
  }

  userPrompt += '\n\nGenerate the full project plan as JSON. Be EXHAUSTIVE — do not skip any step.';

  try {
    const raw = await callModelDirect(
      'google/gemini-2.0-flash-001',
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.3, maxTokens: 32000 },
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

    const normalizedTasks = (plan.tasks as Record<string, unknown>[]).map((t) => {
      let subtasks = Array.isArray(t.subtasks) ? (t.subtasks as unknown[]).filter((s: unknown) => typeof s === 'string') : [];
      if (subtasks.length < 3) {
        const desc = (t.description as string) || '';
        const title = (t.title as string) || '';
        while (subtasks.length < 3) {
          subtasks.push(`Implement and verify: ${title} - part ${subtasks.length + 1} (${desc.slice(0, 80)})`);
        }
      }
      return {
        title: (t.title as string) || 'Untitled task',
        description: (t.description as string) || '',
        phase: (t.phase as number) || 1,
        priority: (t.priority as string) || 'medium',
        tags: Array.isArray(t.tags) ? t.tags : [],
        subtasks: subtasks as string[],
      };
    });

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
