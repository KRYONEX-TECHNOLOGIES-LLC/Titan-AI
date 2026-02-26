import { NextRequest, NextResponse } from 'next/server';
import { parsePseudoCode } from '@/lib/plan/pseudo-code-protocol';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { input } = await req.json();

    if (!input || typeof input !== 'string' || input.trim().length < 10) {
      return NextResponse.json({ error: 'Input must be at least 10 characters' }, { status: 400 });
    }

    const result = await parsePseudoCode(input);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[plan/pseudo-code] Error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
