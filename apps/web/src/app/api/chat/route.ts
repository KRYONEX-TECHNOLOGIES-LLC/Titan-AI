/**
 * Chat Completion API
 * Routes requests to the configured LLM provider
 */

import { NextRequest, NextResponse } from 'next/server';

export interface ChatRequest {
  sessionId: string;
  message: string;
  model: string;
  stream?: boolean;
  codeContext?: {
    file: string;
    content: string;
    selection?: string;
    language: string;
  };
  contextFiles?: string[];
}

export interface ChatResponse {
  id: string;
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  suggestedEdits?: Array<{
    file: string;
    content: string;  // Full new file content for diff preview
    range?: { startLine: number; endLine: number };
    oldContent?: string;
    newContent?: string;
  }>;
}

function normalizeProviderError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (!(error instanceof Error)) {
    return {
      status: 500,
      code: 'provider_error',
      message: 'Unexpected chat provider failure.',
    };
  }

  const msg = error.message.toLowerCase();
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('user not found')) {
    return {
      status: 401,
      code: 'provider_auth_failed',
      message: 'Provider authentication failed. Check your API key/account.',
    };
  }
  if (msg.includes('403') || msg.includes('forbidden')) {
    return {
      status: 403,
      code: 'provider_forbidden',
      message: 'Provider request was forbidden. Check account permissions.',
    };
  }
  if (msg.includes('429') || msg.includes('rate limit')) {
    return {
      status: 429,
      code: 'provider_rate_limited',
      message: 'Provider rate limited the request.',
    };
  }
  if (msg.includes('fetch failed') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('timeout')) {
    return {
      status: 502,
      code: 'provider_unreachable',
      message: 'Provider is unreachable. Check base URL/network.',
    };
  }

  return {
    status: 500,
    code: 'provider_error',
    message: error.message,
  };
}

/**
 * POST /api/chat - Send a chat message
 */
export async function POST(request: NextRequest) {
  const body: ChatRequest = await request.json();
  const { message, model, codeContext, stream } = body;

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  // Build system prompt with code context
  let systemPrompt = `You are Titan AI, an elite coding assistant integrated into the Titan AI IDE.
You have access to the user's code and can provide contextual assistance.

Guidelines:
- Provide precise, actionable code suggestions
- When suggesting code changes, use diff format (- for removed, + for added)
- Reference specific line numbers when discussing code
- Keep explanations concise but thorough
- If you suggest changes, format them as code blocks
`;

  if (codeContext) {
    systemPrompt += `
Current file: ${codeContext.file}
Language: ${codeContext.language}

${codeContext.selection ? `Selected code:\n\`\`\`${codeContext.language}\n${codeContext.selection}\n\`\`\`` : ''}

Full file context:
\`\`\`${codeContext.language}
${codeContext.content}
\`\`\`
`;
  }

  const apiModel = normalizeRequestedModel(model);
  const provider = resolveProvider(apiModel);
  const providerEnv = resolveProviderEnv();
  const litellmValidation = validateProviderConfig('litellm', providerEnv);
  const openrouterValidation = validateProviderConfig('openrouter', providerEnv);
  if (!litellmValidation.ok && !openrouterValidation.ok) {
    return NextResponse.json(
      {
        error: 'No usable chat provider is configured.',
        code: 'missing_provider_config',
        requiredEnv: [
          ...new Set([
            ...litellmValidation.requiredEnv,
            ...openrouterValidation.requiredEnv,
          ]),
        ],
        providerErrors: {
          litellm: {
            code: litellmValidation.code,
            message: litellmValidation.message,
          },
          openrouter: {
            code: openrouterValidation.code,
            message: openrouterValidation.message,
          },
        },
      },
      { status: 400 }
    );
  }
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message },
  ];

  if (stream) {
    return streamChatResponse(messages, apiModel, provider, codeContext);
  }

  try {
    const response = await callLiveModel(messages, apiModel, provider);
    const suggestedEdits = extractSuggestedEdits(response.content, codeContext);

    return NextResponse.json({
      id: response.id,
      content: response.content,
      model: response.model,
      usage: response.usage,
      suggestedEdits,
    });
  } catch (error) {
    const normalized = normalizeProviderError(error);
    return NextResponse.json(
      {
        error: normalized.message,
        code: normalized.code,
      },
      { status: normalized.status }
    );
  }
}

