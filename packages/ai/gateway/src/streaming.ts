/**
 * Titan AI Gateway - Streaming Utilities
 * Server-Sent Events (SSE) parsing and handling
 */

import type { Response } from 'ky';

/**
 * Parse Server-Sent Events from a response stream
 */
export async function* parseSSE(response: Response): AsyncIterable<{
  id?: string;
  choices?: Array<{
    delta?: { content?: string; tool_calls?: unknown[] };
    finish_reason?: string;
  }>;
}> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining data in buffer
        if (buffer.trim()) {
          const event = parseSSELine(buffer);
          if (event) yield event;
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const event = parseSSELine(line);
        if (event) yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a single SSE line
 */
function parseSSELine(line: string): {
  id?: string;
  choices?: Array<{
    delta?: { content?: string; tool_calls?: unknown[] };
    finish_reason?: string;
  }>;
} | null {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith(':')) {
    return null;
  }

  if (trimmed.startsWith('data: ')) {
    const data = trimmed.slice(6);

    if (data === '[DONE]') {
      return null;
    }

    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Concatenate streaming chunks into a full response
 */
export async function collectStream(
  stream: AsyncIterable<{ delta: { content?: string } }>
): Promise<string> {
  let content = '';

  for await (const chunk of stream) {
    if (chunk.delta.content) {
      content += chunk.delta.content;
    }
  }

  return content;
}

/**
 * Create a transform stream that emits text content
 */
export function createTextStream(
  stream: AsyncIterable<{ delta: { content?: string } }>
): ReadableStream<string> {
  const iterator = stream[Symbol.asyncIterator]();

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await iterator.next();

      if (done) {
        controller.close();
        return;
      }

      if (value.delta.content) {
        controller.enqueue(value.delta.content);
      }
    },
  });
}

/**
 * Create a transform stream that emits events for streaming UI
 */
export function createEventStream(
  stream: AsyncIterable<{ id: string; delta: { content?: string }; finishReason?: string }>
): ReadableStream<Uint8Array> {
  const iterator = stream[Symbol.asyncIterator]();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await iterator.next();

      if (done) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
        return;
      }

      const event = JSON.stringify(value);
      controller.enqueue(encoder.encode(`data: ${event}\n\n`));
    },
  });
}

/**
 * Buffer streaming tokens for display optimization
 * Groups tokens that arrive within a time window
 */
export async function* bufferStream(
  stream: AsyncIterable<{ delta: { content?: string } }>,
  options: { bufferMs?: number; maxBufferSize?: number } = {}
): AsyncIterable<string> {
  const { bufferMs = 50, maxBufferSize = 10 } = options;

  let buffer = '';
  let lastFlush = Date.now();

  for await (const chunk of stream) {
    if (chunk.delta.content) {
      buffer += chunk.delta.content;

      const now = Date.now();
      const shouldFlush =
        now - lastFlush >= bufferMs || buffer.length >= maxBufferSize;

      if (shouldFlush && buffer) {
        yield buffer;
        buffer = '';
        lastFlush = now;
      }
    }
  }

  // Flush remaining buffer
  if (buffer) {
    yield buffer;
  }
}

/**
 * Type for streaming callbacks
 */
export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onComplete?: (content: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Process a stream with callbacks
 */
export async function processStream(
  stream: AsyncIterable<{ delta: { content?: string } }>,
  callbacks: StreamCallbacks
): Promise<string> {
  let content = '';

  try {
    for await (const chunk of stream) {
      if (chunk.delta.content) {
        content += chunk.delta.content;
        callbacks.onToken?.(chunk.delta.content);
      }
    }
    callbacks.onComplete?.(content);
  } catch (error) {
    callbacks.onError?.(error as Error);
    throw error;
  }

  return content;
}
