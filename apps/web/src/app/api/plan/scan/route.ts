import { NextRequest, NextResponse } from 'next/server';
import { scanCodebase } from '@/lib/plan/code-scanner';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { fileTree, keyFiles } = await req.json();

    if (!fileTree || typeof fileTree !== 'string') {
      return NextResponse.json({ error: 'fileTree is required' }, { status: 400 });
    }

    const directory = await scanCodebase(fileTree, keyFiles);
    return NextResponse.json({ directory });
  } catch (err) {
    console.error('[plan/scan] Error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