interface LiveProviderResponse {
  id: string;
  model: string;
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type Provider = 'litellm' | 'openrouter';

type ResolvedProviderEnv = {
  openRouterApiKey: string;
  openRouterBaseUrl: string;
  liteLlmBaseUrl: string;
  liteLlmApiKey: string;
};

type ConfigValidation =
  | { ok: true }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      requiredEnv: string[];
    };

type ProviderHealthState = {
  failures: number;
  circuitOpenUntil: number;
  lastFailureCode?: string;
};

const providerHealth: Record<Provider, ProviderHealthState> = {
  litellm: { failures: 0, circuitOpenUntil: 0 },
  openrouter: { failures: 0, circuitOpenUntil: 0 },
};

const providerProbeCache = {
  litellm: { checkedAt: 0, healthy: false },
};

const CIRCUIT_BREAKER_FAIL_THRESHOLD = 3;
const CIRCUIT_BREAKER_OPEN_MS = 60_000;
const PROVIDER_MAX_ATTEMPTS = 2;
const LITELLM_PROBE_TTL_MS = 10_000;

function envValue(...names: string[]): string {
  for (const name of names) {
    const raw = process.env[name];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return '';
}

function looksLikePlaceholder(value: string): boolean {
  if (!value) return true;
  const lower = value.toLowerCase();
  return (
    /\.\.\.\.\.\.\.\./.test(value) ||
    /x{4,}/i.test(value) ||
    /-xx/i.test(lower) ||
    lower.includes('ab3cd4') ||
    lower.includes('xxxxxxxx') ||
    lower.includes('xxxx-xxxx') ||
    lower.includes('yourdomain') ||
    lower.includes('your company') ||
    lower.includes('yourcertificatepassword') ||
    lower.includes('placeholder')
  );
}

function resolveProviderEnv(): ResolvedProviderEnv {
  return {
    openRouterApiKey: envValue('OPENROUTER_API_KEY'),
    openRouterBaseUrl: envValue('OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1',
    liteLlmBaseUrl: envValue('TITAN_LITELLM_BASE_URL', 'LITELLM_PROXY_URL'),
    liteLlmApiKey: envValue('TITAN_LITELLM_API_KEY', 'LITELLM_MASTER_KEY'),
  };
}

function validateProviderConfig(provider: Provider, env: ResolvedProviderEnv): ConfigValidation {
  if (provider === 'openrouter') {
    if (!env.openRouterApiKey) {
      return {
        ok: false,
        status: 400,
        code: 'missing_provider_config',
        message: 'OpenRouter selected but OPENROUTER_API_KEY is missing.',
        requiredEnv: ['OPENROUTER_API_KEY'],
      };
    }
    if (looksLikePlaceholder(env.openRouterApiKey)) {
      return {
        ok: false,
        status: 400,
        code: 'placeholder_provider_config',
        message: 'OPENROUTER_API_KEY still looks like placeholder data.',
        requiredEnv: ['OPENROUTER_API_KEY'],
      };
    }
    return { ok: true };
  }

  if (!env.liteLlmBaseUrl) {
    return {
      ok: false,
      status: 400,
      code: 'missing_provider_config',
      message: 'LiteLLM selected but base URL is missing.',
      requiredEnv: ['TITAN_LITELLM_BASE_URL or LITELLM_PROXY_URL'],
    };
  }
  if (env.liteLlmApiKey && looksLikePlaceholder(env.liteLlmApiKey)) {
    return {
      ok: false,
      status: 400,
      code: 'placeholder_provider_config',
      message: 'LiteLLM API key still looks like placeholder data.',
      requiredEnv: ['TITAN_LITELLM_API_KEY or LITELLM_MASTER_KEY'],
    };
  }
  return { ok: true };
}

function fallbackProvider(primary: Provider): Provider | null {
  const env = resolveProviderEnv();
  if (primary === 'openrouter' && env.liteLlmBaseUrl) {
    return 'litellm';
  }
  if (primary === 'litellm' && env.openRouterApiKey) {
    return 'openrouter';
  }
  return null;
}

function providerConfigOk(provider: Provider, env: ResolvedProviderEnv): boolean {
  return validateProviderConfig(provider, env).ok;
}

function providerCircuitOpen(provider: Provider): boolean {
  return providerHealth[provider].circuitOpenUntil > Date.now();
}

function providerEligible(provider: Provider, env: ResolvedProviderEnv): boolean {
  return providerConfigOk(provider, env) && !providerCircuitOpen(provider);
}

function rankProvidersByHealth(providers: Provider[]): Provider[] {
  return [...providers].sort((a, b) => {
    const aOpen = providerCircuitOpen(a) ? 1 : 0;
    const bOpen = providerCircuitOpen(b) ? 1 : 0;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return providerHealth[a].failures - providerHealth[b].failures;
  });
}

function isTransientProviderError(error: unknown): boolean {
  const normalized = normalizeProviderError(error);
  return normalized.code === 'provider_unreachable' || normalized.code === 'provider_rate_limited';
}

function markProviderSuccess(provider: Provider) {
  providerHealth[provider] = {
    failures: 0,
    circuitOpenUntil: 0,
    lastFailureCode: undefined,
  };
}

function markProviderFailure(provider: Provider, error: unknown) {
  const normalized = normalizeProviderError(error);
  const failures = providerHealth[provider].failures + 1;
  const shouldOpen =
    failures >= CIRCUIT_BREAKER_FAIL_THRESHOLD &&
    (normalized.code === 'provider_unreachable' || normalized.code === 'provider_rate_limited');

  providerHealth[provider] = {
    failures,
    circuitOpenUntil: shouldOpen ? Date.now() + CIRCUIT_BREAKER_OPEN_MS : providerHealth[provider].circuitOpenUntil,
    lastFailureCode: normalized.code,
  };
}

async function probeLiteLlm(env: ResolvedProviderEnv): Promise<boolean> {
  const now = Date.now();
  if (now - providerProbeCache.litellm.checkedAt < LITELLM_PROBE_TTL_MS) {
    return providerProbeCache.litellm.healthy;
  }

  if (!env.liteLlmBaseUrl || looksLikePlaceholder(env.liteLlmBaseUrl)) {
    providerProbeCache.litellm = { checkedAt: now, healthy: false };
    return false;
  }

  const base = env.liteLlmBaseUrl.replace(/\/$/, '');
  const endpoints = [`${base}/health`, `${base}/models`];

  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(endpoint, { method: 'GET' }, 1500);
      if (response.ok || response.status === 401 || response.status === 403) {
        providerProbeCache.litellm = { checkedAt: now, healthy: true };
        return true;
      }
    } catch {
      // try next probe endpoint
    }
  }

  providerProbeCache.litellm = { checkedAt: now, healthy: false };
  return false;
}

