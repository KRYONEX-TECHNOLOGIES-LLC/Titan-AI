// ── Titan Forge — New Harvest Sources ──
// GitHub Issues/PRs, ArXiv CS papers, GitLab repos, npm/PyPI docs, competitive programming

import type { HarvestSource } from './types.js';
import type { ScrapedItem } from './harvester.js';
import { scrapeTechNews, scrapeBestPractices, scrapeAIResearch, scrapeInnovations } from './harvester.js';

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── GitHub Issues + PRs: Real bug reports with solutions ──

async function scrapeGitHubIssues(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const query = encodeURIComponent(
    `${topic === 'all' ? 'typescript' : topic} is:issue is:closed label:bug in:title,body`
  );
  const url = `https://api.github.com/search/issues?q=${query}&sort=reactions&order=desc&per_page=${Math.min(limit, 30)}`;

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'TitanForge-Harvester/2.0',
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return items;

    const data = await res.json() as {
      items?: Array<{
        title: string;
        html_url: string;
        body: string | null;
        labels: Array<{ name: string }>;
        pull_request?: { html_url: string };
        repository_url: string;
      }>;
    };

    for (const issue of (data.items || []).slice(0, limit)) {
      if (!issue.body || issue.body.length < 100) continue;
      await sleep(800);

      let prContent = '';
      if (issue.pull_request?.html_url) {
        try {
          const prUrl = issue.pull_request.html_url
            .replace('github.com', 'api.github.com/repos')
            .replace('/pull/', '/pulls/');
          const prRes = await fetch(prUrl, { headers });
          if (prRes.ok) {
            const pr = await prRes.json() as { body?: string; merged: boolean };
            if (pr.merged && pr.body) {
              prContent = `\n\nFIX (PR):\n${pr.body.slice(0, 3000)}`;
            }
          }
        } catch { /* skip PR fetch */ }
      }

      items.push({
        source: 'github-issues' as HarvestSource,
        source_url: issue.html_url,
        title: `Issue: ${issue.title}`,
        raw_content: `BUG REPORT:\n${issue.body.slice(0, 4000)}${prContent}`,
        language: 'typescript',
        tags: ['github-issues', 'bug-fix', ...issue.labels.map(l => l.name).slice(0, 5)],
      });
    }
  } catch (err) {
    console.error('[harvester/github-issues] Error:', (err as Error).message);
  }

  return items;
}

// ── ArXiv CS Papers: Recent ML/SE/PL research ──

const ARXIV_CATEGORIES = ['cs.AI', 'cs.SE', 'cs.PL', 'cs.LG', 'cs.CL'];

async function scrapeArxiv(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const searchTopic = topic === 'all' ? 'large language model code' : topic;
  const query = encodeURIComponent(searchTopic);
  const cats = ARXIV_CATEGORIES.map(c => `cat:${c}`).join('+OR+');
  const url = `https://export.arxiv.org/api/query?search_query=(${cats})+AND+all:${query}&start=0&max_results=${Math.min(limit, 50)}&sortBy=submittedDate&sortOrder=descending`;

  try {
    await sleep(1500);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TitanForge-Harvester/2.0' },
    });
    if (!res.ok) return items;

    const xml = await res.text();
    const entries = xml.split('<entry>').slice(1);

    for (const entry of entries.slice(0, limit)) {
      const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
      const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
      const idMatch = entry.match(/<id>([\s\S]*?)<\/id>/);

      if (!titleMatch || !summaryMatch) continue;

      const title = titleMatch[1].replace(/\s+/g, ' ').trim();
      const summary = summaryMatch[1].replace(/\s+/g, ' ').trim();
      const arxivUrl = idMatch?.[1]?.trim() || '';

      if (summary.length < 100) continue;

      items.push({
        source: 'arxiv' as HarvestSource,
        source_url: arxivUrl,
        title: `ArXiv: ${title}`,
        raw_content: `PAPER: ${title}\n\nABSTRACT:\n${summary}`,
        language: 'general',
        tags: ['arxiv', 'research', 'cs'],
      });
    }
  } catch (err) {
    console.error('[harvester/arxiv] Error:', (err as Error).message);
  }

  return items;
}

// ── GitLab Public Repos: Diversify beyond GitHub ──

