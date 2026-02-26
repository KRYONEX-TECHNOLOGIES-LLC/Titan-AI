// ── Titan Forge — Evaluation Harness ──
// Benchmarks the student model against teacher models.
// Sends the same 100 prompts to both and judges with a third model.
// Stores results in forge_evals table.
// Student passes when score_ratio >= 0.85 (student is 85% as good as teacher).

import { ForgeDB } from './db.js';
import type { ForgeEval, EvalMetrics, ForgeSample } from './types.js';

const db = new ForgeDB();

const EVAL_CATEGORIES = ['bug_fix', 'feature', 'refactor', 'config', 'general'] as const;

// Judge prompt template — used to score both teacher and student responses
function buildJudgePrompt(userPrompt: string, response: string): string {
  return `You are an expert code reviewer evaluating an AI coding assistant's response.

User prompt:
${userPrompt}

AI response:
${response}

Score this response on a scale of 0-10 based on:
1. Correctness: Is the code correct and will it work?
2. Completeness: Does it fully address the request?
3. Tool usage: Did it use the right tools (edit_file, run_command, etc.)?
4. Code quality: Is the code clean, readable, and follows best practices?
5. No hallucination: Does it only reference real files and valid tool calls?

Reply with ONLY a JSON object in this exact format (no explanation):
{"score": <number 0-10>, "reasoning": "<one sentence>"}`;
}

async function callOpenRouter(
  model: string,
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://titan-ai.kryonextech.com',
      'X-Title': 'Titan Forge Eval',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices?.[0]?.message?.content || '';
}

async function judgeResponse(
  userPrompt: string,
  response: string,
  judgeModel: string,
  apiKey: string,
): Promise<{ score: number; reasoning: string }> {
  const prompt = buildJudgePrompt(userPrompt, response);
  const raw = await callOpenRouter(judgeModel, [
    { role: 'user', content: prompt },
  ], apiKey);

  try {
    // Extract JSON from response
    const match = raw.match(/\{[^}]+\}/);
    if (!match) return { score: 5, reasoning: 'Could not parse judge response' };
    const parsed = JSON.parse(match[0]) as { score?: number; reasoning?: string };
    return {
      score: Math.max(0, Math.min(10, Number(parsed.score) || 5)),
      reasoning: String(parsed.reasoning || ''),
    };
  } catch {
    return { score: 5, reasoning: 'Parse error' };
  }
}

function categorizePrompt(messages: ForgeSample['messages']): typeof EVAL_CATEGORIES[number] {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const content = (lastUser?.content || '').toLowerCase();

  if (/bug|fix|error|broken|crash|exception|fail/.test(content)) return 'bug_fix';
  if (/add|create|implement|feature|build|new/.test(content)) return 'feature';
  if (/refactor|clean|reorganize|rename|move|restructure/.test(content)) return 'refactor';
  if (/config|yaml|json|env|settings|package\.json|tsconfig/.test(content)) return 'config';
  return 'general';
}

