/**
 * GET /api/git/diff?path=...&file=...&staged=true
 * Returns unified diff for a file or all changes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { simpleGit } from 'simple-git';
import path from 'path';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const workspacePath = searchParams.get('path');
  const file = searchParams.get('file');
  const staged = searchParams.get('staged') === 'true';

  if (!workspacePath) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  try {
    const git = simpleGit(path.resolve(workspacePath));

    const args: string[] = [];
    if (staged) args.push('--cached');
    if (file) args.push('--', file);

    const diff = await git.diff(args);

    // Parse the diff into structured hunks for the UI
    const files = parseDiff(diff);

    return NextResponse.json({ diff, files });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Diff failed' }, { status: 500 });
  }
}

interface DiffHunk {
  header: string;
  lines: { type: 'add' | 'remove' | 'context'; content: string; lineNo?: number }[];
}

interface DiffFile {
  from: string;
  to: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

function parseDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  if (!raw.trim()) return files;

  const fileChunks = raw.split(/^diff --git /gm).filter(Boolean);

  for (const chunk of fileChunks) {
    const lines = chunk.split('\n');
    const headerMatch = lines[0]?.match(/a\/(.+) b\/(.+)/);
    if (!headerMatch) continue;

    const file: DiffFile = {
      from: headerMatch[1],
      to: headerMatch[2],
      hunks: [],
      additions: 0,
      deletions: 0,
    };

    let currentHunk: DiffHunk | null = null;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        currentHunk = { header: line, lines: [] };
        file.hunks.push(currentHunk);
      } else if (currentHunk) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentHunk.lines.push({ type: 'add', content: line.slice(1) });
          file.additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentHunk.lines.push({ type: 'remove', content: line.slice(1) });
          file.deletions++;
        } else if (!line.startsWith('\\')) {
          currentHunk.lines.push({ type: 'context', content: line.slice(1) });
        }
      }
    }

    files.push(file);
  }

  return files;
}
