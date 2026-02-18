import { NextRequest, NextResponse } from 'next/server';

function baseUrl(request: NextRequest): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${baseUrl(request)}/api/midnight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'health' }),
      cache: 'no-store',
    });
    const body = await response.json();
    return NextResponse.json(body, { status: response.ok ? 200 : response.status });
  } catch (error) {
    return NextResponse.json(
      { healthy: false, message: `Health endpoint failure: ${String(error)}` },
      { status: 500 }
    );
  }
}

