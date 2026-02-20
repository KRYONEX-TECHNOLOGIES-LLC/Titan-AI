'use client';

import React, { useState, useEffect, useRef } from 'react';
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

/* ═══════════════════════════════════════════════════════════
   ICONS - Compact SVG icons matching Cursor's minimal style
   ═══════════════════════════════════════════════════════════ */

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="#6e6e6e"
      className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>
      <path d="M6 4l4 4-4 4z"/>
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#569cd6" strokeWidth="2.5" className="animate-spin">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

function CheckCircle() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="#3fb950">
      <path d="M8 16A8 8 0 108 0a8 8 0 000 16zm3.78-9.72a.75.75 0 00-1.06-1.06L7 8.94 5.28 7.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25z"/>
    </svg>
  );
}

function XCircle() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="#f85149">
      <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
    </svg>
  );
}

function ToolIcon({ tool }: { tool: string }) {
  const cls = "shrink-0";
  switch (tool) {
    case 'read_file':
      return <svg className={cls} width="12" height="12" viewBox="0 0 16 16" fill="#808080"><path d="M3 1.75C3 .784 3.784 0 4.75 0h3.5a.75.75 0 01.53.22l5 5a.75.75 0 01.22.53v8.5A1.75 1.75 0 0112.25 16h-7.5A1.75 1.75 0 013 14.25V1.75zM4.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H4.75zm4.75.97v1.78c0 .138.112.25.25.25h1.78L9.5 2.47z"/></svg>;
    case 'edit_file':
      return <svg className={cls} width="12" height="12" viewBox="0 0 16 16" fill="#e0a526"><path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L3.463 11.1a.25.25 0 00-.064.108l-.563 1.97 1.971-.564a.25.25 0 00.108-.064l8.61-8.61a.25.25 0 000-.353L12.427 2.487z"/></svg>;
    case 'create_file':
      return <svg className={cls} width="12" height="12" viewBox="0 0 16 16" fill="#3fb950"><path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/></svg>;
    case 'delete_file':
      return <svg className={cls} width="12" height="12" viewBox="0 0 16 16" fill="#f85149"><path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z"/></svg>;
    case 'list_directory':
      return <svg className={cls} width="12" height="12" viewBox="0 0 16 16" fill="#808080"><path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/></svg>;
    case 'grep_search':
    case 'glob_search':
    case 'semantic_search':
      return <svg className={cls} width="12" height="12" viewBox="0 0 16 16" fill="#569cd6"><path d="M11.5 7a4.499 4.499 0 11-8.998 0A4.499 4.499 0 0111.5 7zm-.82 4.74a6 6 0 111.06-1.06l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04z"/></svg>;
    case 'run_command':
      return <svg className={cls} width="12" height="12" viewBox="0 0 16 16" fill="#c586c0"><path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H1.75z"/><path d="M7 11.5a.75.75 0 01-.75.75h-2.5a.75.75 0 010-1.5h2.5A.75.75 0 017 11.5zm1.303-5.75l1.135 1.134a.5.5 0 010 .707L8.303 8.75a.75.75 0 11-1.06-1.06l.97-.97-.97-.97a.75.75 0 111.06-1.06z"/></svg>;
    default:
      return <svg className={cls} width="12" height="12" viewBox="0 0 16 16" fill="#808080"><path d="M8.878.392a1.75 1.75 0 00-1.756 0l-5.25 3.045A1.75 1.75 0 001 5.07v5.86c0 .624.332 1.2.872 1.514l5.25 3.045a1.75 1.75 0 001.756 0l5.25-3.045c.54-.313.872-.89.872-1.514V5.07c0-.624-.332-1.2-.872-1.514L8.878.392z"/></svg>;
  }
}

/* ═══════════════════════════════════════════════════════════
   TOOL CALL ROW - Compact single-line like Cursor
   Collapsed: icon + "Read src/file.ts" + status + chevron
   Expanded: shows input/output in dark panel below
   ═══════════════════════════════════════════════════════════ */

