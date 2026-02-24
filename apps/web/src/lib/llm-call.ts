/**
 * Direct LLM call utility — bypasses /api/chat to call OpenRouter/LiteLLM
 * directly with proper message arrays (system/user/assistant roles).
 *
 * Used by all multi-agent protocol routes (Phoenix, Supreme, Omega, v2) so
 * they don't go through the chat endpoint which adds its own system prompt
 * and flattens messages into a single concatenated string.
 */

import { MODEL_REGISTRY, normalizeModelId } from '@/lib/model-registry';

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

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: providerModelId,
      messages,
      temperature: temp,
      ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`LLM call failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return json.choices?.[0]?.message?.content || '';
}
