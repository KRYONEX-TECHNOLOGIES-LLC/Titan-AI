import { IpcMain } from 'electron';
import * as https from 'https';
import * as http from 'http';

export function registerWebHandlers(ipcMain: IpcMain): void {

  ipcMain.handle('web:fetch', async (_e, url: string) => {
    const content = await fetchUrl(url);
    const title = extractTitle(content);
    const markdown = htmlToMarkdown(content);
    return { content: markdown, title };
  });

  ipcMain.handle('web:search', async (_e, query: string) => {
    const results = await duckDuckGoSearch(query);
    return results;
  });
}

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'TitanAI/1.0 (Desktop App)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1]!.trim() : '';
}

function htmlToMarkdown(html: string): string {
  let text = html;

  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');

  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  text = text.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  text = text.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');

  text = text.replace(/<[^>]+>/g, '');

  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');

  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  if (text.length > 50000) {
    text = text.substring(0, 50000) + '\n\n[Content truncated at 50,000 characters]';
  }

  return text;
}

async function duckDuckGoSearch(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const html = await fetchUrl(`https://html.duckduckgo.com/html/?q=${encodedQuery}`);

    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < 10) {
      const url = decodeURIComponent(match[1]!.replace(/.*uddg=/, '').replace(/&.*/, ''));
      const title = match[2]!.replace(/<[^>]+>/g, '').trim();
      const snippet = match[3]!.replace(/<[^>]+>/g, '').trim();
      if (title && url) {
        results.push({ title, url, snippet });
      }
    }

    return results;
  } catch {
    return [];
  }
}
