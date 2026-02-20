'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ToolCallBlock as ToolCallBlockType, CodeDiffBlock as CodeDiffBlockType } from '@/types/ide';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  thinking?: string;
  thinkingTime?: number;
  streaming?: boolean;
  streamingModel?: string;
  streamingProvider?: string;
  streamingProviderModel?: string;
  isError?: boolean;
  retryMessage?: string;
  activeModel: string;
  toolCalls?: ToolCallBlockType[];
  codeDiffs?: CodeDiffBlockType[];
  onRetry?: (message: string) => void;
  onApplyCode?: (code: string, filename?: string) => void;
  onApplyDiff?: (diffId: string) => void;
  onRejectDiff?: (diffId: string) => void;
}

// ── Icon helpers ──

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#569cd6" strokeWidth="2" className="animate-spin">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="#3fb950">
      <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="#f85149">
      <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
    </svg>
  );
}

function ToolIcon({ tool }: { tool: string }) {
  switch (tool) {
    case 'read_file':
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="#808080">
          <path d="M3 1.75C3 .784 3.784 0 4.75 0h3.5a.75.75 0 01.53.22l5 5a.75.75 0 01.22.53v8.5A1.75 1.75 0 0112.25 16h-7.5A1.75 1.75 0 013 14.25V1.75zM4.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H4.75zm4.75.97v1.78c0 .138.112.25.25.25h1.78L9.5 2.47z"/>
        </svg>
      );
    case 'edit_file':
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="#e0a526">
          <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L3.463 11.1a.25.25 0 00-.064.108l-.563 1.97 1.971-.564a.25.25 0 00.108-.064l8.61-8.61a.25.25 0 000-.353L12.427 2.487z"/>
        </svg>
      );
    case 'create_file':
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="#3fb950">
          <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/>
        </svg>
      );
    case 'list_directory':
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="#808080">
          <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/>
        </svg>
      );
    case 'grep_search':
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="#569cd6">
          <path d="M11.5 7a4.499 4.499 0 11-8.998 0A4.499 4.499 0 0111.5 7zm-.82 4.74a6 6 0 111.06-1.06l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04z"/>
        </svg>
      );
    case 'run_command':
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="#c586c0">
          <path d="M0 2.75A2.75 2.75 0 012.75 0h10.5A2.75 2.75 0 0116 2.75v10.5A2.75 2.75 0 0113.25 16H2.75A2.75 2.75 0 010 13.25V2.75zm1.5 0c0-.69.56-1.25 1.25-1.25h10.5c.69 0 1.25.56 1.25 1.25v10.5c0 .69-.56 1.25-1.25 1.25H2.75c-.69 0-1.25-.56-1.25-1.25V2.75z"/>
          <path d="M7 11.5a.75.75 0 01-.75.75h-2.5a.75.75 0 010-1.5h2.5A.75.75 0 017 11.5zm1.303-5.75l1.135 1.134a.5.5 0 010 .707L8.303 8.75a.75.75 0 11-1.06-1.06l.97-.97-.97-.97a.75.75 0 111.06-1.06z"/>
        </svg>
      );
    default:
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="#808080">
          <path d="M8.878.392a1.75 1.75 0 00-1.756 0l-5.25 3.045A1.75 1.75 0 001 5.07v5.86c0 .624.332 1.2.872 1.514l5.25 3.045a1.75 1.75 0 001.756 0l5.25-3.045c.54-.313.872-.89.872-1.514V5.07c0-.624-.332-1.2-.872-1.514L8.878.392z"/>
        </svg>
      );
  }
}

// ── Tool Call Card ──

