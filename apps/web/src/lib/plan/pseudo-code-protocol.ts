import { callModelDirect } from '@/lib/llm-call';

export interface PseudoCodeResult {
  projectName: string;
  summary: string;
  techStack: string[];
  phases: Array<{
    name: string;
    tasks: Array<{
      title: string;
      description: string;
      priority: 'critical' | 'high' | 'medium' | 'low';
      tags: string[];
    }>;
  }>;
}

const PSEUDO_CODE_SYSTEM = `You are the Titan Pseudo-Code Architect — the most advanced pseudo-code interpreter on the planet.

Your job: take a user's pseudo-code, rough text, or vague idea and transform it into a PRECISE, COMPREHENSIVE project plan.

You operate in 3 mental stages:
1. UNDERSTAND: Parse the intent, extract explicit + implicit requirements
2. EXPAND: Fill in ALL gaps the user didn't mention but are critical (auth, error handling, DB schema, responsive design, accessibility, SEO, performance, deployment)
3. STRUCTURE: Organize into logical phases with prioritized tasks

Rules:
- Be EXHAUSTIVE: if the user mentions "login page", you infer: login form, validation, password reset, session management, protected routes, JWT/cookie handling, rate limiting
- Be SPECIFIC: "Create user model" → "Create User model with id, email (unique), passwordHash, name, avatar, createdAt, updatedAt, role (enum), emailVerified (boolean)"
- Be ORDERED: foundations first (DB, auth, API), then UI, then polish (animations, responsive, a11y)
- Generate 30-200+ tasks depending on project complexity
- Each task must be independently verifiable

Return ONLY valid JSON:
{
  "projectName": "...",
  "summary": "...",
  "techStack": ["Next.js 15", "TypeScript", "Tailwind CSS", "Prisma", "PostgreSQL"],
  "phases": [
    {
      "name": "Phase 1: Foundation",
      "tasks": [
        { "title": "...", "description": "...", "priority": "critical", "tags": ["backend", "database"] }
      ]
    }
  ]
}`;

export async function parsePseudoCode(input: string): Promise<PseudoCodeResult> {
  const response = await callModelDirect(
    'google/gemini-2.0-flash-001',
    [
      { role: 'system', content: PSEUDO_CODE_SYSTEM },
      { role: 'user', content: input },
    ],
    { temperature: 0.3, maxTokens: 16000 },
  );

  const cleaned = response.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  let parsed: PseudoCodeResult;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : { projectName: 'Untitled', summary: '', techStack: [], phases: [] };
  }

  return {
    projectName: parsed.projectName || 'Untitled Project',
    summary: parsed.summary || '',
    techStack: Array.isArray(parsed.techStack) ? parsed.techStack : [],
    phases: (parsed.phases || []).map(p => ({
      name: p.name || 'Phase',
      tasks: (p.tasks || []).map(t => ({
        title: t.title || 'Task',
        description: t.description || '',
        priority: (['critical', 'high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium') as 'critical' | 'high' | 'medium' | 'low',
        tags: Array.isArray(t.tags) ? t.tags : [],
      })),
    })),
  };
}