export class ForgeEvaluator {
  async run(opts: {
    runId: string;
    teacherModel: string;
    studentEndpoint: string;
    studentModel: string;
    judgeModel?: string;
    sampleCount?: number;
    minScore?: number;
  }): Promise<EvalMetrics | null> {
    const {
      runId,
      teacherModel,
      studentEndpoint,
      studentModel,
      judgeModel = 'openai/gpt-4o',
      sampleCount = 100,
      minScore = 7,
    } = opts;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('[forge/eval] OPENROUTER_API_KEY not set');

    // Get diverse benchmark prompts — stratified across categories
    const samples = await db.getSamplesForExport(minScore, sampleCount * 5);

    // Stratify: take up to sampleCount/5 per category
    const perCategory = Math.ceil(sampleCount / EVAL_CATEGORIES.length);
    const categoryBuckets = new Map<string, ForgeSample[]>();
    for (const s of samples) {
      const cat = categorizePrompt(s.messages);
      const bucket = categoryBuckets.get(cat) || [];
      if (bucket.length < perCategory) {
        bucket.push(s);
        categoryBuckets.set(cat, bucket);
      }
    }

    const evalSamples: ForgeSample[] = [];
    for (const bucket of categoryBuckets.values()) {
      evalSamples.push(...bucket);
    }
    const evalSet = evalSamples.slice(0, sampleCount);

    console.log(`[forge/eval] Evaluating ${evalSet.length} samples`);
    console.log(`[forge/eval] Teacher: ${teacherModel}, Student: ${studentModel}, Judge: ${judgeModel}`);

    const evalResults: Omit<ForgeEval, 'id' | 'created_at'>[] = [];
    let completed = 0;

    for (const sample of evalSet) {
      try {
        const lastUserMsg = [...sample.messages].reverse().find((m) => m.role === 'user');
        const userPrompt = lastUserMsg?.content || '';
        if (!userPrompt) continue;

        const conversationForTeacher = sample.messages.filter((m) => m.role !== 'tool');

        // Get teacher response (we already have it — it's the captured sample)
        const teacherResponse = sample.response;

        // Get student response
        const studentResponse = await callOpenRouter(
          studentModel,
          conversationForTeacher.map((m) => ({
            role: m.role,
            content: m.content || '',
          })),
          apiKey,
        );

        // Judge both
        const [teacherJudge, studentJudge] = await Promise.all([
          judgeResponse(userPrompt, teacherResponse, judgeModel, apiKey),
          judgeResponse(userPrompt, studentResponse, judgeModel, apiKey),
        ]);

        evalResults.push({
          run_id: runId,
          prompt_id: sample.id,
          teacher_model: teacherModel,
          teacher_response: teacherResponse.slice(0, 10000),
          student_response: studentResponse.slice(0, 10000),
          teacher_score: teacherJudge.score,
          student_score: studentJudge.score,
          judge_model: judgeModel,
          category: categorizePrompt(sample.messages),
        });

        completed++;
        if (completed % 10 === 0) {
          console.log(`[forge/eval] Progress: ${completed}/${evalSet.length}`);
        }

        // Rate limit: 2 evals/sec
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.warn(`[forge/eval] Sample ${sample.id} failed:`, (err as Error).message);
      }
    }

    // Store results
    await db.insertEvals(evalResults);

    // Compute and store summary metrics
    const metrics = await db.getEvalSummary(runId);
    if (metrics) {
      await db.updateRunStatus(runId, 'completed', metrics);
      console.log(`\n[forge/eval] RESULTS:`);
      console.log(`  Student win rate: ${(metrics.student_win_rate * 100).toFixed(1)}%`);
      console.log(`  Avg teacher score: ${metrics.avg_teacher_score.toFixed(2)}`);
      console.log(`  Avg student score: ${metrics.avg_student_score.toFixed(2)}`);
      console.log(`  Score ratio: ${metrics.score_ratio.toFixed(3)} (need >= 0.85 to pass)`);

      if (metrics.score_ratio >= 0.85) {
        console.log('\n  STUDENT PASSES — ready for integration into Titan model registry');
      } else {
        console.log(`\n  Student needs more training. Gap: ${((0.85 - metrics.score_ratio) * 100).toFixed(1)}%`);
        console.log('  Collect more high-value samples and re-train.');
      }
    }

    return metrics;
  }
}

// CLI entry point
export async function runEvalCLI(): Promise<void> {
  const args = process.argv.slice(2);
  const getArg = (flag: string, def: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1]! : def;
  };

  const runId = getArg('--run-id', '');
  const teacherModel = getArg('--teacher', 'anthropic/claude-opus-4.6');
  const studentModel = getArg('--student', '');
  const studentEndpoint = getArg('--endpoint', 'https://openrouter.ai/api/v1');
  const judgeModel = getArg('--judge', 'openai/gpt-4o');
  const sampleCount = parseInt(getArg('--samples', '100'), 10);

  if (!runId || !studentModel) {
    console.error('Usage: eval --run-id <ID> --student <model-id> [--teacher <model>] [--samples 100]');
    process.exit(1);
  }

  const evaluator = new ForgeEvaluator();
  await evaluator.run({ runId, teacherModel, studentEndpoint, studentModel, judgeModel, sampleCount });
}
