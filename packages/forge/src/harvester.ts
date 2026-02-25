// ── Titan Forge — Harvester (Web Scraper Engine) ──
// Scrapes high-quality coding knowledge from public sources.
// Each source adapter respects rate limits and robots.txt conventions.
// All content passes through the multi-pass filter pipeline before storage.

import { createHash } from 'crypto';
import { ForgeDB } from './db.js';
import { samplePublicDatasets } from './harvester-datasets.js';
import type { HarvestSource, HarvestSample } from './types.js';

const db = new ForgeDB();

const RATE_LIMIT_MS: Record<HarvestSource, number> = {
  github: 1200,
  stackoverflow: 800,
  docs: 500,
  blog: 800,
  dataset: 300,
  reddit: 1000,
  devto: 500,
  mdn: 700,
  wikipedia: 500,
  hackernews: 700,
  'github-issues': 800,
  arxiv: 1500,
  gitlab: 600,
  'npm-docs': 300,
  competitive: 400,
  'evol-instruct': 300,
  'tech-news': 800,
  'patents': 1500,
  'best-practices': 700,
  'ai-research': 1500,
  'innovations': 1000,
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

// ── Reddit Adapter: Top posts from programming subreddits ──

const CODING_SUBREDDITS = [
  'programming', 'learnprogramming', 'javascript', 'typescript',
  'reactjs', 'node', 'webdev', 'python', 'machinelearning',
  'rust', 'golang', 'cpp', 'java', 'devops', 'ExperiencedDevs',
];

async function scrapeReddit(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const topicLower = topic.toLowerCase();

  const subs = topic === 'all'
    ? CODING_SUBREDDITS
    : CODING_SUBREDDITS.filter(s =>
        s.toLowerCase().includes(topicLower) || topicLower.includes(s.toLowerCase())
      );

  const targets = subs.length > 0 ? subs : ['programming', 'learnprogramming'];
  const perSub = Math.max(3, Math.ceil(limit / targets.length));

  for (const sub of targets) {
    try {
      await sleep(RATE_LIMIT_MS.reddit);
      const searchParam = topic !== 'all' ? `&q=${encodeURIComponent(topic)}` : '';
      const url = searchParam
        ? `https://www.reddit.com/r/${sub}/search.json?restrict_sr=on&sort=top&t=month${searchParam}&limit=${perSub}`
        : `https://www.reddit.com/r/${sub}/top.json?t=month&limit=${perSub}`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'TitanForge-Harvester/1.0 (educational research)' },
      });
      if (!res.ok) continue;

      const data = await res.json() as {
        data?: { children?: Array<{ data: { title: string; selftext: string; url: string; permalink: string; score: number; subreddit: string; num_comments: number } }> }
      };

      for (const post of (data.data?.children || []).slice(0, perSub)) {
        const p = post.data;
        if (!p.selftext || p.selftext.length < 150) continue;
        if (p.score < 10) continue;

        items.push({
          source: 'reddit',
          source_url: `https://www.reddit.com${p.permalink}`,
          title: `r/${p.subreddit}: ${p.title}`,
          raw_content: `${p.title}\n\n${p.selftext}`,
          language: inferLanguageFromTags([p.subreddit, topic]),
          tags: ['reddit', p.subreddit, `score:${p.score}`],
        });
      }
    } catch { /* skip subreddit */ }
  }

  return items.slice(0, limit);
}

// ── Dev.to Adapter: Popular tech articles with full markdown ──

