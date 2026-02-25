import { NextRequest, NextResponse } from 'next/server';
import { generateDynamicChecklist } from '@/lib/plan/plan-brain';
import type { CodeDirectoryData } from '@/lib/plan/code-scanner';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { directory } = await req.json();

    if (!directory) {
      return NextResponse.json({ error: 'directory is required' }, { status: 400 });
    }

    const items = await generateDynamicChecklist(directory as CodeDirectoryData);
    return NextResponse.json({ items });
  } catch (err) {
    console.error('[plan/checklist] Error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
