import { NextRequest } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const sb = createAdminSupabase();

  const stream = new ReadableStream({
    start(controller) {
      if (!sb) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: 'Supabase not configured' })}\n\n`));
        controller.close();
        return;
      }

      const seen = new Set<string>();
      let stopped = false;

      const emit = (event: string, data: unknown) => {
        if (stopped) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const tick = async () => {
        try {
          const { data } = await sb
            .from('forge_samples')
            .select('id, created_at, model_id, quality_score, outcome')
            .order('created_at', { ascending: false })
            .limit(20);
          const rows = (data || []).slice().reverse();
          for (const row of rows) {
            if (!seen.has(row.id)) {
              seen.add(row.id);
              emit('sample', row);
            }
          }
          if (seen.size > 400) {
            const newest = Array.from(seen).slice(-200);
            seen.clear();
            newest.forEach((id) => seen.add(id));
          }
          emit('heartbeat', { ts: Date.now() });
        } catch {
          emit('error', { message: 'Feed poll failed' });
        }
      };

      const interval = setInterval(() => void tick(), 4000);
      void tick();

      request.signal.addEventListener('abort', () => {
        stopped = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // ignored
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
