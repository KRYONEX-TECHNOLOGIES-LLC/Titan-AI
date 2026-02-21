# Agent cost comparison — price examples

All numbers use your [model-registry.ts](apps/web/src/lib/model-registry.ts) prices (per 1M tokens).  
Example run: **15 LLM turns** (1 plan + 13 tool-calling rounds + 1 final), ~**500K input** and ~**25K output** total.

---

## Prices per 1M tokens (from registry)

| Model | Input | Output |
|-------|-------|--------|
| Claude Opus 4.6 | $15 | $75 |
| GPT-5.3 | $10 | $40 |
| Gemini 2.5 Flash | $0.15 | $0.60 |
| Qwen3 Coder | $0.40 | $1.60 |
| Qwen 2.5 Coder 72B | $0.35 | $0.40 |

---

## Example run (15 turns)

Rough token split used for every option below:

- **Turn 1 (plan):** 30K in, 3K out  
- **Turns 2–14 (worker):** 13 × (35K in, 1.5K out) = 455K in, 19.5K out  
- **Turn 15 (final):** 40K in, 2K out  

Total: **525K input**, **24.5K output** (rounded to 500K / 25K in summaries).

---

## Option A — Current (no routing): one model for everything

**Opus 4.6 for all 15 turns**

- Cost: (0.5 × $15) + (0.025 × $75) = **$7.50 + $1.88 ≈ $9.38 per run**

This is the “cost explosion” case: same premium model on every turn.

---

## Option B — Plan: Opus plan + final, Gemini Flash worker

**Opus 4.6:** turn 1 (plan) + turn 15 (final).  
**Gemini 2.5 Flash:** turns 2–14 (tool-calling).

| Part | Tokens | Model | Cost |
|------|--------|--------|------|
| Turn 1 | 30K in, 3K out | Opus 4.6 | (0.03×15)+(0.003×75) ≈ **$0.68** |
| Turns 2–14 | 455K in, 19.5K out | Gemini 2.5 Flash | (0.455×0.15)+(0.0195×0.6) ≈ **$0.08** |
| Turn 15 | 40K in, 2K out | Opus 4.6 | (0.04×15)+(0.002×75) ≈ **$0.75** |
| **Total** | | | **≈ $1.51 per run** |

---

## Option C — Your idea: GPT-5.3 for plan/final, Qwen worker

**GPT-5.3:** turn 1 (plan) + turn 15 (final).  
**Qwen3 Coder:** turns 2–14 (tool-calling).

| Part | Tokens | Model | Cost |
|------|--------|--------|------|
| Turn 1 | 30K in, 3K out | GPT-5.3 | (0.03×10)+(0.003×40) ≈ **$0.42** |
| Turns 2–14 | 455K in, 19.5K out | Qwen3 Coder | (0.455×0.4)+(0.0195×1.6) ≈ **$0.21** |
| Turn 15 | 40K in, 2K out | GPT-5.3 | (0.04×10)+(0.002×40) ≈ **$0.48** |
| **Total** | | | **≈ $1.11 per run** |

Cheaper than Option B because GPT-5.3 is cheaper than Opus and Qwen worker cost is still low.

---

## Option D — Opus plan + final, Qwen worker

**Opus 4.6:** turn 1 + turn 15.  
**Qwen3 Coder:** turns 2–14.

| Part | Tokens | Model | Cost |
|------|--------|--------|------|
| Turn 1 | 30K in, 3K out | Opus 4.6 | ≈ **$0.68** |
| Turns 2–14 | 455K in, 19.5K out | Qwen3 Coder | ≈ **$0.21** |
| Turn 15 | 40K in, 2K out | Opus 4.6 | ≈ **$0.75** |
| **Total** | | | **≈ $1.64 per run** |

Same worker as Option C, but premium planning/final with Opus (highest quality, higher cost).

---

## Option E — GPT-5.3 for everything (no worker swap)

**GPT-5.3** for all 15 turns.

- Cost: (0.5 × $10) + (0.025 × $40) = **$5 + $1 = $6.00 per run**

No routing; good quality, still ~6× more than Option B/C.

---

## Option F — Gemini 2.5 Flash for everything

**Gemini 2.5 Flash** for all 15 turns.

- Cost: (0.5 × $0.15) + (0.025 × $0.60) = **$0.075 + $0.015 ≈ $0.09 per run**

Cheapest; quality may be lower than frontier models for planning and hard tasks.

---

## Option G — Opus plan + final, Qwen 2.5 Coder 72B worker

**Opus 4.6:** turn 1 + turn 15.  
**Qwen 2.5 Coder 72B** (cheaper than Qwen3): turns 2–14.

| Part | Tokens | Model | Cost |
|------|--------|--------|------|
| Turn 1 | 30K in, 3K out | Opus 4.6 | ≈ **$0.68** |
| Turns 2–14 | 455K in, 19.5K out | Qwen 2.5 Coder 72B | (0.455×0.35)+(0.0195×0.4) ≈ **$0.17** |
| Turn 15 | 40K in, 2K out | Opus 4.6 | ≈ **$0.75** |
| **Total** | | | **≈ $1.60 per run** |

Slightly cheaper worker than Qwen3; total close to Option D.

---

## Summary table (per 15-turn run)

| Option | Description | Est. cost/run |
|--------|-------------|----------------|
| **A** | Opus 4.6 only (current) | **$9.38** |
| **B** | Opus plan + final, Gemini Flash worker | **$1.51** |
| **C** | GPT-5.3 plan + final, Qwen3 Coder worker | **$1.11** |
| **D** | Opus plan + final, Qwen3 Coder worker | **$1.64** |
| **E** | GPT-5.3 only | **$6.00** |
| **F** | Gemini 2.5 Flash only | **$0.09** |
| **G** | Opus plan + final, Qwen 2.5 Coder 72B worker | **$1.60** |

---

## Scaling (e.g. 50 turns like your “50 calls in 1 min” case)

Approximate **per-run** cost if we scale the same pattern to 50 turns (1 plan + 48 worker + 1 final):

| Option | Est. cost per 50-turn run |
|--------|---------------------------|
| A (Opus only) | **~$31** |
| B (Opus + Gemini Flash) | **~$4.50** |
| C (GPT-5.3 + Qwen3) | **~$3.20** |
| D (Opus + Qwen3) | **~$5.00** |
| E (GPT-5.3 only) | **~$20** |
| F (Gemini only) | **~$0.28** |
| G (Opus + Qwen 72B) | **~$4.90** |

---

## How this helps you decide

- **Cheapest per run (with routing):** Option **C** (GPT-5.3 + Qwen worker) at **~$1.11** for 15 turns.
- **Strong planning, cheap worker:** Option **B** (Opus + Gemini Flash) at **~$1.51**; Opus sets the plan and does the final summary.
- **Strong planning + Qwen worker (your stack):** Option **D** or **G** (~$1.60–1.64); same worker idea as C but Opus instead of GPT-5.3 for plan/final.

Once you pick an option (e.g. C vs B vs D), we can lock that into the “Fix Agent Cost Explosion” plan and implement it.