async function scrapeDevTo(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const tag = topic === 'all' ? '' : topic.toLowerCase().replace(/\s+/g, '').replace(/\./g, '');

  try {
    const tagParam = tag ? `&tag=${encodeURIComponent(tag)}` : '';
    const url = `https://dev.to/api/articles?top=30${tagParam}&per_page=${Math.min(limit * 2, 30)}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'TitanForge-Harvester/1.0' },
    });
    if (!res.ok) return items;

    const articles = await res.json() as Array<{
      id: number; title: string; url: string; tag_list: string[];
      description: string; positive_reactions_count: number; body_markdown?: string;
    }>;

    for (const article of articles.slice(0, limit)) {
      if (article.positive_reactions_count < 5) continue;
      await sleep(RATE_LIMIT_MS.devto);

      try {
        const fullRes = await fetch(`https://dev.to/api/articles/${article.id}`, {
          headers: { 'User-Agent': 'TitanForge-Harvester/1.0' },
        });
        if (!fullRes.ok) continue;

        const full = await fullRes.json() as { body_markdown?: string };
        const content = full.body_markdown || article.description || '';
        if (content.length < 200) continue;

        items.push({
          source: 'devto',
          source_url: article.url,
          title: article.title,
          raw_content: content,
          language: inferLanguageFromTags(article.tag_list || []),
          tags: ['devto', ...(article.tag_list || [])],
        });
      } catch { /* skip article */ }
    }
  } catch (err) {
    console.error('[harvester/devto] Error:', (err as Error).message);
  }

  return items;
}

// ── MDN Web Docs Adapter: Gold-standard web reference documentation ──

const MDN_PATHS: Record<string, string[]> = {
  javascript: [
    'web/javascript/guide/functions',
    'web/javascript/guide/modules',
    'web/javascript/reference/global_objects/promise',
    'web/javascript/reference/global_objects/array',
    'web/javascript/reference/global_objects/map',
    'web/javascript/reference/global_objects/set',
    'web/javascript/reference/statements/async_function',
    'web/javascript/closures',
    'web/javascript/event_loop',
    'web/javascript/memory_management',
  ],
  web: [
    'web/api/fetch_api/using_fetch',
    'web/api/web_workers_api/using_web_workers',
    'web/api/websockets_api',
    'web/api/service_worker_api',
    'web/api/indexeddb_api',
    'web/http/cors',
    'web/http/caching',
    'web/security/types_of_attacks',
    'web/performance/fundamentals',
    'web/accessibility/aria',
  ],
  css: [
    'web/css/css_grid_layout/basic_concepts_of_grid_layout',
    'web/css/css_flexible_box_layout/basic_concepts_of_flexbox',
    'web/css/css_animations/using_css_animations',
    'web/css/css_containment/container_queries',
    'web/css/media_queries/using_media_queries',
  ],
};

async function scrapeMDN(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const topicLower = topic.toLowerCase();

  let paths: string[] = [];
  if (topic === 'all') {
    paths = Object.values(MDN_PATHS).flat();
  } else {
    for (const [key, val] of Object.entries(MDN_PATHS)) {
      if (key.includes(topicLower) || topicLower.includes(key)) {
        paths.push(...val);
      }
    }
    if (paths.length === 0) paths = MDN_PATHS.javascript;
  }

  for (const mdnPath of paths.slice(0, limit)) {
    await sleep(RATE_LIMIT_MS.mdn);
    const slug = mdnPath.toLowerCase();
    const url = `https://raw.githubusercontent.com/mdn/content/main/files/en-us/${slug}/index.md`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'TitanForge-Harvester/1.0' } });
      if (!res.ok) continue;
      const content = await res.text();
      if (content.length < 300) continue;

      const titleMatch = content.match(/^title:\s*(.+)$/m);
      const title = titleMatch?.[1]?.replace(/['"]/g, '') || mdnPath.split('/').pop() || 'MDN Doc';

      items.push({
        source: 'mdn',
        source_url: `https://developer.mozilla.org/en-US/docs/${mdnPath}`,
        title: `MDN: ${title}`,
        raw_content: content,
        language: slug.includes('css') ? 'css' : 'javascript',
        tags: ['mdn', 'documentation', 'web-standards'],
      });
    } catch { /* skip */ }
  }

  return items;
}

// ── Wikipedia Adapter: Technical CS/programming articles ──