async function providerPlan(model: string, preferred: Provider, env: ResolvedProviderEnv): Promise<Provider[]> {
  const candidates: Provider[] = [];

  if (providerConfigOk(preferred, env)) {
    candidates.push(preferred);
  }

  const fallback = fallbackProvider(preferred);
  if (fallback && providerConfigOk(fallback, env) && !candidates.includes(fallback)) {
    candidates.push(fallback);
  }

  const modelPreferred: Provider =
    model.startsWith('anthropic/') || model.startsWith('openai/')
      ? 'openrouter'
      : 'litellm';
  if (providerConfigOk(modelPreferred, env) && !candidates.includes(modelPreferred)) {
    candidates.push(modelPreferred);
  }

  for (const provider of ['litellm', 'openrouter'] as Provider[]) {
    if (providerConfigOk(provider, env) && !candidates.includes(provider)) {
      candidates.push(provider);
    }
  }

  let ranked = rankProvidersByHealth(candidates);
  if (ranked.includes('litellm') && ranked.length > 1) {
    const healthy = await probeLiteLlm(env);
    if (!healthy) {
      ranked = [...ranked.filter(p => p !== 'litellm'), 'litellm' as const];
    }
  }

  const eligible = ranked.filter(provider => providerEligible(provider, env));
  const lastResort = ranked.filter(
    provider => !providerEligible(provider, env) && providerConfigOk(provider, env)
  );

  return [...eligible, ...lastResort];
}

function extractSuggestedEdits(
  content: string,
  codeContext?: ChatRequest['codeContext']
): ChatResponse['suggestedEdits'] {
  if (!codeContext?.file || !codeContext?.content) return [];

  const fencedBlocks = [...content.matchAll(/```(?:\w+)?\n([\s\S]*?)```/g)];
  if (fencedBlocks.length === 0) return [];

  // Use the largest code block as the likely full-file replacement.
  const best = fencedBlocks
    .map(block => block[1]?.trim() || '')
    .sort((a, b) => b.length - a.length)[0];

  if (!best || best.length < 20) return [];
  if (best === codeContext.content.trim()) return [];

  return [
    {
      file: codeContext.file,
      content: best,
      range: { startLine: 1, endLine: Math.max(1, codeContext.content.split('\n').length) },
      oldContent: codeContext.content,
      newContent: best,
    },
  ];
}

