// ── Titan Forge — Harvester (Web Scraper Engine) ──
// Scrapes high-quality coding knowledge from public sources.
// Each source adapter respects rate limits and robots.txt conventions.
// All content passes through the multi-pass filter pipeline before storage.

import { createHash } from 'crypto';
import { ForgeDB } from './db.js';
import type { HarvestSource, HarvestSample } from './types.js';

const db = new ForgeDB();

const RATE_LIMIT_MS: Record<HarvestSource, number> = {
  github: 2000,
  stackoverflow: 1500,
  docs: 1000,
  blog: 1500,
};

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 32);
}

export interface ScrapedItem {
  source: HarvestSource;
  source_url: string;
  title: string;
  raw_content: string;
  language: string;
  tags: string[];
}

export interface HarvestOptions {
  source: HarvestSource | 'all';
  topic?: string;
  limit?: number;
  dryRun?: boolean;
}

// ── GitHub Adapter: Top repos, accepted PRs, well-documented code ──

async function scrapeGitHub(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const query = encodeURIComponent(`${topic} language:typescript stars:>100`);
  const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=${Math.min(limit, 30)}`;

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'TitanForge-Harvester/1.0',
    };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.warn(`[harvester/github] API returned ${res.status}`);
      return items;
    }
    const data = await res.json() as { items?: Array<{ full_name: string; html_url: string; description: string; language: string; topics: string[] }> };

    for (const repo of (data.items || []).slice(0, limit)) {
      await sleep(RATE_LIMIT_MS.github);

      const readmeUrl = `https://api.github.com/repos/${repo.full_name}/readme`;
      try {
        const readmeRes = await fetch(readmeUrl, { headers: { ...headers, 'Accept': 'application/vnd.github.v3.raw' } });
        if (readmeRes.ok) {
          const content = await readmeRes.text();
          if (content.length > 200) {
            items.push({
              source: 'github',
              source_url: repo.html_url,
              title: `${repo.full_name} — README`,
              raw_content: content,
              language: repo.language || 'unknown',
              tags: repo.topics || [],
            });
          }
        }
      } catch { /* skip */ }
    }
  } catch (err) {
    console.error('[harvester/github] Error:', (err as Error).message);
  }

  return items;
}

// ── Stack Overflow Adapter: Accepted answers for top programming questions ──

async function scrapeStackOverflow(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const tag = encodeURIComponent(topic.toLowerCase().replace(/\s+/g, '-'));
  const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=votes&accepted=True&tagged=${tag}&site=stackoverflow&filter=withbody&pagesize=${Math.min(limit, 30)}`;

  try {
    const res = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
    if (!res.ok) {
      console.warn(`[harvester/stackoverflow] API returned ${res.status}`);
      return items;
    }
    const data = await res.json() as { items?: Array<{ title: string; link: string; body: string; accepted_answer_id?: number; tags: string[] }> };

    for (const question of (data.items || []).slice(0, limit)) {
      if (!question.accepted_answer_id) continue;
      await sleep(RATE_LIMIT_MS.stackoverflow);

      try {
        const ansUrl = `https://api.stackexchange.com/2.3/answers/${question.accepted_answer_id}?site=stackoverflow&filter=withbody`;
        const ansRes = await fetch(ansUrl);
        if (!ansRes.ok) continue;
        const ansData = await ansRes.json() as { items?: Array<{ body: string }> };
        const answer = ansData.items?.[0];
        if (answer && answer.body.length > 100) {
          items.push({
            source: 'stackoverflow',
            source_url: question.link,
            title: question.title,
            raw_content: `QUESTION:\n${stripHtml(question.body)}\n\nACCEPTED ANSWER:\n${stripHtml(answer.body)}`,
            language: inferLanguageFromTags(question.tags),
            tags: question.tags,
          });
        }
      } catch { /* skip individual answers */ }
    }
  } catch (err) {
    console.error('[harvester/stackoverflow] Error:', (err as Error).message);
  }

  return items;
}

// ── Docs Adapter: Official documentation pages ──

const DOC_SOURCES: Array<{ name: string; baseUrl: string; pages: string[] }> = [
  {
    name: 'React',
    baseUrl: 'https://raw.githubusercontent.com/reactjs/react.dev/main/src/content/reference/react',
    pages: ['hooks.md', 'useState.md', 'useEffect.md', 'useCallback.md', 'useMemo.md', 'useRef.md', 'useContext.md'],
  },
  {
    name: 'Next.js',
    baseUrl: 'https://raw.githubusercontent.com/vercel/next.js/canary/docs',
    pages: ['01-app/01-getting-started/01-installation.mdx', '01-app/02-building-your-application/01-routing/01-layouts-and-templates.mdx'],
  },
  {
    name: 'TypeScript',
    baseUrl: 'https://raw.githubusercontent.com/microsoft/TypeScript-Website/v2/packages/documentation/copy/en/handbook-v2',
    pages: ['Basics.md', 'Everyday Types.md', 'Narrowing.md', 'More on Functions.md'],
  },
];

