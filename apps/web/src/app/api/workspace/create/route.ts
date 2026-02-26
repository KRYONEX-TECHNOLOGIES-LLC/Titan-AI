import { NextRequest, NextResponse } from 'next/server';
import { mkdir } from 'fs/promises';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Missing folder name' }, { status: 400 });
    }

    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const basePath = process.env.TITAN_PROJECTS_DIR || join(process.cwd(), 'projects');
    await mkdir(basePath, { recursive: true });
    const fullPath = join(basePath, safeName);
    await mkdir(fullPath, { recursive: true });

    return NextResponse.json({ path: fullPath, name: safeName });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