function normalizeRequestedModel(model: string): string {
  if (!model?.trim()) return 'openai/gpt-5.3';
  const lower = model.toLowerCase();
  if (lower.includes('claude') && !model.includes('/')) {
    return `anthropic/${model}`;
  }
  if ((lower.includes('gpt') || lower.includes('o1') || lower.includes('o3')) && !model.includes('/')) {
    return `openai/${model}`;
  }
  return model;
}

function resolveProvider(model: string): Provider {
  const env = resolveProviderEnv();
  if (env.liteLlmBaseUrl && !looksLikePlaceholder(env.liteLlmBaseUrl)) return 'litellm';
  if (env.openRouterApiKey && !looksLikePlaceholder(env.openRouterApiKey)) return 'openrouter';
  if (model.startsWith('anthropic/') || model.startsWith('openai/')) return 'openrouter';
  return 'litellm';
}

async function callLiveModel(
  messages: Array<{ role: string; content: string }>,
  model: string,
  provider: Provider
): Promise<LiveProviderResponse> {
  const env = resolveProviderEnv();
  const plan = await providerPlan(model, provider, env);
  if (plan.length === 0) {
    throw new Error('No configured chat providers are currently available.');
  }

  let lastError: unknown = new Error('No provider attempts were executed.');

  for (const candidate of plan) {
    for (let attempt = 1; attempt <= PROVIDER_MAX_ATTEMPTS; attempt++) {
      try {
        const result = candidate === 'openrouter'
          ? await callOpenRouter(messages, model)
          : await callLiteLLM(messages, model);
        markProviderSuccess(candidate);
        return result;
      } catch (error) {
        markProviderFailure(candidate, error);
        lastError = error;
        if (!isTransientProviderError(error) || attempt >= PROVIDER_MAX_ATTEMPTS) {
          break;
        }
      }
    }
  }

  throw lastError;
}

async function callOpenRouter(
  messages: Array<{ role: string; content: string }>,
  model: string
): Promise<LiveProviderResponse> {
  const env = resolveProviderEnv();
  const apiKey = env.openRouterApiKey;
  if (!apiKey || looksLikePlaceholder(apiKey)) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const baseUrl = env.openRouterBaseUrl;
  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
      'X-Title': 'Titan AI',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${errorText}`);
  }

  const json = await response.json() as {
    id: string;
    model: string;
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  return {
    id: json.id || `chat-${Date.now()}`,
    model: json.model || model,
    content: json.choices?.[0]?.message?.content || '',
    usage: {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      totalTokens: json.usage?.total_tokens ?? 0,
    },
  };
}

async function callLiteLLM(
  messages: Array<{ role: string; content: string }>,
  model: string
): Promise<LiveProviderResponse> {
  const env = resolveProviderEnv();
  const baseUrl = env.liteLlmBaseUrl;
  const apiKey = env.liteLlmApiKey;
  if (!baseUrl) {
    throw new Error('TITAN_LITELLM_BASE_URL is not configured');
  }

  const response = await fetchWithTimeout(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LiteLLM request failed (${response.status}): ${errorText}`);
  }

  const json = await response.json() as {
    id: string;
    model: string;
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  return {
    id: json.id || `chat-${Date.now()}`,
    model: json.model || model,
    content: json.choices?.[0]?.message?.content || '',
    usage: {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      totalTokens: json.usage?.total_tokens ?? 0,
    },
  };
}