async function scrapeGitLab(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const searchTopic = topic === 'all' ? 'typescript' : topic;
  const url = `https://gitlab.com/api/v4/projects?search=${encodeURIComponent(searchTopic)}&order_by=stars&sort=desc&per_page=${Math.min(limit, 20)}&with_programming_language=TypeScript`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TitanForge-Harvester/2.0' },
    });
    if (!res.ok) return items;

    const projects = await res.json() as Array<{
      id: number;
      name: string;
      web_url: string;
      description: string | null;
      star_count: number;
      readme_url?: string;
    }>;

    for (const proj of projects.slice(0, limit)) {
      if (proj.star_count < 10) continue;
      await sleep(600);

      try {
        const readmeUrl = `https://gitlab.com/api/v4/projects/${proj.id}/repository/files/README.md/raw?ref=main`;
        const readmeRes = await fetch(readmeUrl);
        if (!readmeRes.ok) continue;
        const content = await readmeRes.text();
        if (content.length < 200) continue;

        items.push({
          source: 'gitlab' as HarvestSource,
          source_url: proj.web_url,
          title: `GitLab: ${proj.name}`,
          raw_content: content.slice(0, 8000),
          language: 'typescript',
          tags: ['gitlab', 'repository'],
        });
      } catch { /* skip */ }
    }
  } catch (err) {
    console.error('[harvester/gitlab] Error:', (err as Error).message);
  }

  return items;
}

// ── npm/PyPI Package Docs: Top package READMEs ──

const TOP_NPM_PACKAGES = [
  'react', 'next', 'express', 'axios', 'lodash', 'typescript',
  'zod', 'prisma', 'drizzle-orm', 'trpc', 'tailwindcss', 'vite',
  'vitest', 'playwright', 'eslint', 'prettier', 'zustand', 'jotai',
  'react-query', 'swr', 'framer-motion', 'radix-ui', 'shadcn-ui',
  'socket.io', 'fastify', 'nest', 'hono', 'elysia', 'bun',
  'turbo', 'nx', 'lerna', 'changesets', 'tsup', 'esbuild',
  'webpack', 'rollup', 'parcel', 'swc', 'babel', 'jest',
  'cypress', 'puppeteer', 'cheerio', 'sharp', 'jimp',
  'openai', 'langchain', 'ai', 'ollama', 'transformers',
];

async function scrapeNpmDocs(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const topicLower = topic.toLowerCase();

  const packages = topic === 'all'
    ? TOP_NPM_PACKAGES.slice(0, limit)
    : TOP_NPM_PACKAGES.filter(p => p.includes(topicLower)).slice(0, limit);

  const targets = packages.length > 0 ? packages : TOP_NPM_PACKAGES.slice(0, Math.min(limit, 20));

  for (const pkg of targets) {
    await sleep(300);
    try {
      const res = await fetch(`https://registry.npmjs.org/${pkg}`, {
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) continue;

      const data = await res.json() as {
        name: string;
        description?: string;
        readme?: string;
        'dist-tags'?: { latest?: string };
        keywords?: string[];
      };

      const readme = data.readme || data.description || '';
      if (readme.length < 200) continue;

      items.push({
        source: 'npm-docs' as HarvestSource,
        source_url: `https://www.npmjs.com/package/${pkg}`,
        title: `npm: ${data.name}`,
        raw_content: readme.slice(0, 10000),
        language: 'typescript',
        tags: ['npm', 'package-docs', ...(data.keywords || []).slice(0, 5)],
      });
    } catch { /* skip */ }
  }

  return items;
}

// ── Competitive Programming: Codeforces, open editorials ──

async function scrapeCompetitive(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];

  try {
    const tag = topic === 'all' ? '' : topic.toLowerCase();
    const tagParam = tag ? `&tags=${encodeURIComponent(tag)}` : '';
    const url = `https://codeforces.com/api/problemset.problems?${tagParam}`;
    const res = await fetch(url);
    if (!res.ok) return items;

    const data = await res.json() as {
      status: string;
      result?: {
        problems: Array<{
          contestId: number;
          index: string;
          name: string;
          rating?: number;
          tags: string[];
        }>;
      };
    };

    if (data.status !== 'OK' || !data.result) return items;

    const problems = data.result.problems
      .filter(p => p.rating && p.rating >= 1200 && p.rating <= 2000)
      .slice(0, limit);

    for (const prob of problems) {
      await sleep(400);

      const problemUrl = `https://codeforces.com/problemset/problem/${prob.contestId}/${prob.index}`;
      const content = `PROBLEM: ${prob.name}\nDifficulty: ${prob.rating}\nTags: ${prob.tags.join(', ')}\n\nSolve this competitive programming problem. Think about time complexity and edge cases.`;

      items.push({
        source: 'competitive' as HarvestSource,
        source_url: problemUrl,
        title: `Codeforces: ${prob.name} (${prob.rating})`,
        raw_content: content,
        language: 'cpp',
        tags: ['competitive', 'algorithms', ...prob.tags.slice(0, 5)],
      });
    }
  } catch (err) {
    console.error('[harvester/competitive] Error:', (err as Error).message);
  }

  return items;
}

