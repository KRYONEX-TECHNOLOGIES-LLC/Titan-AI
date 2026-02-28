/**
 * Direct LLM call utility — bypasses /api/chat to call OpenRouter/LiteLLM
 * directly with proper message arrays (system/user/assistant roles).
 *
 * Used by all multi-agent protocol routes (Phoenix, Supreme, Omega, v2) so
 * they don't go through the chat endpoint which adds its own system prompt
 * and flattens messages into a single concatenated string.
 *
 * Includes retry with exponential backoff for transient failures (429, 5xx, network, timeout)
 * so long-running plan/voice tasks don't fail on a single blip.
 */

import { MODEL_REGISTRY, normalizeModelId } from '@/lib/model-registry';

const LLM_REQUEST_TIMEOUT_MS = 120_000;
const LLM_RETRY_ATTEMPTS = 3;
const LLM_RETRY_DELAY_MS = 1000;

function envValue(...names: string[]): string {
  for (const name of names) {
    const raw = process.env[name];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return '';
}

function resolveProviderModelId(modelId: string): string {
  const normalized = normalizeModelId(modelId);
  const entry = MODEL_REGISTRY.find(m => m.id === normalized || m.id === modelId);
  if (entry) return entry.providerModelId;
  if (modelId.includes('/')) return modelId;
  return modelId;
}

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/429|rate limit/i.test(msg)) return true;
  if (/502|503|504|500|timeout|econnrefused|enotfound|fetch failed|network/i.test(msg)) return true;
  return false;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs = LLM_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= LLM_RETRY_ATTEMPTS; attempt++) {
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timeoutId);
      if (res.ok) return res;
      const text = await res.text().catch(() => '');
      lastError = new Error(`LLM call failed (${res.status}): ${text.slice(0, 300)}`);
      if (![429, 500, 502, 503, 504].includes(res.status)) throw lastError;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!isRetryableError(lastError) && attempt === 1) throw lastError;
    }
    if (attempt < LLM_RETRY_ATTEMPTS) {
      const delay = LLM_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError ?? new Error('LLM request failed after retries');
}

export async function callModelDirect(
  model: string,
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const openRouterKey = envValue('OPENROUTER_API_KEY');
  const litellmBase = envValue('TITAN_LITELLM_BASE_URL', 'LITELLM_PROXY_URL');
  const litellmKey = envValue('TITAN_LITELLM_API_KEY', 'LITELLM_MASTER_KEY');

  const providerModelId = resolveProviderModelId(model);
  const temp = options?.temperature ?? 0.2;

  let apiUrl: string;
  let headers: Record<string, string>;

  if (openRouterKey) {
    const base = envValue('OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1';
    apiUrl = `${base}/chat/completions`;
    headers = {
      'Authorization': `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://titan-ai.up.railway.app',
      'X-Title': 'Titan AI - Protocol Worker',
    };
  } else if (litellmBase) {
    apiUrl = `${litellmBase.replace(/\/$/, '')}/chat/completions`;
    headers = {
      'Content-Type': 'application/json',
      ...(litellmKey ? { 'Authorization': `Bearer ${litellmKey}` } : {}),
    };
  } else {
    throw new Error('No LLM provider configured (need OPENROUTER_API_KEY or TITAN_LITELLM_BASE_URL)');
  }

  const response = await fetchWithRetry(
    apiUrl,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: providerModelId,
        messages,
        temperature: temp,
        ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
      }),
    },
  );

  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return json.choices?.[0]?.message?.content || '';
}

// ═══ Tool-calling variant ═══

export interface ToolCallResult {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ModelToolResponse {
  content: string | null;
  toolCalls: ToolCallResult[];
  finishReason: string;
}

export async function callModelWithTools(
  model: string,
  messages: Array<{ role: string; content: string | null; tool_call_id?: string; tool_calls?: unknown[] }>,
  tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }>,
  options?: { temperature?: number; maxTokens?: number },
): Promise<ModelToolResponse> {
  const openRouterKey = envValue('OPENROUTER_API_KEY');
  const litellmBase = envValue('TITAN_LITELLM_BASE_URL', 'LITELLM_PROXY_URL');
  const litellmKey = envValue('TITAN_LITELLM_API_KEY', 'LITELLM_MASTER_KEY');

  const providerModelId = resolveProviderModelId(model);
  const temp = options?.temperature ?? 0.2;

  let apiUrl: string;
  let headers: Record<string, string>;

  if (openRouterKey) {
    const base = envValue('OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1';
    apiUrl = `${base}/chat/completions`;
    headers = {
      'Authorization': `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://titan-ai.up.railway.app',
      'X-Title': 'Titan AI - Alfred Voice',
    };
  } else if (litellmBase) {
    apiUrl = `${litellmBase.replace(/\/$/, '')}/chat/completions`;
    headers = {
      'Content-Type': 'application/json',
      ...(litellmKey ? { 'Authorization': `Bearer ${litellmKey}` } : {}),
    };
  } else {
    throw new Error('No LLM provider configured');
  }

  const response = await fetchWithRetry(
    apiUrl,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: providerModelId,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: temp,
        ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`LLM tool call failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const json = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          type: string;
          function: { name: string; arguments: string };
        }>;
      };
      finish_reason?: string;
    }>;
  };

  const msg = json.choices?.[0]?.message;
  const toolCalls: ToolCallResult[] = (msg?.tool_calls || []).map(tc => {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(tc.function.arguments); } catch { /* malformed args */ }
    return { id: tc.id, name: tc.function.name, arguments: args };
  });

  return {
    content: msg?.content || null,
    toolCalls,
    finishReason: json.choices?.[0]?.finish_reason || 'stop',
  };
}
