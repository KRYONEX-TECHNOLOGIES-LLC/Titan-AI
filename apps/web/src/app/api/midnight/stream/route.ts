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

function parseProtocolEvent(line: string): { type: string; data: Record<string, unknown> } | null {
  if (line.includes('Protocol:') && line.includes('activated')) {
    const match = line.match(/Protocol:\s*(.+?)\s*\((\w+)\)\s*activated/);
    if (match) return { type: 'protocol_squad_active', data: { name: match[1], squad: match[2] } };
  }
  if (line.includes('Protocol: Escalating from')) {
    const match = line.match(/Escalating from\s*(.+?)\s*→\s*(.+)/);
    if (match) return { type: 'protocol_escalation', data: { from: match[1].trim(), to: match[2].trim() } };
  }
  if (line.includes('Protocol: Cost')) {
    const match = line.match(/Cost\s*\$(\d+\.\d+)/);
    if (match) return { type: 'protocol_cost', data: { totalCostUsd: parseFloat(match[1]) } };
  }
  if (line.includes('Protocol: Task complete')) {
    const match = line.match(/Task complete\s*\(\$(\d+\.\d+)\)/);
    if (match) return { type: 'protocol_task_complete', data: { costUsd: parseFloat(match[1]) } };
  }
  if (line.includes('Council:')) {
    const match = line.match(/Chief=(\d+)\s*Shadow=(\d+)\s*(APPROVED|REJECTED)/);
    if (match) return {
      type: 'protocol_consensus',
      data: { chiefScore: parseInt(match[1]), shadowScore: parseInt(match[2]), passed: match[3] === 'APPROVED' },
    };
  }
  if (line.includes('Cleanup:')) {
    const match = line.match(/Cleanup:\s*(.+)/);
    if (match) return { type: 'protocol_cleanup', data: { message: match[1].trim() } };
  }
  return null;
}

/**
 * GET /api/midnight/stream - SSE stream of Midnight events
 * Polls the sidecar via the main API route every 2s, forwarding new logs
 * and protocol-specific events in real-time.
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
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          stopped = true;
        }
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

                const protocolEvent = parseProtocolEvent(line);
                if (protocolEvent) {
                  emit(protocolEvent.type, protocolEvent.data);
                }
              }
            }

            for (const line of logs.sentinelLogs || []) {
              if (!seenSentinel.has(line)) {
                seenSentinel.add(line);
                emit('sentinel_log', { message: line });

                const protocolEvent = parseProtocolEvent(line);
                if (protocolEvent) {
                  emit(protocolEvent.type, protocolEvent.data);
                }
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
          try {
            controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
          } catch {
            stopped = true;
          }
        }
      }, 15000);

      void tick();

      request.signal.addEventListener('abort', () => {
        stopped = true;
        clearInterval(loopInterval);
        clearInterval(heartbeatInterval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
