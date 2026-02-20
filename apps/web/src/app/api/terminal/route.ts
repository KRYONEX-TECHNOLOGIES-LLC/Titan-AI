/**
 * Terminal API - Server-side command execution
 * Replaces the mock terminal with real shell commands.
 * For Railway deployment: uses execSync for request-response commands.
 * Future: WebSocket-based PTY for interactive terminals.
 */

import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';
import { requireAuth } from '@/lib/api-auth';

interface TerminalRequest {
  command: string;
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

const BLOCKED_COMMANDS = [
  /rm\s+-rf\s+\//, /del\s+\/[fs]/, /format\s+c:/i,
  /mkfs/, /dd\s+if=/, /:(){ :\|:& };:/,
  /shutdown/, /reboot/, /halt/,
];

function isCommandSafe(command: string): boolean {
  return !BLOCKED_COMMANDS.some(p => p.test(command));
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body: TerminalRequest = await request.json();
    const { command, cwd, timeout = 30000, env } = body;

    if (!command?.trim()) {
      return NextResponse.json({ error: 'Command is required' }, { status: 400 });
    }

    if (!isCommandSafe(command)) {
      return NextResponse.json({
        exitCode: 1,
        stdout: '',
        stderr: 'Command blocked by safety filter. Potentially destructive operation detected.',
      });
    }

    const workingDir = cwd ? path.resolve(process.cwd(), cwd) : process.cwd();

    try {
      const result = execSync(command, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout,
        maxBuffer: 5 * 1024 * 1024,
        env: { ...process.env, ...env, FORCE_COLOR: '0', TERM: 'dumb' },
        windowsHide: true,
      });

      return NextResponse.json({
        exitCode: 0,
        stdout: result.slice(0, 50000),
        stderr: '',
        cwd: workingDir,
      });
    } catch (e: any) {
      return NextResponse.json({
        exitCode: e.status || 1,
        stdout: (e.stdout?.toString() || '').slice(0, 50000),
        stderr: (e.stderr?.toString() || '').slice(0, 10000),
        cwd: workingDir,
      });
    }
  } catch (error) {
    console.error('Terminal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  const shell = process.platform === 'win32' ? 'powershell' : 'bash';
  return NextResponse.json({
    status: 'ok',
    platform: process.platform,
    shell,
    cwd: process.cwd(),
    description: 'POST { command, cwd?, timeout? } to execute commands',
  });
}
