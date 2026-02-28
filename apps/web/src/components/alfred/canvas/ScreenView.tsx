'use client';

import React, { useMemo, useState } from 'react';
import { useAlfredCanvas } from '@/stores/alfred-canvas-store';

const YT_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/;
const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+)/g;
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?[^\s]*)?$/i;
const HEADING_REGEX = /^(#{1,3})\s+(.+)$/;
const BOLD_REGEX = /\*\*(.+?)\*\*/g;
const CODE_INLINE_REGEX = /`([^`]+)`/g;
const BULLET_REGEX = /^[-*]\s+(.+)$/;
const NUMBERED_REGEX = /^\d+[.)]\s+(.+)$/;
const CODE_BLOCK_START = /^```(\w+)?$/;
const CODE_BLOCK_END = /^```$/;

function extractYouTubeIds(text: string): string[] {
  const ids: string[] = [];
  const matches = text.matchAll(new RegExp(YT_REGEX.source, 'g'));
  for (const m of matches) if (m[1]) ids.push(m[1]);
  return [...new Set(ids)];
}

function isEmbeddableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const blocked = ['localhost', '127.0.0.1', '0.0.0.0'];
    if (blocked.includes(parsed.hostname)) return false;
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    return true;
  } catch { return false; }
}

function renderInlineMarkup(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let key = 0;

  const segments = text.split(URL_REGEX);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;

    if (URL_REGEX.test(seg)) {
      URL_REGEX.lastIndex = 0;
      parts.push(
        <a key={key++} href={seg} target="_blank" rel="noopener noreferrer"
          className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 break-all">
          {seg.length > 80 ? seg.slice(0, 77) + '...' : seg}
        </a>
      );
    } else {
      const html = seg
        .replace(BOLD_REGEX, '<strong class="text-white font-semibold">$1</strong>')
        .replace(CODE_INLINE_REGEX, '<code class="bg-[#2a2a2a] text-emerald-400 px-1 py-0.5 rounded text-[11px]">$1</code>');
      parts.push(<span key={key++} dangerouslySetInnerHTML={{ __html: html }} />);
    }
  }

  return parts;
}

function SmartContent({ text }: { text: string }) {
  const lines = text.split('\n');
  const youtubeIds = useMemo(() => extractYouTubeIds(text), [text]);
  const elements: React.ReactNode[] = [];
  let key = 0;
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inCodeBlock) {
      if (CODE_BLOCK_END.test(line) && i > 0) {
        elements.push(
          <pre key={key++} className="bg-[#1a1a1a] border border-[#333] rounded-lg p-3 my-2 overflow-x-auto">
            <code className="text-[11px] text-emerald-400 font-mono leading-relaxed">{codeBuffer.join('\n')}</code>
          </pre>
        );
        inCodeBlock = false;
        codeBuffer = [];
      } else {
        codeBuffer.push(line);
      }
      continue;
    }

    const codeStart = line.match(CODE_BLOCK_START);
    if (codeStart) {
      inCodeBlock = true;
      continue;
    }

    if (!line.trim()) {
      elements.push(<div key={key++} className="h-2" />);
      continue;
    }

    const headingMatch = line.match(HEADING_REGEX);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const sizes = ['text-[16px]', 'text-[14px]', 'text-[13px]'];
      elements.push(
        <div key={key++} className={`${sizes[level - 1]} font-bold text-white mt-3 mb-1`}>
          {renderInlineMarkup(headingMatch[2])}
        </div>
      );
      continue;
    }

    const bulletMatch = line.match(BULLET_REGEX);
    if (bulletMatch) {
      elements.push(
        <div key={key++} className="flex gap-2 pl-2 py-0.5">
          <span className="text-cyan-500 mt-0.5">&#x2022;</span>
          <span className="text-[#ccc] text-[12px]">{renderInlineMarkup(bulletMatch[1])}</span>
        </div>
      );
      continue;
    }

    const numberedMatch = line.match(NUMBERED_REGEX);
    if (numberedMatch) {
      const num = line.match(/^(\d+)/)?.[1] || '1';
      elements.push(
        <div key={key++} className="flex gap-2 pl-2 py-0.5">
          <span className="text-cyan-500 text-[11px] min-w-[16px]">{num}.</span>
          <span className="text-[#ccc] text-[12px]">{renderInlineMarkup(numberedMatch[1])}</span>
        </div>
      );
      continue;
    }

    elements.push(
      <div key={key++} className="text-[12px] text-[#ccc] leading-relaxed">
        {renderInlineMarkup(line)}
      </div>
    );
  }

  if (inCodeBlock && codeBuffer.length > 0) {
    elements.push(
      <pre key={key++} className="bg-[#1a1a1a] border border-[#333] rounded-lg p-3 my-2 overflow-x-auto">
        <code className="text-[11px] text-emerald-400 font-mono leading-relaxed">{codeBuffer.join('\n')}</code>
      </pre>
    );
  }

  return (
    <div className="space-y-0.5">
      {youtubeIds.length > 0 && (
        <div className="space-y-3 mb-4">
          {youtubeIds.map(id => (
            <div key={id} className="rounded-lg overflow-hidden border border-[#333] bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${id}`}
                title="YouTube video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full aspect-video"
              />
            </div>
          ))}
        </div>
      )}
      {elements}
    </div>
  );
}