interface StreamResult {
  id?: string;
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

async function streamChatResponse(
  messages: Array<{ role: string; content: string }>,
  model: string,
  provider: Provider,
  codeContext?: ChatRequest['codeContext']
): Promise<Response> {
  const encoder = new TextEncoder();
  let fullContent = '';
  let finalResult: StreamResult = {};

  const sse = new ReadableStream({
    async start(controller) {
      const emit = (event: string, payload: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
        );
      };

      try {
        const streamId = `chat-${Date.now()}`;
        const env = resolveProviderEnv();
        const plan = await providerPlan(model, provider, env);
        if (plan.length === 0) {
          throw new Error('No configured chat providers are currently available for streaming.');
        }

        let activeProvider: Provider | null = null;
        let lastError: unknown = null;
        let attemptCounter = 0;

        for (const candidate of plan) {
          for (let attempt = 1; attempt <= PROVIDER_MAX_ATTEMPTS; attempt++) {
            attemptCounter += 1;
            activeProvider = candidate;
            fullContent = '';
            emit('start', {
              id: streamId,
              model,
              provider: activeProvider,
              retry: attemptCounter > 1,
              attempt: attemptCounter,
            });

            try {
              finalResult = await streamProvider(messages, model, activeProvider, token => {
                fullContent += token;
                emit('token', { content: token });
              });
              markProviderSuccess(activeProvider);
              lastError = null;
              break;
            } catch (error) {
              markProviderFailure(activeProvider, error);
              lastError = error;
              if (!isTransientProviderError(error) || attempt >= PROVIDER_MAX_ATTEMPTS) {
                break;
              }
            }
          }
          if (!lastError) {
            break;
          }
        }

        if (lastError) {
          throw lastError;
        }

        const usage =
          finalResult.usage ?? estimateUsageFromText(messages, fullContent);
        const suggestedEdits = extractSuggestedEdits(fullContent, codeContext);

        emit('done', {
          id: finalResult.id || `chat-${Date.now()}`,
          model: finalResult.model || model,
          provider: activeProvider ?? provider,
          content: fullContent,
          usage,
          suggestedEdits,
        });
      } catch (error) {
        emit('error', { message: error instanceof Error ? error.message : 'Streaming failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(sse, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function estimateUsageFromText(
  messages: Array<{ role: string; content: string }>,
  content: string
): { promptTokens: number; completionTokens: number; totalTokens: number } {
  const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const completionChars = content.length;
  const promptTokens = Math.ceil(promptChars / 4);
  const completionTokens = Math.ceil(completionChars / 4);
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

async function streamProvider(
  messages: Array<{ role: string; content: string }>,
  model: string,
  provider: Provider,
  onToken: (token: string) => void
): Promise<StreamResult> {
  if (provider === 'openrouter') {
    return streamOpenRouter(messages, model, onToken);
  }
  return streamLiteLLM(messages, model, onToken);
}

async function streamOpenRouter(
  messages: Array<{ role: string; content: string }>,
  model: string,
  onToken: (token: string) => void
): Promise<StreamResult> {
  const env = resolveProviderEnv();
  const apiKey = env.openRouterApiKey;
  if (!apiKey || looksLikePlaceholder(apiKey)) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const baseUrl = env.openRouterBaseUrl;
  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
      'X-Title': 'Titan AI',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter stream failed (${response.status}): ${errorText}`);
  }

  return consumeSSEStream(response, onToken);
}

async function streamLiteLLM(
  messages: Array<{ role: string; content: string }>,
  model: string,
  onToken: (token: string) => void
): Promise<StreamResult> {
  const env = resolveProviderEnv();
  const baseUrl = env.liteLlmBaseUrl;
  const apiKey = env.liteLlmApiKey;
  if (!baseUrl) {
    throw new Error('TITAN_LITELLM_BASE_URL is not configured');
  }

  const response = await fetchWithTimeout(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LiteLLM stream failed (${response.status}): ${errorText}`);
  }

  return consumeSSEStream(response, onToken);
}

async function consumeSSEStream(
  response: Response,
  onToken: (token: string) => void
): Promise<StreamResult> {
  if (!response.body) {
    throw new Error('Streaming response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: StreamResult = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;

      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data) as {
          id?: string;
          model?: string;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          choices?: Array<{ delta?: { content?: string } }>;
          type?: string;
          delta?: { text?: string };
        };

        if (parsed.id) result.id = parsed.id;
        if (parsed.model) result.model = parsed.model;

        // OpenAI/LiteLLM/OpenRouter-style delta
        const token = parsed.choices?.[0]?.delta?.content;
        if (token) onToken(token);

        // Anthropic-style text delta fallback (if routed through another proxy shape)
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          onToken(parsed.delta.text);
        }

        if (parsed.usage) {
          const promptTokens = parsed.usage.prompt_tokens ?? 0;
          const completionTokens = parsed.usage.completion_tokens ?? 0;
          const totalTokens = parsed.usage.total_tokens ?? promptTokens + completionTokens;
          result.usage = { promptTokens, completionTokens, totalTokens };
        }
      } catch {
        // Ignore malformed SSE chunks
      }
    }
  }

  return result;
}
