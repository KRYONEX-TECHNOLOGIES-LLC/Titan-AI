/**
 * Project Midnight SSE Stream
 * /api/midnight/stream - Real-time event streaming
 */

import { NextRequest } from 'next/server';

// Event generator for SSE
function* generateEvents() {
  let counter = 0;
  const events = [
    { type: 'actor_log', data: { message: 'Picking task: Build authentication module' } },
    { type: 'actor_log', data: { message: 'Reading requirements from definition_of_done.md...' } },
    { type: 'actor_log', data: { message: 'Writing src/auth/login.ts...' } },
    { type: 'sentinel_log', data: { message: 'Analyzing git diff...' } },
    { type: 'sentinel_log', data: { message: 'Running Slop Penalty Matrix...' } },
    { type: 'verdict', data: { score: 92, passed: true } },
    { type: 'confidence_update', data: { score: 95, status: 'healthy' } },
    { type: 'task_completed', data: { taskId: 'task-1', message: 'Authentication module complete' } },
  ];

  while (true) {
    yield events[counter % events.length];
    counter++;
  }
}

const eventGen = generateEvents();

/**
 * GET /api/midnight/stream - SSE stream of events
 */
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      // Initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`)
      );

      // Send heartbeat and events
      const heartbeatInterval = setInterval(() => {
        try {
          // Send heartbeat
          controller.enqueue(
            encoder.encode(`: heartbeat ${Date.now()}\n\n`)
          );
          
          // Send a mock event
          const event = eventGen.next().value;
          if (event) {
            controller.enqueue(
              encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
            );
          }
        } catch {
          clearInterval(heartbeatInterval);
          controller.close();
        }
      }, 2000);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
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
