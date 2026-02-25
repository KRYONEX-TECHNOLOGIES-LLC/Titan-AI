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
    default:
      return [];
  }
}