function ToolCallRow({ tc }: { tc: ToolCallBlockType }) {
  const [expanded, setExpanded] = useState(false);
  const label = getToolLabel(tc.tool, tc.args);
  const duration = tc.finishedAt && tc.startedAt
    ? `${((tc.finishedAt - tc.startedAt) / 1000).toFixed(1)}s`
    : null;

  return (
    <div className="group/tc">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 py-[3px] px-1 text-left rounded hover:bg-[#ffffff06] transition-colors"
      >
        <ChevronIcon open={expanded} />
        <ToolIcon tool={tc.tool} />
        <span className="flex-1 text-[12px] text-[#9d9d9d] truncate font-normal">
          {label}
        </span>
        {tc.status === 'running' && <SpinnerIcon />}
        {tc.status === 'done' && <CheckCircle />}
        {tc.status === 'error' && <XCircle />}
        {duration && <span className="text-[10px] text-[#555] tabular-nums">{duration}</span>}
      </button>

      {expanded && (
        <div className="ml-[22px] mt-0.5 mb-1 rounded overflow-hidden border border-[#2a2a2a] bg-[#0d0d0d]">
          {tc.args && Object.keys(tc.args).length > 0 && (
            <div className="px-2.5 py-1.5 border-b border-[#1e1e1e]">
              <pre className="text-[11px] text-[#6e6e6e] font-mono whitespace-pre-wrap break-all leading-relaxed">
                {formatToolArgs(tc.tool, tc.args)}
              </pre>
            </div>
          )}
          {(tc.result || tc.error) && (
            <div className="px-2.5 py-1.5 max-h-[200px] overflow-y-auto">
              <pre className={`text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed ${tc.error ? 'text-[#f85149]' : 'text-[#6e6e6e]'}`}>
                {(tc.error || tc.result || '').slice(0, 2000)}
                {(tc.error || tc.result || '').length > 2000 && '\n...'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getToolLabel(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'read_file': return `Read ${args.path || 'file'}`;
    case 'edit_file': return `Edited ${args.path || 'file'}`;
    case 'create_file': return `Created ${args.path || 'file'}`;
    case 'delete_file': return `Deleted ${args.path || 'file'}`;
    case 'list_directory': return `Listed ${args.path || '.'}`;
    case 'grep_search': return `Searched for "${(args.query as string || '').slice(0, 40)}"`;
    case 'glob_search': return `Glob ${args.pattern || ''}`;
    case 'semantic_search': return `Searched codebase`;
    case 'run_command': {
      const cmd = (args.command as string || '').slice(0, 60);
      return `Ran \`${cmd}\``;
    }
    case 'read_lints': return `Read lints ${args.path || ''}`;
    default: return tool.replace(/_/g, ' ');
  }
}

function formatToolArgs(tool: string, args: Record<string, unknown>): string {
  if (tool === 'run_command') return `$ ${args.command || ''}`;
  if (tool === 'edit_file' || tool === 'create_file') {
    const lines: string[] = [];
    if (args.path) lines.push(`file: ${args.path}`);
    if (args.old_string) lines.push(`find: ${(args.old_string as string).slice(0, 100)}...`);
    if (args.new_string) lines.push(`replace: ${(args.new_string as string).slice(0, 100)}...`);
    return lines.join('\n') || JSON.stringify(args, null, 2);
  }
  if (tool === 'read_file') {
    const parts: string[] = [];
    if (args.path) parts.push(`${args.path}`);
    if (args.offset) parts.push(`offset: ${args.offset}`);
    if (args.limit) parts.push(`limit: ${args.limit}`);
    return parts.join(', ');
  }
  return JSON.stringify(args, null, 2);
}

/* ═══════════════════════════════════════════════════════════
   CODE DIFF BLOCK - File header with Accept/Reject icons
   ═══════════════════════════════════════════════════════════ */

function CodeDiffCard({ diff, onApply, onReject }: {
  diff: CodeDiffBlockType;
  onApply?: (diffId: string) => void;
  onReject?: (diffId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const statusColor = diff.status === 'applied' ? '#238636' : diff.status === 'rejected' ? '#f85149' : '#3c3c3c';

  return (
    <div className="my-1 rounded overflow-hidden" style={{ borderLeft: `2px solid ${statusColor}` }}>
      <div className={`flex items-center justify-between px-2.5 py-1 ${
        diff.status === 'applied' ? 'bg-[#0d1f12]' : diff.status === 'rejected' ? 'bg-[#1c0c0c]' : 'bg-[#1a1a1a]'
      }`}>
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-1.5 min-w-0 flex-1">
          <ChevronIcon open={!collapsed} />
          <ToolIcon tool="edit_file" />
          <span className="text-[11px] text-[#808080] font-mono truncate">{diff.file}</span>
        </button>
        <div className="flex items-center gap-0.5 shrink-0 ml-2">
          {diff.status === 'pending' && (
            <>
              <button
                onClick={() => onApply?.(diff.id)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#238636]/30 transition-colors"
                title="Accept (Ctrl+Enter)"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="#3fb950"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>
              </button>
              <button
                onClick={() => onReject?.(diff.id)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#f85149]/30 transition-colors"
                title="Reject (Ctrl+Backspace)"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="#f85149"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>
              </button>
            </>
          )}
          {diff.status === 'applied' && (
            <span className="flex items-center gap-1 text-[10px] text-[#3fb950] px-1">
              <CheckCircle /> Applied
            </span>
          )}
          {diff.status === 'rejected' && (
            <span className="flex items-center gap-1 text-[10px] text-[#f85149] px-1">
              <XCircle /> Rejected
            </span>
          )}
        </div>
      </div>
      {!collapsed && (
        <pre className="px-3 py-2 overflow-x-auto text-[11px] leading-[1.6] font-mono text-[#d4d4d4] bg-[#111] max-h-[240px] overflow-y-auto">
          <code>{diff.code}</code>
        </pre>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MARKDOWN CODE BLOCK - with file header + copy + apply
   ═══════════════════════════════════════════════════════════ */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#ffffff10] transition-colors"
      title="Copy"
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="#3fb950"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="#6e6e6e"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"/></svg>
      )}
    </button>
  );
}

function CodeBlock({ language, filename, children, onApply }: {
  language?: string; filename?: string; children: string;
  onApply?: (code: string, filename?: string) => void;
}) {
  const [applied, setApplied] = useState(false);
  return (
    <div className="my-1.5 rounded overflow-hidden bg-[#0d0d0d] border border-[#1e1e1e]">
      <div className="flex items-center justify-between px-2.5 py-1 bg-[#161616] border-b border-[#1e1e1e]">
        <span className="text-[11px] text-[#6e6e6e] font-mono truncate">{filename || language || 'code'}</span>
        <div className="flex items-center gap-0.5">
          <CopyButton text={children} />
          {onApply && !applied && (
            <button
              onClick={() => { onApply(children, filename); setApplied(true); }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#ffffff10] transition-colors"
              title="Apply"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="#569cd6"><path d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm.75 4.75a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z"/></svg>
            </button>
          )}
          {applied && (
            <span className="w-6 h-6 flex items-center justify-center"><CheckCircle /></span>
          )}
        </div>
      </div>
      <pre className="px-3 py-2 overflow-x-auto text-[11px] leading-[1.6] font-mono text-[#d4d4d4]">
        <code>{children}</code>
      </pre>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   THINKING SECTION - "Thought for Xs" auto-collapsed
   ═══════════════════════════════════════════════════════════ */

function ThinkingSection({ thinking, thinkingTime, isStreaming }: {
  thinking: string; thinkingTime?: number; isStreaming?: boolean;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [wasStreaming, setWasStreaming] = useState(false);

  useEffect(() => {
    if (isStreaming) {
      setWasStreaming(true);
    } else if (wasStreaming && detailsRef.current) {
      detailsRef.current.open = false;
      setWasStreaming(false);
    }
  }, [isStreaming, wasStreaming]);

  const label = thinkingTime && thinkingTime > 0
    ? `Thought for ${thinkingTime}s`
    : isStreaming ? 'Thinking...' : 'Thought';

  return (
    <details ref={detailsRef} className="mb-2 group/think" open={isStreaming}>
      <summary className="py-1 text-[12px] cursor-pointer flex items-center gap-1.5 select-none list-none [&::-webkit-details-marker]:hidden text-[#6e6e6e] hover:text-[#9d9d9d] transition-colors">
        <ChevronIcon open={false} />
        {isStreaming && <SpinnerIcon />}
        <span>{label}</span>
      </summary>
      <div className="ml-[22px] mt-0.5 mb-1 px-2.5 py-2 text-[11px] text-[#555] whitespace-pre-wrap font-mono leading-relaxed max-h-[250px] overflow-y-auto rounded bg-[#0d0d0d] border border-[#1e1e1e]">
        {thinking}
      </div>
    </details>
  );
}

/* ═══════════════════════════════════════════════════════════
   MARKDOWN RENDERER - Cursor-style: dense, code-focused
   ═══════════════════════════════════════════════════════════ */

function MarkdownContent({ content, onApplyCode }: {
  content: string; onApplyCode?: (code: string, filename?: string) => void;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const codeStr = String(children).replace(/\n$/, '');

          if (!className && !codeStr.includes('\n')) {
            return (
              <code className="bg-[#1a1a1a] text-[#ce9178] px-1 py-[1px] rounded text-[11.5px] font-mono" {...props}>
                {children}
              </code>
            );
          }

          const lang = match?.[1] || '';
          const parts = lang.split(':');
          const language = parts[0];
          const filename = parts.length > 1 ? parts.slice(1).join(':') : undefined;

          return <CodeBlock language={language} filename={filename} onApply={onApplyCode}>{codeStr}</CodeBlock>;
        },
        pre({ children }) { return <>{children}</>; },
        p({ children }) { return <p className="mb-1.5 last:mb-0 leading-[1.5]">{children}</p>; },
        ul({ children }) { return <ul className="mb-1.5 pl-4 list-disc space-y-0.5">{children}</ul>; },
        ol({ children }) { return <ol className="mb-1.5 pl-4 list-decimal space-y-0.5">{children}</ol>; },
        li({ children }) { return <li className="text-[12.5px] leading-[1.5]">{children}</li>; },
        strong({ children }) { return <strong className="text-[#e0e0e0] font-medium">{children}</strong>; },
        em({ children }) { return <em className="text-[#9d9d9d]">{children}</em>; },
        h1({ children }) { return <h1 className="text-[14px] font-semibold text-[#e0e0e0] mb-1.5 mt-2">{children}</h1>; },
        h2({ children }) { return <h2 className="text-[13px] font-semibold text-[#e0e0e0] mb-1 mt-2">{children}</h2>; },
        h3({ children }) { return <h3 className="text-[12.5px] font-medium text-[#e0e0e0] mb-1 mt-1.5">{children}</h3>; },
        a({ children, href }) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#569cd6] hover:underline">{children}</a>; },
        blockquote({ children }) { return <blockquote className="border-l-2 border-[#333] pl-2.5 my-1.5 text-[#6e6e6e]">{children}</blockquote>; },
        hr() { return <hr className="border-[#2a2a2a] my-2" />; },
        table({ children }) { return <table className="border-collapse w-full my-1.5 text-[11px]">{children}</table>; },
        th({ children }) { return <th className="border border-[#2a2a2a] px-2 py-1 bg-[#1a1a1a] text-left text-[#e0e0e0]">{children}</th>; },
        td({ children }) { return <td className="border border-[#2a2a2a] px-2 py-1">{children}</td>; },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT - Cursor-style message rendering
   No bubbles, no avatars, just a flowing stream of work
   ═══════════════════════════════════════════════════════════ */

export default function ChatMessage({
  role, content, thinking, thinkingTime, streaming,
  streamingModel, streamingProvider, streamingProviderModel,
  isError, retryMessage, activeModel, toolCalls, codeDiffs,
  onRetry, onApplyCode, onApplyDiff, onRejectDiff,
}: ChatMessageProps) {

  if (role === 'user') {
    return (
      <div className="mb-3 mt-1">
        <div className="text-[12.5px] text-[#e0e0e0] whitespace-pre-wrap leading-[1.5]">{content}</div>
      </div>
    );
  }

  const hasToolCalls = toolCalls && toolCalls.length > 0;
  const hasCodeDiffs = codeDiffs && codeDiffs.length > 0;
  const hasContent = content && content.trim().length > 0;

  return (
    <div className="mb-3">
      {/* Thinking */}
      {thinking && (
        <ThinkingSection thinking={thinking} thinkingTime={thinkingTime} isStreaming={streaming && !hasContent} />
      )}

      {/* Tool calls - compact rows */}
      {hasToolCalls && (
        <div className="mb-1">
          {toolCalls!.map((tc) => <ToolCallRow key={tc.id} tc={tc} />)}
        </div>
      )}

      {/* Code diffs */}
      {hasCodeDiffs && (
        <div className="mb-1.5">
          {codeDiffs!.map((diff) => (
            <CodeDiffCard key={diff.id} diff={diff} onApply={onApplyDiff} onReject={onRejectDiff} />
          ))}
        </div>
      )}

      {/* Text content */}
      {hasContent && (
        <div className={`text-[12.5px] leading-[1.5] ${isError ? 'text-[#f85149]' : 'text-[#b0b0b0]'}`}>
          <MarkdownContent content={content} onApplyCode={onApplyCode} />
        </div>
      )}

      {/* Streaming cursor */}
      {streaming && (
        <span className="inline-block w-[3px] h-[14px] bg-[#569cd6] animate-pulse rounded-[1px] align-[-2px] ml-0.5" />
      )}

      {/* Error retry */}
      {isError && retryMessage && onRetry && (
        <button
          onClick={() => onRetry(retryMessage)}
          className="mt-1.5 px-2.5 py-1 bg-[#1a1a1a] hover:bg-[#222] text-[#9d9d9d] text-[11px] rounded flex items-center gap-1.5 border border-[#2a2a2a] transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
          Retry
        </button>
      )}
    </div>
  );
}
