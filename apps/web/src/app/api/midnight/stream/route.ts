import { NextRequest } from 'next/server';

type MidnightStatus = {
  running?: boolean;
  confidenceScore?: number;
  confidenceStatus?: string;
};

type MidnightLogs = {
  actorLogs?: string[];
  sentinelLogs?: string[];
  lastVerdict?: { qualityScore: number; passed: boolean; message?: string } | null;
};

function getBaseUrl(request: NextRequest): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * GET /api/midnight/stream - SSE stream of events
 */
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const baseUrl = getBaseUrl(request);
  
  const stream = new ReadableStream({
    start(controller) {
      let stopped = false;
      const seenActor = new Set<string>();
      const seenSentinel = new Set<string>();
      let lastVerdictKey = '';

      const emit = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      emit('connected', { timestamp: Date.now() });

      const tick = async () => {
        if (stopped) return;
        try {
          const [statusRes, logsRes] = await Promise.all([
            fetch(`${baseUrl}/api/midnight`, { cache: 'no-store' }),
            fetch(`${baseUrl}/api/midnight`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'getLogs' }),
              cache: 'no-store',
            }),
          ]);

          if (statusRes.ok) {
            const status = (await statusRes.json()) as MidnightStatus;
            emit('confidence_update', {
              score: status.confidenceScore ?? 100,
              status: status.confidenceStatus ?? 'healthy',
              running: Boolean(status.running),
            });
          }

          if (logsRes.ok) {
            const logs = (await logsRes.json()) as MidnightLogs;

            for (const line of logs.actorLogs || []) {
              if (!seenActor.has(line)) {
                seenActor.add(line);
                emit('actor_log', { message: line });
              }
            }

            for (const line of logs.sentinelLogs || []) {
              if (!seenSentinel.has(line)) {
                seenSentinel.add(line);
                emit('sentinel_log', { message: line });
              }
            }

            if (logs.lastVerdict) {
              const verdictKey = `${logs.lastVerdict.qualityScore}:${logs.lastVerdict.passed}:${logs.lastVerdict.message || ''}`;
              if (verdictKey !== lastVerdictKey) {
                lastVerdictKey = verdictKey;
                emit('verdict', {
                  score: logs.lastVerdict.qualityScore,
                  passed: logs.lastVerdict.passed,
                  message: logs.lastVerdict.message || '',
                });
              }
            }
          }
        } catch {
          emit('error', { message: 'stream polling failed' });
        }
      };

      const loopInterval = setInterval(() => {
        void tick();
      }, 2000);

      const heartbeatInterval = setInterval(() => {
        if (!stopped) {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        }
      }, 5000);

      void tick();

      request.signal.addEventListener('abort', () => {
        stopped = true;
        clearInterval(loopInterval);
        clearInterval(heartbeatInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
