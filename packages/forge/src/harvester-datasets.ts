// ── Titan Forge — Public Dataset Adapter ──
// Streams training data from the same massive public datasets that OpenAI, Meta,
// Google, and every other AI company trains on. Uses HuggingFace Datasets REST API
// to stream targeted slices — no terabyte downloads needed.
//
// Datasets tapped:
//   FineWeb-Edu   — 1.3T tokens of educational web content (HuggingFace)
//   The Stack v2  — 4T+ tokens of code in 600+ languages (BigCode)
//   The Pile      — 825 GB from 22 diverse sources (EleutherAI)
//   CodeSearchNet — 6M functions with docstrings (GitHub)

import type { ScrapedItem } from './harvester.js';

const HF_API = 'https://datasets-server.huggingface.co';
const RATE_LIMIT_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function randomOffset(max: number): number {
  return Math.floor(Math.random() * Math.max(1, max));
}

interface HFRowsResponse {
  rows?: Array<{ row: Record<string, unknown> }>;
  num_rows_total?: number;
}

async function fetchHFRows(
  dataset: string,
  config: string,
  split: string,
  offset: number,
  length: number,
): Promise<HFRowsResponse> {
  const url = `${HF_API}/rows?dataset=${encodeURIComponent(dataset)}&config=${encodeURIComponent(config)}&split=${split}&offset=${offset}&length=${Math.min(length, 100)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TitanForge-Harvester/1.0' },
  });
  if (!res.ok) {
    console.warn(`[harvester/datasets] HF API ${res.status} for ${dataset}`);
    return {};
  }
  return res.json() as Promise<HFRowsResponse>;
}

// ════════════════════════════════════════════════════════════════
// FineWeb-Edu — Educational web content pre-filtered by HuggingFace
// The same dataset that showed dramatic improvements on knowledge benchmarks
// ════════════════════════════════════════════════════════════════

const CODE_KEYWORDS = /\b(function|class|import|export|const|let|var|def |async |await |return |interface |type |enum |struct |impl |fn |pub |mod |package |require|module\.exports|console\.log|print\(|System\.out|std::)\b/;

export async function sampleFineWebEdu(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const dataset = 'HuggingFaceFW/fineweb-edu';
  const config = 'sample-10BT';

  try {
    const infoRes = await fetch(`${HF_API}/info?dataset=${encodeURIComponent(dataset)}&config=${config}`);
    let totalRows = 10_000_000;
    if (infoRes.ok) {
      const info = await infoRes.json() as { dataset_info?: { splits?: { train?: { num_examples?: number } } } };
      totalRows = info.dataset_info?.splits?.train?.num_examples || totalRows;
    }

    let fetched = 0;
    let attempts = 0;
    const maxAttempts = limit * 3;

    while (fetched < limit && attempts < maxAttempts) {
      attempts++;
      const offset = randomOffset(totalRows - 100);
      await sleep(RATE_LIMIT_MS);

      const data = await fetchHFRows(dataset, config, 'train', offset, 20);
      if (!data.rows) continue;

      for (const { row } of data.rows) {
        if (fetched >= limit) break;
        const text = (row.text as string) || '';
        if (text.length < 300) continue;

        const hasTechContent = topic === 'all'
          ? CODE_KEYWORDS.test(text) || /\b(API|database|server|framework|algorithm|component|deploy|docker|kubernetes)\b/i.test(text)
          : text.toLowerCase().includes(topic.toLowerCase());

        if (!hasTechContent) continue;

        items.push({
          source: 'dataset',
          source_url: `huggingface:${dataset}@offset=${offset}`,
          title: `FineWeb-Edu: ${text.slice(0, 80).replace(/\n/g, ' ').trim()}...`,
          raw_content: text.slice(0, 8000),
          language: CODE_KEYWORDS.test(text) ? 'mixed' : 'general',
          tags: ['fineweb-edu', 'educational', 'web'],
        });
        fetched++;
      }
    }
  } catch (err) {
    console.error('[harvester/datasets] FineWeb-Edu error:', (err as Error).message);
  }

  console.log(`[harvester/datasets] FineWeb-Edu: ${items.length} items`);
  return items;
}

// ════════════════════════════════════════════════════════════════
// The Stack v2 — Code in 600+ programming languages
// What StarCoder2 was trained on. Pure code with metadata.
// ════════════════════════════════════════════════════════════════

export async function sampleTheStack(language: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const dataset = 'bigcode/starcoderdata';
  const config = 'default';

  try {
    const offset = randomOffset(500_000);
    await sleep(RATE_LIMIT_MS);

    const data = await fetchHFRows(dataset, config, 'train', offset, Math.min(limit * 2, 100));
    if (!data.rows) return items;

    for (const { row } of data.rows) {
      if (items.length >= limit) break;
      const content = (row.content as string) || '';
      const lang = (row.lang as string) || (row.language as string) || 'unknown';
      const maxChars = (row.max_stars_count as number) || 0;

      if (content.length < 100) continue;
      if (language !== 'all' && !lang.toLowerCase().includes(language.toLowerCase())) continue;

      items.push({
        source: 'dataset',
        source_url: `huggingface:${dataset}@offset=${offset}`,
        title: `StarCoder: ${lang} code (${content.length} chars)`,
        raw_content: content.slice(0, 10000),
        language: lang.toLowerCase(),
        tags: ['starcoder', 'the-stack', 'code', lang.toLowerCase()],
      });
    }
  } catch (err) {
    console.error('[harvester/datasets] TheStack error:', (err as Error).message);
  }

  console.log(`[harvester/datasets] StarCoder/Stack: ${items.length} items`);
  return items;
}

// ════════════════════════════════════════════════════════════════
// The Pile — 22 diverse sources: Wikipedia, ArXiv, StackExchange, GitHub, books
// By EleutherAI. Used to train GPT-NeoX, Pythia, and many others.
// ════════════════════════════════════════════════════════════════

export async function sampleThePile(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const dataset = 'EleutherAI/pile';
  const config = 'default';

  try {
    const offset = randomOffset(1_000_000);
    await sleep(RATE_LIMIT_MS);

    const data = await fetchHFRows(dataset, config, 'train', offset, Math.min(limit * 2, 100));
    if (!data.rows) return items;

    const techSubsets = new Set([
      'StackExchange', 'Github', 'ArXiv', 'Wikipedia (en)',
      'Ubuntu IRC', 'DM Mathematics', 'PhilPapers',
    ]);

    for (const { row } of data.rows) {
      if (items.length >= limit) break;
      const text = (row.text as string) || '';
      const meta = (row.meta as Record<string, unknown>) || {};
      const pileSet = (meta.pile_set_name as string) || 'unknown';

      if (text.length < 200) continue;

      if (topic !== 'all') {
        if (!techSubsets.has(pileSet) && !text.toLowerCase().includes(topic.toLowerCase())) continue;
      } else {
        if (!techSubsets.has(pileSet)) continue;
      }

      items.push({
        source: 'dataset',
        source_url: `huggingface:${dataset}@subset=${pileSet}&offset=${offset}`,
        title: `Pile/${pileSet}: ${text.slice(0, 60).replace(/\n/g, ' ').trim()}...`,
        raw_content: text.slice(0, 8000),
        language: pileSet === 'Github' ? 'mixed' : 'general',
        tags: ['the-pile', pileSet.toLowerCase().replace(/\s+/g, '-')],
      });
    }
  } catch (err) {
    console.error('[harvester/datasets] ThePile error:', (err as Error).message);
  }

  console.log(`[harvester/datasets] The Pile: ${items.length} items`);
  return items;
}

// ════════════════════════════════════════════════════════════════
// CodeSearchNet — 6M functions with documentation across 6 languages
// Perfect for instruction tuning: docstring = instruction, code = response
// ════════════════════════════════════════════════════════════════

export async function sampleCodeSearchNet(language: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const dataset = 'code_search_net';
  const validLangs = ['python', 'javascript', 'java', 'go', 'ruby', 'php'];
  const targetLang = language === 'all' ? validLangs[Math.floor(Math.random() * validLangs.length)] : language;

  if (!validLangs.includes(targetLang.toLowerCase())) {
    console.warn(`[harvester/datasets] CodeSearchNet: '${targetLang}' not available, using python`);
  }

  const config = validLangs.includes(targetLang.toLowerCase()) ? targetLang.toLowerCase() : 'python';

  try {
    const offset = randomOffset(200_000);
    await sleep(RATE_LIMIT_MS);

    const data = await fetchHFRows(dataset, config, 'train', offset, Math.min(limit, 100));
    if (!data.rows) return items;

    for (const { row } of data.rows) {
      if (items.length >= limit) break;
      const code = (row.whole_func_string as string) || (row.func_code_string as string) || '';
      const docstring = (row.func_documentation_string as string) || '';
      const funcName = (row.func_name as string) || 'unknown';
      const repoName = (row.repository_name as string) || '';

      if (code.length < 50 || docstring.length < 20) continue;

      items.push({
        source: 'dataset',
        source_url: `huggingface:${dataset}/${config}@func=${funcName}&repo=${repoName}`,
        title: `CodeSearchNet/${config}: ${funcName}`,
        raw_content: `DOCSTRING:\n${docstring}\n\nCODE:\n\`\`\`${config}\n${code}\n\`\`\``,
        language: config,
        tags: ['codesearchnet', config, 'function', 'documented'],
      });
    }
  } catch (err) {
    console.error('[harvester/datasets] CodeSearchNet error:', (err as Error).message);
  }

  console.log(`[harvester/datasets] CodeSearchNet: ${items.length} items`);
  return items;
}

// ════════════════════════════════════════════════════════════════
// Main entry: sample across all public datasets
// ════════════════════════════════════════════════════════════════

export async function samplePublicDatasets(topic: string, limit: number): Promise<ScrapedItem[]> {
  const perSource = Math.max(3, Math.ceil(limit / 4));

  const [fineWeb, stack, pile, codeNet] = await Promise.all([
    sampleFineWebEdu(topic, perSource),
    sampleTheStack(topic === 'all' ? 'all' : topic, perSource),
    sampleThePile(topic, perSource),
    sampleCodeSearchNet(topic === 'all' ? 'all' : topic, perSource),
  ]);

  const all = [...fineWeb, ...stack, ...pile, ...codeNet];
  console.log(`[harvester/datasets] Total from public datasets: ${all.length}`);
  return all.slice(0, limit);
}
