import { NextRequest, NextResponse } from 'next/server';

function midnightBaseUrl(request: NextRequest): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function callMidnightAction(request: NextRequest, payload: Record<string, unknown>) {
  const response = await fetch(`${midnightBaseUrl(request)}/api/midnight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

export async function callMidnightStatus(request: NextRequest) {
  const response = await fetch(`${midnightBaseUrl(request)}/api/midnight`, {
    method: 'GET',
    cache: 'no-store',
  });

  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

export function jsonProxyResult(result: { ok: boolean; status: number; body: unknown }) {
  return NextResponse.json(result.body, { status: result.ok ? 200 : result.status });
}

