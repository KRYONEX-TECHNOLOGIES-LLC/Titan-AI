import { NextRequest, NextResponse } from 'next/server';
import { generateSubtasks } from '@/lib/plan/subtask-generator';
import type { CodeDirectoryData } from '@/lib/plan/code-scanner';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { checklistLabel, checklistCategory, directory } = await req.json();

    if (!checklistLabel || !directory) {
      return NextResponse.json({ error: 'checklistLabel and directory are required' }, { status: 400 });
    }

    const subtasks = await generateSubtasks(
      checklistLabel,
      checklistCategory || 'general',
      directory as CodeDirectoryData,
    );

    return NextResponse.json({ subtasks });
  } catch (err) {
    console.error('[plan/subtasks] Error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