function ToolCallCard({ tc }: { tc: ToolCallBlockType }) {
  const [expanded, setExpanded] = useState(false);

  const summary = getToolSummary(tc.tool, tc.args);
  const duration = tc.finishedAt && tc.startedAt
    ? `${((tc.finishedAt - tc.startedAt) / 1000).toFixed(1)}s`
    : null;

  return (
    <div className="my-1.5 rounded-md border border-[#2d2d2d] bg-[#1a1a1a] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#222] transition-colors"
      >
        <ToolIcon tool={tc.tool} />
        <span className="flex-1 text-[12px] text-[#b0b0b0] font-mono truncate">
          {summary}
        </span>
        {tc.status === 'running' && <SpinnerIcon />}
        {tc.status === 'done' && <CheckIcon />}
        {tc.status === 'error' && <ErrorIcon />}
        {duration && (
          <span className="text-[10px] text-[#666] font-mono">{duration}</span>
        )}
        <svg
          width="10" height="10" viewBox="0 0 16 16" fill="#666"
          className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
        >
          <path d="M6 4l4 4-4 4z"/>
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-[#2d2d2d] bg-[#111] max-h-[300px] overflow-y-auto">
          {tc.args && Object.keys(tc.args).length > 0 && (
            <div className="px-3 py-2 border-b border-[#2d2d2d]">
              <div className="text-[10px] text-[#666] uppercase tracking-wider mb-1">Input</div>
              <pre className="text-[11px] text-[#999] font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(tc.args, null, 2)}
              </pre>
            </div>
          )}
          {(tc.result || tc.error) && (
            <div className="px-3 py-2">
              <div className="text-[10px] text-[#666] uppercase tracking-wider mb-1">Output</div>
              <pre className={`text-[11px] font-mono whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto ${tc.error ? 'text-[#f85149]' : 'text-[#8b949e]'}`}>
                {tc.error || tc.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getToolSummary(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'read_file': return `Read ${args.path || 'file'}`;
    case 'edit_file': return `Edit ${args.path || 'file'}`;
    case 'create_file': return `Create ${args.path || 'file'}`;
    case 'list_directory': return `List ${args.path || '.'}`;
    case 'grep_search': return `Search "${args.query || ''}"${args.path ? ` in ${args.path}` : ''}`;
    case 'run_command': return `$ ${((args.command as string) || '').slice(0, 80)}`;
    default: return tool;
  }
}

// ── Code Diff Block with per-block Apply/Reject ──

function CodeDiffCard({ diff, onApply, onReject }: {
  diff: CodeDiffBlockType;
  onApply?: (diffId: string) => void;
  onReject?: (diffId: string) => void;
}) {
  return (
    <div className={`my-1.5 rounded-md overflow-hidden border ${
      diff.status === 'applied' ? 'border-[#238636]' :
      diff.status === 'rejected' ? 'border-[#f85149]/40' :
      'border-[#3c3c3c]'
    }`}>
      <div className={`flex items-center justify-between px-3 py-1.5 ${
        diff.status === 'applied' ? 'bg-[#0d1f12]' :
        diff.status === 'rejected' ? 'bg-[#200a0a]' :
        'bg-[#2d2d2d]'
      }`}>
        <span className="text-[11px] text-[#808080] font-mono truncate">
          {diff.file}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {diff.status === 'pending' && (
            <>
              <button
                onClick={() => onApply?.(diff.id)}
                className="px-2 py-0.5 text-[11px] text-[#3fb950] hover:bg-[#238636]/20 rounded transition-colors font-medium"
              >
                Apply
              </button>
              <button
                onClick={() => onReject?.(diff.id)}
                className="px-2 py-0.5 text-[11px] text-[#f85149] hover:bg-[#f85149]/20 rounded transition-colors"
              >
                Reject
              </button>
            </>
          )}
          {diff.status === 'applied' && (
            <span className="px-2 py-0.5 text-[11px] text-[#3fb950] flex items-center gap-1">
              <CheckIcon /> Applied
            </span>
          )}
          {diff.status === 'rejected' && (
            <span className="px-2 py-0.5 text-[11px] text-[#f85149] flex items-center gap-1">
              <ErrorIcon /> Rejected
            </span>
          )}
        </div>
      </div>
      <pre className="p-3 overflow-x-auto text-[11px] leading-[1.5] font-mono text-[#d4d4d4] bg-[#1e1e1e] max-h-[200px] overflow-y-auto">
        <code>{diff.code}</code>
      </pre>
    </div>
  );
}

// ── Inline code block (from markdown) with copy + apply ──

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="px-2 py-1 text-[11px] text-[#808080] hover:text-[#e0e0e0] hover:bg-[#ffffff10] rounded transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function CodeBlock({ language, filename, children, onApply }: {
  language?: string;
  filename?: string;
  children: string;
  onApply?: (code: string, filename?: string) => void;
}) {
  const [applied, setApplied] = useState(false);

  const handleApply = () => {
    onApply?.(children, filename);
    setApplied(true);
  };

  return (
    <div className={`my-2 rounded-lg overflow-hidden bg-[#1e1e1e] border ${applied ? 'border-[#238636]' : 'border-[#3c3c3c]'}`}>
      <div className={`flex items-center justify-between px-3 py-1.5 border-b ${applied ? 'bg-[#0d1f12] border-[#238636]' : 'bg-[#2d2d2d] border-[#3c3c3c]'}`}>
        <span className="text-[11px] text-[#808080] font-mono">
          {filename || language || 'code'}
        </span>
        <div className="flex items-center gap-1">
          <CopyButton text={children} />
          {onApply && (
            applied ? (
              <span className="px-2 py-1 text-[11px] text-[#3fb950] flex items-center gap-1">
                <CheckIcon /> Applied
              </span>
            ) : (
              <button
                onClick={handleApply}
                className="px-2 py-1 text-[11px] text-[#569cd6] hover:text-[#6eb0e6] hover:bg-[#ffffff10] rounded transition-colors font-medium"
              >
                Apply
              </button>
            )
          )}
        </div>
      </div>
      <pre className="p-3 overflow-x-auto text-[12px] leading-[1.5] font-mono text-[#d4d4d4]">
        <code>{children}</code>
      </pre>
    </div>
  );
}

// ── Terminal output block ──

function TerminalBlock({ command, output }: { command: string; output?: string }) {
  return (
    <div className="my-2 rounded-lg border border-[#3c3c3c] overflow-hidden bg-[#0d1117]">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#161b22] border-b border-[#3c3c3c]">
        <ToolIcon tool="run_command" />
        <span className="text-[11px] text-[#808080] font-mono">Terminal</span>
      </div>
      <div className="p-3 font-mono text-[12px]">
        <div className="text-[#58a6ff]">$ {command}</div>
        {output && <div className="text-[#8b949e] mt-1 whitespace-pre-wrap">{output}</div>}
      </div>
    </div>
  );
}

// ── Thinking section ──

function ThinkingSection({ thinking, thinkingTime }: { thinking: string; thinkingTime?: number }) {
  return (
    <details className="mb-3 rounded-lg border border-[#30363d] overflow-hidden group/think">
      <summary className="px-3 py-2 text-[12px] cursor-pointer hover:bg-[#1c1c1c] flex items-center gap-2 select-none list-none [&::-webkit-details-marker]:hidden bg-[#161616]">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="#808080" className="transition-transform group-open/think:rotate-90 shrink-0">
          <path d="M6 4l4 4-4 4z"/>
        </svg>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#569cd6" strokeWidth="2" className="shrink-0">
          <path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z"/>
          <line x1="10" y1="22" x2="14" y2="22"/>
        </svg>
        <span className="text-[#9d9d9d]">Thinking</span>
        {thinkingTime !== undefined && thinkingTime > 0 && (
          <span className="text-[#6a9955] text-[11px]">{thinkingTime}s</span>
        )}
      </summary>
      <div className="px-3 pb-3 pt-2 text-[11px] text-[#6d6d6d] whitespace-pre-wrap font-mono leading-relaxed max-h-[300px] overflow-y-auto border-t border-[#30363d] bg-[#111111]">
        {thinking}
      </div>
    </details>
  );
}

// ── Markdown renderer ──

function MarkdownContent({ content, onApplyCode }: { content: string; onApplyCode?: (code: string, filename?: string) => void }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const codeStr = String(children).replace(/\n$/, '');

          if (!className && !codeStr.includes('\n')) {
            return (
              <code className="bg-[#2d2d2d] text-[#e06c75] px-1.5 py-0.5 rounded text-[12px] font-mono" {...props}>
                {children}
              </code>
            );
          }

          const lang = match?.[1] || '';
          const parts = lang.split(':');
          const language = parts[0];
          const filename = parts.length > 1 ? parts.slice(1).join(':') : undefined;

          return (
            <CodeBlock language={language} filename={filename} onApply={onApplyCode}>
              {codeStr}
            </CodeBlock>
          );
        },
        pre({ children }) { return <>{children}</>; },
        p({ children }) { return <p className="mb-2 last:mb-0">{children}</p>; },
        ul({ children }) { return <ul className="mb-2 pl-4 list-disc space-y-1">{children}</ul>; },
        ol({ children }) { return <ol className="mb-2 pl-4 list-decimal space-y-1">{children}</ol>; },
        li({ children }) { return <li className="text-[13px]">{children}</li>; },
        strong({ children }) { return <strong className="text-[#e0e0e0] font-semibold">{children}</strong>; },
        em({ children }) { return <em className="text-[#9d9d9d]">{children}</em>; },
        h1({ children }) { return <h1 className="text-[16px] font-bold text-[#e0e0e0] mb-2 mt-3">{children}</h1>; },
        h2({ children }) { return <h2 className="text-[15px] font-bold text-[#e0e0e0] mb-2 mt-3">{children}</h2>; },
        h3({ children }) { return <h3 className="text-[14px] font-semibold text-[#e0e0e0] mb-1 mt-2">{children}</h3>; },
        a({ children, href }) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#569cd6] hover:underline">{children}</a>; },
        blockquote({ children }) { return <blockquote className="border-l-2 border-[#3c3c3c] pl-3 my-2 text-[#9d9d9d]">{children}</blockquote>; },
        hr() { return <hr className="border-[#3c3c3c] my-3" />; },
        table({ children }) { return <table className="border-collapse w-full my-2 text-[12px]">{children}</table>; },
        th({ children }) { return <th className="border border-[#3c3c3c] px-2 py-1 bg-[#2d2d2d] text-left text-[#e0e0e0]">{children}</th>; },
        td({ children }) { return <td className="border border-[#3c3c3c] px-2 py-1">{children}</td>; },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── Main component: renders message as ordered blocks ──

export default function ChatMessage({
  role,
  content,
  thinking,
  thinkingTime,
  streaming,
  streamingModel,
  streamingProvider,
  streamingProviderModel,
  isError,
  retryMessage,
  activeModel,
  toolCalls,
  codeDiffs,
  onRetry,
  onApplyCode,
  onApplyDiff,
  onRejectDiff,
}: ChatMessageProps) {
  if (role === 'user') {
    return (
      <div className="mb-4 px-3 py-2.5 bg-[#2a2a2a] rounded-lg border border-[#3c3c3c]">
        <div className="text-[13px] text-[#e0e0e0] whitespace-pre-wrap">{content}</div>
      </div>
    );
  }

  const hasToolCalls = toolCalls && toolCalls.length > 0;
  const hasCodeDiffs = codeDiffs && codeDiffs.length > 0;
  const hasContent = content && content.trim().length > 0;

  return (
    <div className="mb-4">
      {/* 1. Thinking section */}
      {thinking && <ThinkingSection thinking={thinking} thinkingTime={thinkingTime} />}

      {/* 2. Tool call blocks */}
      {hasToolCalls && (
        <div className="mb-2">
          {toolCalls!.map((tc) => (
            <ToolCallCard key={tc.id} tc={tc} />
          ))}
        </div>
      )}

      {/* 3. Code diff blocks with per-block apply */}
      {hasCodeDiffs && (
        <div className="mb-2">
          {codeDiffs!.map((diff) => (
            <CodeDiffCard
              key={diff.id}
              diff={diff}
              onApply={onApplyDiff}
              onReject={onRejectDiff}
            />
          ))}
        </div>
      )}

      {/* 4. Text content (markdown) */}
      {hasContent && (
        <div className={`text-[13px] leading-relaxed ${isError ? 'text-[#f85149]' : 'text-[#cccccc]'}`}>
          <MarkdownContent content={content} onApplyCode={onApplyCode} />
        </div>
      )}

      {/* 5. Streaming cursor */}
      {streaming && (
        <>
          {!hasContent && !hasToolCalls && (
            <div className="text-[13px] text-[#cccccc]">
              <span className="inline-block ml-1 w-1.5 h-4 bg-[#569cd6] animate-pulse align-[-2px]" />
            </div>
          )}
          {hasContent && (
            <span className="inline-block ml-1 w-1.5 h-4 bg-[#569cd6] animate-pulse align-[-2px]" />
          )}
          <div className="mt-2 flex items-center gap-2 text-[11px] text-[#808080] font-mono">
            <span className="w-1.5 h-1.5 bg-[#569cd6] rounded-full animate-pulse" />
            {streamingModel || activeModel}
            {streamingProviderModel && streamingProviderModel !== streamingModel && (
              <span className="text-[#569cd6]">({streamingProviderModel})</span>
            )}
            {streamingProvider && <span>via {streamingProvider}</span>}
          </div>
        </>
      )}

      {/* 6. Error retry button */}
      {isError && retryMessage && onRetry && (
        <button
          onClick={() => onRetry(retryMessage)}
          className="mt-2 px-3 py-1.5 bg-[#2d333b] hover:bg-[#3c444d] text-[#e0e0e0] text-[12px] font-medium rounded-md flex items-center gap-2 border border-[#444c56]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
          Retry
        </button>
      )}
    </div>
  );
}
