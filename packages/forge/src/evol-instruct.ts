// ── Titan Forge — Evol-Instruct Upgrade Pass ──
// Takes mid-quality samples (score 5-7) and evolves them into harder,
// more complex training examples using an LLM. Inspired by WizardCoder.

const EVOL_STRATEGIES = [
  'ADD_CONSTRAINTS',
  'DEEPEN',
  'CONCRETIZE',
  'INCREASE_REASONING',
  'MULTI_STEP',
] as const;

type EvolStrategy = (typeof EVOL_STRATEGIES)[number];

const STRATEGY_PROMPTS: Record<EvolStrategy, string> = {
  ADD_CONSTRAINTS: `Take this simple coding question and make it harder by adding 2-3 constraints or edge cases the solution must handle. Keep it realistic and practically useful.`,
  DEEPEN: `Take this simple coding question and make it require deeper technical knowledge. Add requirements around performance, error handling, security, or scalability.`,
  CONCRETIZE: `Take this abstract/vague coding question and make it concrete with specific technologies, frameworks, file structures, and real-world context.`,
  INCREASE_REASONING: `Take this coding question and make the solution require multi-step reasoning, algorithm design, or architectural decisions.`,
  MULTI_STEP: `Take this coding question and evolve it into a multi-step problem that requires building several components that work together.`,
};

const EVOL_SYSTEM = `You are an expert programming instructor who creates advanced coding challenges from simple ones.

RULES:
- Output ONLY valid JSON with two fields: "instruction" and "response"
- The evolved instruction must be significantly harder than the original
- The response must be a complete, working solution with code
- Include TypeScript/JavaScript examples when possible
- Do NOT include markdown formatting in the JSON values — use \\n for newlines in code`;

interface EvolInput {
  instruction: string;
  response: string;
  score: number;
}

interface EvolOutput {
  instruction: string;
  response: string;
  source: 'evol-instruct';
  originalScore: number;
  strategy: EvolStrategy;
}

function pickStrategy(idx: number): EvolStrategy {
  return EVOL_STRATEGIES[idx % EVOL_STRATEGIES.length];
}

async function evolveOne(
  item: EvolInput,
  strategy: EvolStrategy,
  apiKey: string,
): Promise<EvolOutput | null> {
  const prompt = `${STRATEGY_PROMPTS[strategy]}

ORIGINAL QUESTION:
${item.instruction.slice(0, 2000)}

ORIGINAL ANSWER (for context):
${item.response.slice(0, 2000)}

Now create an evolved, harder version. Respond with JSON: {"instruction": "...", "response": "..."}`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://titan.kryonex.com',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          { role: 'system', content: EVOL_SYSTEM },
          { role: 'user', content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content || '';

    const jsonMatch = text.match(/\{[\s\S]*"instruction"\s*:[\s\S]*"response"\s*:[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as { instruction: string; response: string };
    if (!parsed.instruction || !parsed.response) return null;
    if (parsed.instruction.length < 50 || parsed.response.length < 100) return null;

    return {
      instruction: parsed.instruction,
      response: parsed.response,
      source: 'evol-instruct',
      originalScore: item.score,
      strategy,
    };
  } catch {
    return null;
  }
}

export async function runEvolInstruct(
  items: EvolInput[],
  maxEvolve: number = 20,
): Promise<EvolOutput[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log('[evol-instruct] No API key — skipping');
    return [];
  }

  const candidates = items
    .filter(i => i.score >= 5 && i.score <= 7)
    .slice(0, maxEvolve);

  if (candidates.length === 0) {
    console.log('[evol-instruct] No mid-score candidates to evolve');
    return [];
  }

  console.log(`[evol-instruct] Evolving ${candidates.length} mid-score samples`);

  const results: EvolOutput[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const strategy = pickStrategy(i);
    const evolved = await evolveOne(candidates[i], strategy, apiKey);

    if (evolved) {
      results.push(evolved);
      console.log(`[evol-instruct] ${i + 1}/${candidates.length} evolved (${strategy}): ${evolved.instruction.slice(0, 60)}...`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[evol-instruct] Generated ${results.length} evolved samples from ${candidates.length} candidates`);
  return results;
}
