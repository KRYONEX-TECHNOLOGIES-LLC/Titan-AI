/**
 * GET /api/lanes/stream — SSE endpoint for real-time lane status updates
 *
 * Query params:
 *   manifest_id — subscribe to events for a specific manifest
 *
 * Streams LaneEvent objects as SSE events.
 */

import { NextRequest } from 'next/server';
import { laneStore } from '@/lib/lanes/lane-store';
import type { LaneEvent } from '@/lib/lanes/lane-model';

export async function GET(request: NextRequest) {
  const manifestId = request.nextUrl.searchParams.get('manifest_id');

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const emit = (event: LaneEvent) => {
        try {
          controller.enqueue(encoder.encode(`event: lane_event\ndata: ${JSON.stringify(event)}\n\n`));
        } catch {
          // stream closed
        }
      };

      // Send initial state
      if (manifestId) {
        const manifest = laneStore.getManifest(manifestId);
        if (manifest) {
          try {
            controller.enqueue(encoder.encode(`event: initial_state\ndata: ${JSON.stringify({
              manifest,
              lanes: laneStore.getLanesByManifest(manifestId).map(l => ({
                lane_id: l.lane_id,
                status: l.status,
                title: l.spec.title,
                files_touched: l.files_touched.map(f => f.filePath),
                failure_count: l.failure_count,
                created_at: l.created_at,
                updated_at: l.updated_at,
              })),
              stats: laneStore.getStats(manifestId),
            })}\n\n`));
          } catch {
            // ignore
          }
        }
      }

      // Subscribe to events
      const unsub = manifestId
        ? laneStore.subscribeToManifest(manifestId, emit)
        : laneStore.subscribe(emit);

      // Send heartbeat every 30s to keep the connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
          unsub();
        }
      }, 30000);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unsub();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