// ── Finance ──
async function scrapeFinance(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const query = encodeURIComponent(topic || 'investing strategy portfolio');
  try {
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${query}+finance&tags=story&hitsPerPage=${Math.min(limit, 20)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'TitanForge-Harvester/2.0' } });
    if (!res.ok) return items;
    const data = (await res.json()) as { hits?: Array<{ title?: string; url?: string; story_text?: string; objectID?: string }> };
    for (const hit of data.hits || []) {
      if (!hit.title) continue;
      items.push({
        source: 'finance',
        source_url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        title: hit.title,
        raw_content: hit.story_text || hit.title,
        instruction: `Explain this financial concept: ${hit.title}`,
        response: hit.story_text || `Analysis of: ${hit.title}`,
        language: 'en',
        tags: ['finance', 'investing', topic],
      });
    }
  } catch (err) {
    console.error('[harvester/finance] Error:', (err as Error).message);
  }
  return items;
}

// ── Real Estate ──
async function scrapeRealEstate(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const query = encodeURIComponent(topic || 'real estate investment property');
  try {
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${query}+real+estate&tags=story&hitsPerPage=${Math.min(limit, 20)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'TitanForge-Harvester/2.0' } });
    if (!res.ok) return items;
    const data = (await res.json()) as { hits?: Array<{ title?: string; url?: string; story_text?: string; objectID?: string }> };
    for (const hit of data.hits || []) {
      if (!hit.title) continue;
      items.push({
        source: 'real-estate',
        source_url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        title: hit.title,
        raw_content: hit.story_text || hit.title,
        instruction: `Explain this real estate concept: ${hit.title}`,
        response: hit.story_text || `Analysis of: ${hit.title}`,
        language: 'en',
        tags: ['real-estate', 'property', topic],
      });
    }
  } catch (err) {
    console.error('[harvester/real-estate] Error:', (err as Error).message);
  }
  return items;
}