async function scrapeWikipedia(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];

  const CS_TOPICS = [
    'Algorithm', 'Data_structure', 'Machine_learning', 'Artificial_intelligence',
    'Computer_science', 'Software_engineering', 'Compiler', 'Operating_system',
    'Database', 'Computer_network', 'Cryptography', 'Distributed_computing',
    'Object-oriented_programming', 'Functional_programming', 'Graph_theory',
    'Dynamic_programming', 'Neural_network', 'Deep_learning', 'Natural_language_processing',
    'Computer_vision', 'Reinforcement_learning', 'Big_O_notation',
  ];

  try {
    let titles: string[];
    if (topic === 'all') {
      titles = CS_TOPICS;
    } else {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic + ' programming')}&srnamespace=0&srlimit=${Math.min(limit, 20)}&format=json`;
      const res = await fetch(searchUrl, { headers: { 'User-Agent': 'TitanForge-Harvester/1.0' } });
      if (!res.ok) return items;
      const data = await res.json() as { query?: { search?: Array<{ title: string }> } };
      titles = (data.query?.search || []).map(s => s.title);
    }

    for (const title of titles.slice(0, limit)) {
      await sleep(RATE_LIMIT_MS.wikipedia);

      try {
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'TitanForge-Harvester/1.0' } });
        if (!res.ok) continue;

        const data = await res.json() as {
          title: string; extract: string; content_urls?: { desktop?: { page?: string } };
          description?: string; type?: string;
        };

        if (!data.extract || data.extract.length < 100) continue;
        if (data.type === 'disambiguation') continue;

        const fullUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&explaintext=true&format=json`;
        const fullRes = await fetch(fullUrl, { headers: { 'User-Agent': 'TitanForge-Harvester/1.0' } });
        let fullText = data.extract;
        if (fullRes.ok) {
          const fullData = await fullRes.json() as { query?: { pages?: Record<string, { extract?: string }> } };
          const pages = fullData.query?.pages || {};
          const page = Object.values(pages)[0];
          if (page?.extract && page.extract.length > fullText.length) {
            fullText = page.extract.slice(0, 8000);
          }
        }

        items.push({
          source: 'wikipedia',
          source_url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${title}`,
          title: `Wikipedia: ${data.title}`,
          raw_content: fullText,
          language: 'general',
          tags: ['wikipedia', 'encyclopedia', 'cs-theory'],
        });
      } catch { /* skip article */ }
    }
  } catch (err) {
    console.error('[harvester/wikipedia] Error:', (err as Error).message);
  }

  return items;
}

// ── Hacker News Adapter: Top stories + technical discussions ──

async function scrapeHackerNews(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];

  try {
    const storiesUrl = 'https://hacker-news.firebaseio.com/v0/topstories.json';
    const res = await fetch(storiesUrl);
    if (!res.ok) return items;

    const storyIds = (await res.json() as number[]).slice(0, Math.min(limit * 4, 100));
    const topicLower = topic.toLowerCase();

    for (const id of storyIds) {
      if (items.length >= limit) break;
      await sleep(RATE_LIMIT_MS.hackernews);

      try {
        const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        if (!itemRes.ok) continue;

        const story = await itemRes.json() as {
          title: string; url?: string; text?: string; score: number;
          descendants?: number; kids?: number[]; type: string;
        };

        if (story.type !== 'story' || story.score < 20) continue;

        if (topic !== 'all') {
          const titleLower = (story.title || '').toLowerCase();
          const textLower = (story.text || '').toLowerCase();
          if (!titleLower.includes(topicLower) && !textLower.includes(topicLower)) continue;
        }

        let content = story.text ? stripHtml(story.text) : '';

        if (story.kids && story.kids.length > 0) {
          const topComments = story.kids.slice(0, 5);
          for (const commentId of topComments) {
            try {
              const cRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${commentId}.json`);
              if (!cRes.ok) continue;
              const comment = await cRes.json() as { text?: string; by?: string; dead?: boolean; deleted?: boolean };
              if (comment.dead || comment.deleted || !comment.text) continue;
              content += `\n\n[${comment.by || 'anon'}]: ${stripHtml(comment.text)}`;
            } catch { /* skip comment */ }
          }
        }

        if (content.length < 150 && !story.url) continue;

        if (content.length < 150) {
          content = `${story.title}\n\nURL: ${story.url}\nScore: ${story.score} | Comments: ${story.descendants || 0}`;
        }

        items.push({
          source: 'hackernews',
          source_url: story.url || `https://news.ycombinator.com/item?id=${id}`,
          title: `HN: ${story.title}`,
          raw_content: content,
          language: 'general',
          tags: ['hackernews', 'discussion', `score:${story.score}`],
        });
      } catch { /* skip story */ }
    }
  } catch (err) {
    console.error('[harvester/hackernews] Error:', (err as Error).message);
  }

  return items;
}

