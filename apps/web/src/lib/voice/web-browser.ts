'use client';

export interface WebPage {
  url: string;
  title: string;
  content: string;
  fetchedAt: string;
}

const PAGE_CACHE = new Map<string, WebPage>();
const CACHE_TTL_MS = 300_000;

/**
 * Fetch a URL via server-side proxy and extract readable content.
 */
export async function fetchAndExtract(url: string): Promise<WebPage> {
  const cached = PAGE_CACHE.get(url);
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
    return cached;
  }

  const res = await fetch('/api/titan/browse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    throw new Error(`Browse failed (${res.status})`);
  }

  const data = (await res.json()) as { title?: string; content?: string };
  const page: WebPage = {
    url,
    title: data.title || url,
    content: (data.content || '').slice(0, 8000),
    fetchedAt: new Date().toISOString(),
  };

  PAGE_CACHE.set(url, page);
  if (PAGE_CACHE.size > 50) {
    const oldest = PAGE_CACHE.keys().next().value;
    if (oldest) PAGE_CACHE.delete(oldest);
  }

  return page;
}

/**
 * Quick search via the voice API with a research-style prompt.
 */
export async function quickResearch(topic: string): Promise<string> {
  try {
    const res = await fetch('/api/titan/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `[RESEARCH REQUEST] Research this topic and give a concise factual summary (3-5 bullet points): ${topic}`,
        conversationHistory: [],
      }),
    });

    if (!res.ok || !res.body) return '';

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const evt of events) {
        const lines = evt.split('\n');
        let eventType = '';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event:')) eventType = line.slice(6).trim();
          if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (eventType === 'voice_response' && data) {
          try {
            const payload = JSON.parse(data) as { content?: string };
            result = payload.content || '';
          } catch { /* skip */ }
        }
      }
    }

    return result;
  } catch {
    return '';
  }
}