function SearchResultCards({ text, query }: { text: string; query?: string }) {
  const blocks = text.split(/\n{2,}/).filter(b => b.trim());

  return (
    <div className="space-y-3">
      {query && (
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#2a2a2a]">
          <svg className="w-4 h-4 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-[13px] text-white font-medium">{query}</span>
        </div>
      )}
      {blocks.map((block, i) => {
        const urls = block.match(URL_REGEX) || [];
        const ytIds = extractYouTubeIds(block);
        const cleanText = block.replace(URL_REGEX, '').trim();
        const firstLine = cleanText.split('\n')[0] || '';
        const rest = cleanText.split('\n').slice(1).join('\n').trim();

        return (
          <div key={i} className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-3 hover:border-[#444] transition-colors">
            {ytIds.length > 0 && ytIds.map(id => (
              <div key={id} className="rounded-lg overflow-hidden mb-2 border border-[#333] bg-black">
                <iframe
                  src={`https://www.youtube.com/embed/${id}`}
                  title="YouTube video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full aspect-video"
                />
              </div>
            ))}
            <div className="text-[12px] text-white font-medium mb-1">
              {renderInlineMarkup(firstLine)}
            </div>
            {rest && (
              <div className="text-[11px] text-[#999] leading-relaxed mt-1">
                {renderInlineMarkup(rest)}
              </div>
            )}
            {urls.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {urls.slice(0, 3).map((url, j) => {
                  const isImage = IMG_EXT.test(url);
                  if (isImage) return (
                    <img key={j} src={url} alt="" className="max-h-[120px] rounded border border-[#333] mt-1" loading="lazy" />
                  );
                  let domain = '';
                  try { domain = new URL(url).hostname.replace('www.', ''); } catch { domain = url.slice(0, 30); }
                  return (
                    <a key={j} href={url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-cyan-500 hover:text-cyan-400 bg-[#1a1a1a] px-2 py-0.5 rounded-full border border-[#333] truncate max-w-[200px]">
                      {domain}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function IframeView({ url, title }: { url: string; title?: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-[#2a2a2a] bg-[#1a1a1a] flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-500 animate-pulse' : error ? 'bg-red-500' : 'bg-green-500'}`} />
        <span className="text-[11px] text-[#ccc] truncate flex-1">{title || url}</span>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="text-[9px] text-cyan-500 hover:text-cyan-400 px-2 py-0.5 bg-[#2a2a2a] rounded">
          Open
        </a>
      </div>
      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d]">
            <div className="flex gap-1.5 items-center">
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <iframe
          src={url}
          title={title || 'Web Content'}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          onLoad={() => { setLoading(false); setError(false); }}
          onError={() => { setLoading(false); setError(true); }}
        />
      </div>
    </div>
  );
}

export function ScreenView() {
  const { content, stats, workflows, setMode } = useAlfredCanvas();

  if (!content || content.type !== 'screen') {
    return <ScreenIdle stats={stats} workflows={workflows} />;
  }

  const tool = content.meta?.tool as string | undefined;
  const query = content.meta?.query as string | undefined;
  const url = content.meta?.url as string | undefined;
  const isIframe = content.meta?.isIframe as boolean | undefined;
  const isSearchResult = tool === 'web_search' || tool === 'research_topic' || tool === 'search_web';
  const dataStr = typeof content.data === 'string' ? content.data : JSON.stringify(content.data, null, 2);

  const ytMatch = dataStr.match(YT_REGEX);
  if (ytMatch?.[1] && !isSearchResult) {
    return (
      <div className="flex flex-col h-full bg-black">
        {content.title && (
          <div className="px-3 py-1.5 border-b border-[#2a2a2a] bg-[#111] flex items-center gap-2">
            <span className="text-[11px] text-[#ccc] truncate flex-1">{content.title}</span>
            <button
              onClick={() => setMode('video')}
              className="text-[9px] text-cyan-500 px-2 py-0.5 bg-[#2a2a2a] rounded hover:bg-[#3a3a3a]"
            >
              Full Player
            </button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center">
          <iframe
            src={`https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0`}
            title={content.title || 'YouTube video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full border-0"
          />
        </div>
      </div>
    );
  }

  if ((isIframe || url) && url && isEmbeddableUrl(url)) {
    return <IframeView url={url} title={content.title} />;
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      {content.title && (
        <div className="px-3 py-1.5 border-b border-[#2a2a2a] flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${
            content.meta?.status === 'running' ? 'bg-yellow-500 animate-pulse' :
            content.meta?.status === 'error' ? 'bg-red-500' : 'bg-green-500'
          }`} />
          <span className="text-[11px] text-[#ccc] truncate">{content.title}</span>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="text-[9px] text-cyan-600 hover:text-cyan-400 truncate ml-auto">
              {url}
            </a>
          ) : null}
          {tool && (
            <span className="text-[9px] text-[#444] ml-auto font-mono">{tool}</span>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto p-4">
        {isSearchResult ? (
          <SearchResultCards text={dataStr} query={query} />
        ) : (
          <SmartContent text={dataStr} />
        )}
      </div>
    </div>
  );
}

function ScreenIdle({ stats, workflows }: {
  stats: { totalTasks: number; completedTasks: number; successRate: number; totalCost: number; activeAgents: number };
  workflows: Array<{ id: string; name: string; status: string; startedAt: number; progress: number }>;
}) {
  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-600/30 flex items-center justify-center animate-pulse">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 opacity-60" />
            </div>
          </div>
          <div className="absolute inset-0 rounded-full border border-cyan-500/10 animate-ping" style={{ animationDuration: '3s' }} />
        </div>

        <h2 className="text-[15px] font-semibold text-white mb-1">Alfred is ready</h2>
        <p className="text-[11px] text-[#808080] text-center max-w-[300px]">
          Say &quot;Alfred&quot; or type a command. The canvas will show what Alfred is doing in real time.
        </p>

        <div className="grid grid-cols-4 gap-3 mt-8 w-full max-w-[500px]">
          <StatCard label="Tasks" value={stats.totalTasks} />
          <StatCard label="Completed" value={stats.completedTasks} />
          <StatCard label="Success" value={`${stats.successRate}%`} />
          <StatCard label="Agents" value={stats.activeAgents} />
        </div>
      </div>

      {workflows.length > 0 && (
        <div className="border-t border-[#2a2a2a] px-4 py-3 max-h-[200px] overflow-y-auto">
          <div className="text-[10px] text-[#555] mb-2 font-medium">Active Workflows</div>
          {workflows.slice(0, 8).map((wf) => (
            <div key={wf.id} className="flex items-center gap-2 py-1.5 border-b border-[#1a1a1a] last:border-0">
              <div className={`w-1.5 h-1.5 rounded-full ${
                wf.status === 'running' ? 'bg-green-500 animate-pulse' :
                wf.status === 'complete' ? 'bg-blue-500' :
                wf.status === 'failed' ? 'bg-red-500' : 'bg-[#555]'
              }`} />
              <span className="text-[11px] text-[#ccc] flex-1 truncate">{wf.name}</span>
              <span className="text-[9px] text-[#666]">{wf.progress}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-center">
      <div className="text-[16px] font-bold text-white">{value}</div>
      <div className="text-[9px] text-[#666] uppercase tracking-wider">{label}</div>
    </div>
  );
}