// ── Tech News Adapter: TechCrunch, Ars Technica via HN search ──

export async function scrapeTechNews(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  try {
    const queries = ['AI breakthrough', 'tech startup', 'software engineering', topic].filter(Boolean);
    for (const q of queries) {
      const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=${Math.min(limit, 10)}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json() as { hits?: Array<{ title: string; url: string; story_text: string; points: number; objectID: string }> };
      for (const hit of (data.hits || []).slice(0, limit)) {
        await sleep(RATE_LIMIT_MS['tech-news']);
        const content = hit.story_text || `${hit.title}\nURL: ${hit.url || ''}\nPoints: ${hit.points}`;
        if (content.length < 50) continue;
        items.push({
          source: 'tech-news',
          source_url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          title: `Tech: ${hit.title}`,
          raw_content: stripHtml(content),
          language: 'general',
          tags: ['tech-news', 'titan-voice-knowledge'],
        });
      }
      if (items.length >= limit) break;
    }
  } catch (err) {
    console.error('[harvester/tech-news] Error:', (err as Error).message);
  }
  return items.slice(0, limit);
}

// ── Best Practices Adapter: GitHub repos + dev.to best practice articles ──

export async function scrapeBestPractices(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  try {
    const queries = ['best practices', 'design patterns', 'clean code', 'architecture patterns'];
    const combinedTopic = topic !== 'all' ? `${topic} ${queries[0]}` : queries[0];
    const url = `https://dev.to/api/articles?tag=bestpractices&per_page=${Math.min(limit, 10)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'TitanForge-Harvester/1.0' } });
    if (res.ok) {
      const articles = await res.json() as Array<{ title: string; url: string; description: string; tag_list: string[]; readable_publish_date: string }>;
      for (const art of articles.slice(0, limit)) {
        await sleep(RATE_LIMIT_MS['best-practices']);
        items.push({
          source: 'best-practices',
          source_url: art.url,
          title: `BP: ${art.title}`,
          raw_content: `${art.title}\n\n${art.description}\n\nTags: ${art.tag_list.join(', ')}`,
          language: 'general',
          tags: ['best-practices', 'titan-voice-knowledge', ...art.tag_list],
        });
      }
    }
  } catch (err) {
    console.error('[harvester/best-practices] Error:', (err as Error).message);
  }
  return items.slice(0, limit);
}

// ── AI Research Adapter: ArXiv AI papers ──

export async function scrapeAIResearch(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  try {
    const query = topic !== 'all' ? topic : 'artificial+intelligence+OR+machine+learning+OR+large+language+model';
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=${Math.min(limit, 15)}`;
    const res = await fetch(url);
    if (!res.ok) return items;
    const xml = await res.text();

    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];
      const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
      const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
      const linkMatch = entry.match(/<id>([\s\S]*?)<\/id>/);

      if (titleMatch && summaryMatch) {
        await sleep(RATE_LIMIT_MS['ai-research']);
        items.push({
          source: 'arxiv',
          source_url: linkMatch ? linkMatch[1].trim() : '',
          title: `AI: ${titleMatch[1].trim().replace(/\n/g, ' ')}`,
          raw_content: `${titleMatch[1].trim()}\n\n${summaryMatch[1].trim()}`,
          language: 'general',
          tags: ['ai-research', 'arxiv', 'titan-voice-knowledge'],
        });
      }
    }
  } catch (err) {
    console.error('[harvester/ai-research] Error:', (err as Error).message);
  }
  return items.slice(0, limit);
}

