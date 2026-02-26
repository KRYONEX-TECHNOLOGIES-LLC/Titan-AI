import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

let lastAutoRun = 0;
const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours between auto-harvests

/**
 * GET /api/forge/auto-harvest
 * Lightweight endpoint that the client pings on app boot.
 * If enough time has passed since the last run, kicks off a background harvest.
 * Returns immediately — does not block the client.
 */
export async function GET() {
  const now = Date.now();
  if (now - lastAutoRun < COOLDOWN_MS) {
    const nextIn = Math.round((COOLDOWN_MS - (now - lastAutoRun)) / 60000);
    return NextResponse.json({
      status: 'cooldown',
      message: `Auto-harvest on cooldown. Next eligible in ~${nextIn} min.`,
      lastRun: new Date(lastAutoRun).toISOString(),
    });
  }

  lastAutoRun = now;

  // Pick a source based on the hour of day to spread load
  const ALL_SOURCES = [
    'github', 'stackoverflow', 'reddit', 'devto', 'mdn',
    'wikipedia', 'hackernews', 'docs', 'blog', 'dataset',
    'github-issues', 'arxiv', 'gitlab', 'npm-docs', 'competitive',
    'tech-news', 'best-practices', 'ai-research', 'innovations',
    'finance', 'real-estate', 'business-strategy', 'military-strategy',
    'chess-strategy', 'books', 'movies',
  ];
  const sourceIndex = new Date().getHours() % ALL_SOURCES.length;
  const source = ALL_SOURCES[sourceIndex];

  // Fire-and-forget: start harvest in background, don't await
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  fetch(`${baseUrl}/api/forge/harvest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source,
      topic: 'all',
      limit: 30,
      parallel: false,
      workerCount: 4,
      minScore: 6,
    }),
  }).catch((err) => {
    console.error('[auto-harvest] Background harvest failed:', err);
  });

  return NextResponse.json({
    status: 'started',
    source,
    message: `Auto-harvest started for "${source}" (30 items). Running in background.`,
  });
}