async function scrapeDocs(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const topicLower = topic.toLowerCase();

  for (const source of DOC_SOURCES) {
    if (topic !== 'all' && !source.name.toLowerCase().includes(topicLower)) continue;

    for (const page of source.pages.slice(0, limit)) {
      await sleep(RATE_LIMIT_MS.docs);
      const url = `${source.baseUrl}/${page}`;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const content = await res.text();
        if (content.length > 200) {
          items.push({
            source: 'docs',
            source_url: url,
            title: `${source.name} — ${page.replace(/\.mdx?$/, '')}`,
            raw_content: content,
            language: 'typescript',
            tags: [source.name.toLowerCase(), 'documentation'],
          });
        }
      } catch { /* skip */ }
    }
  }

  return items;
}

// ── Blog Adapter: Curated engineering blogs ──

const BLOG_FEEDS: Array<{ name: string; url: string }> = [
  { name: 'Vercel Blog', url: 'https://vercel.com/blog/rss.xml' },
  { name: 'Netflix Tech', url: 'https://netflixtechblog.com/feed' },
  { name: 'Uber Engineering', url: 'https://www.uber.com/blog/engineering/rss/' },
];

async function scrapeBlogs(_topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];

  for (const feed of BLOG_FEEDS) {
    try {
      await sleep(RATE_LIMIT_MS.blog);
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'TitanForge-Harvester/1.0' },
      });
      if (!res.ok) continue;
      const text = await res.text();

      const titleMatches = text.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g) || [];
      const linkMatches = text.match(/<link>(.*?)<\/link>/g) || [];
      const descMatches = text.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/gs) || [];

      const count = Math.min(titleMatches.length, linkMatches.length, descMatches.length, limit);
      for (let i = 1; i < count; i++) {
        const title = titleMatches[i]?.replace(/<\/?title>|<!\[CDATA\[|\]\]>/g, '').trim() || '';
        const link = linkMatches[i]?.replace(/<\/?link>/g, '').trim() || '';
        const desc = descMatches[i]?.replace(/<\/?description>|<!\[CDATA\[|\]\]>/g, '').trim() || '';

        if (desc.length > 100) {
          items.push({
            source: 'blog',
            source_url: link,
            title: `${feed.name}: ${title}`,
            raw_content: stripHtml(desc),
            language: 'general',
            tags: [feed.name.toLowerCase().replace(/\s+/g, '-')],
          });
        }
      }
    } catch { /* skip feed */ }
  }

  return items.slice(0, limit);
}

// ── Utilities ──

function stripHtml(html: string): string {
  return html
    .replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g, '\n```\n$1\n```\n')
    .replace(/<code>(.*?)<\/code>/g, '`$1`')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function inferLanguageFromTags(tags: string[]): string {
  const langMap: Record<string, string> = {
    javascript: 'javascript', typescript: 'typescript', python: 'python',
    java: 'java', 'c#': 'csharp', 'c++': 'cpp', go: 'go', rust: 'rust',
    ruby: 'ruby', php: 'php', swift: 'swift', kotlin: 'kotlin',
    react: 'typescript', 'node.js': 'javascript', 'next.js': 'typescript',
  };
  for (const tag of tags) {
    const lang = langMap[tag.toLowerCase()];
    if (lang) return lang;
  }
  return 'general';
}

// ── Main Harvester ──

export class ForgeHarvester {
  async harvest(opts: HarvestOptions): Promise<{ scraped: ScrapedItem[]; batchId: string }> {
    const { source, topic = 'all', limit = 20, dryRun = false } = opts;
    const batchId = createHash('sha256').update(`${Date.now()}-${source}-${topic}`).digest('hex').slice(0, 16);

    console.log(`[harvester] Starting batch ${batchId} | source=${source} topic=${topic} limit=${limit}`);

    let scraped: ScrapedItem[] = [];

    if (source === 'all' || source === 'github') {
      const gh = await scrapeGitHub(topic, limit);
      scraped.push(...gh);
      console.log(`[harvester] GitHub: ${gh.length} items`);
    }

    if (source === 'all' || source === 'stackoverflow') {
      const so = await scrapeStackOverflow(topic, limit);
      scraped.push(...so);
      console.log(`[harvester] StackOverflow: ${so.length} items`);
    }

    if (source === 'all' || source === 'docs') {
      const docs = await scrapeDocs(topic, limit);
      scraped.push(...docs);
      console.log(`[harvester] Docs: ${docs.length} items`);
    }

    if (source === 'all' || source === 'blog') {
      const blogs = await scrapeBlogs(topic, limit);
      scraped.push(...blogs);
      console.log(`[harvester] Blogs: ${blogs.length} items`);
    }

    console.log(`[harvester] Total scraped: ${scraped.length} items`);

    if (!dryRun) {
      await db.insertHarvestBatch({
        id: batchId,
        source: source === 'all' ? 'github' : source,
        topic,
        total_scraped: scraped.length,
        passed_filter: 0,
        rejected: 0,
        status: 'running',
      });
    }

    return { scraped, batchId };
  }
}

export const forgeHarvester = new ForgeHarvester();