// ── Innovations/Patents Adapter: Google Patents + GitHub trending ──

export async function scrapeInnovations(topic: string, limit: number): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(topic !== 'all' ? topic : 'innovative tool')}&sort=updated&order=desc&per_page=${Math.min(limit, 10)}`;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'TitanForge-Harvester/1.0',
    };
    if (process.env.GITHUB_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json() as { items?: Array<{ full_name: string; html_url: string; description: string; language: string; topics: string[]; stargazers_count: number }> };
      for (const repo of (data.items || []).slice(0, limit)) {
        await sleep(RATE_LIMIT_MS.innovations);
        items.push({
          source: 'innovations',
          source_url: repo.html_url,
          title: `Innovation: ${repo.full_name}`,
          raw_content: `${repo.full_name}\n${repo.description || ''}\nLanguage: ${repo.language || 'N/A'}\nStars: ${repo.stargazers_count}\nTopics: ${(repo.topics || []).join(', ')}`,
          language: repo.language?.toLowerCase() || 'general',
          tags: ['innovations', 'titan-voice-knowledge', ...(repo.topics || [])],
        });
      }
    }
  } catch (err) {
    console.error('[harvester/innovations] Error:', (err as Error).message);
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

    if (source === 'all' || source === 'dataset') {
      const ds = await samplePublicDatasets(topic, limit);
      scraped.push(...ds);
      console.log(`[harvester] Public Datasets: ${ds.length} items`);
    }

    if (source === 'all' || source === 'reddit') {
      const rd = await scrapeReddit(topic, limit);
      scraped.push(...rd);
      console.log(`[harvester] Reddit: ${rd.length} items`);
    }

    if (source === 'all' || source === 'devto') {
      const dt = await scrapeDevTo(topic, limit);
      scraped.push(...dt);
      console.log(`[harvester] Dev.to: ${dt.length} items`);
    }

    if (source === 'all' || source === 'mdn') {
      const mdn = await scrapeMDN(topic, limit);
      scraped.push(...mdn);
      console.log(`[harvester] MDN Web Docs: ${mdn.length} items`);
    }

    if (source === 'all' || source === 'wikipedia') {
      const wiki = await scrapeWikipedia(topic, limit);
      scraped.push(...wiki);
      console.log(`[harvester] Wikipedia: ${wiki.length} items`);
    }

    if (source === 'all' || source === 'hackernews') {
      const hn = await scrapeHackerNews(topic, limit);
      scraped.push(...hn);
      console.log(`[harvester] Hacker News: ${hn.length} items`);
    }

    if (source === 'all' || source === 'tech-news') {
      const tn = await scrapeTechNews(topic, limit);
      scraped.push(...tn);
      console.log(`[harvester] Tech News: ${tn.length} items`);
    }

    if (source === 'all' || source === 'best-practices') {
      const bp = await scrapeBestPractices(topic, limit);
      scraped.push(...bp);
      console.log(`[harvester] Best Practices: ${bp.length} items`);
    }

    if (source === 'all' || source === 'ai-research') {
      const ai = await scrapeAIResearch(topic, limit);
      scraped.push(...ai);
      console.log(`[harvester] AI Research: ${ai.length} items`);
    }

    if (source === 'all' || source === 'innovations' || source === 'patents') {
      const inn = await scrapeInnovations(topic, limit);
      scraped.push(...inn);
      console.log(`[harvester] Innovations/Patents: ${inn.length} items`);
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