// ── Business Strategy ──
async function scrapeBusinessStrategy(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const query = encodeURIComponent(topic || 'business strategy scaling startup');
  try {
    const url = `https://hn.algolia.com/api/v1/search?query=${query}+strategy&tags=story&hitsPerPage=${Math.min(limit, 20)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'TitanForge-Harvester/2.0' } });
    if (!res.ok) return items;
    const data = (await res.json()) as { hits?: Array<{ title?: string; url?: string; story_text?: string; objectID?: string }> };
    for (const hit of data.hits || []) {
      if (!hit.title) continue;
      items.push({
        source: 'business-strategy',
        source_url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        title: hit.title,
        raw_content: hit.story_text || hit.title,
        instruction: `Explain this business strategy: ${hit.title}`,
        response: hit.story_text || `Strategy analysis: ${hit.title}`,
        language: 'en',
        tags: ['business', 'strategy', topic],
      });
    }
  } catch (err) {
    console.error('[harvester/business-strategy] Error:', (err as Error).message);
  }
  return items;
}

// ── Military Strategy ──
async function scrapeMilitaryStrategy(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const query = encodeURIComponent(topic || 'military strategy tactics leadership');
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&srnamespace=0&srlimit=${Math.min(limit, 15)}&format=json`;
    const res = await fetch(url, { headers: { 'User-Agent': 'TitanForge-Harvester/2.0' } });
    if (!res.ok) return items;
    const data = (await res.json()) as { query?: { search?: Array<{ title?: string; snippet?: string; pageid?: number }> } };
    for (const result of data.query?.search || []) {
      if (!result.title || !result.snippet) continue;
      const clean = result.snippet.replace(/<[^>]*>/g, '');
      items.push({
        source: 'military-strategy',
        source_url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title)}`,
        title: result.title,
        raw_content: clean,
        instruction: `Explain the military strategy concept: ${result.title}`,
        response: clean,
        language: 'en',
        tags: ['military', 'strategy', 'leadership', topic],
      });
    }
  } catch (err) {
    console.error('[harvester/military-strategy] Error:', (err as Error).message);
  }
  return items;
}

// ── Chess Strategy ──
async function scrapeChessStrategy(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const query = encodeURIComponent(topic || 'chess opening strategy tactics endgame');
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}+chess&srnamespace=0&srlimit=${Math.min(limit, 15)}&format=json`;
    const res = await fetch(url, { headers: { 'User-Agent': 'TitanForge-Harvester/2.0' } });
    if (!res.ok) return items;
    const data = (await res.json()) as { query?: { search?: Array<{ title?: string; snippet?: string; pageid?: number }> } };
    for (const result of data.query?.search || []) {
      if (!result.title || !result.snippet) continue;
      const clean = result.snippet.replace(/<[^>]*>/g, '');
      items.push({
        source: 'chess-strategy',
        source_url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title)}`,
        title: result.title,
        raw_content: clean,
        instruction: `Explain the chess concept: ${result.title}`,
        response: clean,
        language: 'en',
        tags: ['chess', 'strategy', 'games', topic],
      });
    }
  } catch (err) {
    console.error('[harvester/chess-strategy] Error:', (err as Error).message);
  }
  return items;
}

// ── Books ──
async function scrapeBooks(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const query = encodeURIComponent(topic || 'programming software engineering');
  try {
    const url = `https://openlibrary.org/search.json?q=${query}&limit=${Math.min(limit, 20)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'TitanForge-Harvester/2.0' } });
    if (!res.ok) return items;
    const data = (await res.json()) as { docs?: Array<{ title?: string; author_name?: string[]; first_sentence?: string[]; key?: string; subject?: string[] }> };
    for (const book of data.docs || []) {
      if (!book.title) continue;
      const author = book.author_name?.[0] || 'Unknown';
      const sentence = book.first_sentence?.[0] || '';
      const subjects = (book.subject || []).slice(0, 5).join(', ');
      items.push({
        source: 'books',
        source_url: `https://openlibrary.org${book.key}`,
        title: `${book.title} by ${author}`,
        raw_content: `${book.title} by ${author}. ${sentence} Subjects: ${subjects}`,
        instruction: `Summarize the key ideas from the book "${book.title}" by ${author}`,
        response: sentence || `${book.title} is a book by ${author} covering: ${subjects}`,
        language: 'en',
        tags: ['books', 'reading', topic],
      });
    }
  } catch (err) {
    console.error('[harvester/books] Error:', (err as Error).message);
  }
  return items;
}

// ── Movies ──
async function scrapeMovies(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const query = encodeURIComponent(topic || 'science fiction technology');
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}+film&srnamespace=0&srlimit=${Math.min(limit, 15)}&format=json`;
    const res = await fetch(url, { headers: { 'User-Agent': 'TitanForge-Harvester/2.0' } });
    if (!res.ok) return items;
    const data = (await res.json()) as { query?: { search?: Array<{ title?: string; snippet?: string; pageid?: number }> } };
    for (const result of data.query?.search || []) {
      if (!result.title || !result.snippet) continue;
      const clean = result.snippet.replace(/<[^>]*>/g, '');
      items.push({
        source: 'movies',
        source_url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title)}`,
        title: result.title,
        raw_content: clean,
        instruction: `Describe the film "${result.title}" and its themes`,
        response: clean,
        language: 'en',
        tags: ['movies', 'film', 'entertainment', topic],
      });
    }
  } catch (err) {
    console.error('[harvester/movies] Error:', (err as Error).message);
  }
  return items;
}

// ── Source Router ──

export async function scrapeNewSources(
  source: HarvestSource,
  topic: string,
  limit: number,
): Promise<ScrapedItem[]> {
  switch (source) {
    case 'github-issues':
      return scrapeGitHubIssues(topic, limit);
    case 'arxiv':
      return scrapeArxiv(topic, limit);
    case 'gitlab':
      return scrapeGitLab(topic, limit);
    case 'npm-docs':
      return scrapeNpmDocs(topic, limit);
    case 'competitive':
      return scrapeCompetitive(topic, limit);
    case 'tech-news':
      return scrapeTechNews(topic, limit);
    case 'best-practices':
      return scrapeBestPractices(topic, limit);
    case 'ai-research':
      return scrapeAIResearch(topic, limit);
    case 'innovations':
    case 'patents':
      return scrapeInnovations(topic, limit);
    case 'finance':
      return scrapeFinance(topic, limit);
    case 'real-estate':
      return scrapeRealEstate(topic, limit);
    case 'business-strategy':
      return scrapeBusinessStrategy(topic, limit);
    case 'military-strategy':
      return scrapeMilitaryStrategy(topic, limit);
    case 'chess-strategy':
      return scrapeChessStrategy(topic, limit);
    case 'books':
      return scrapeBooks(topic, limit);
    case 'movies':
      return scrapeMovies(topic, limit);
    default:
      return [];
  }
}
