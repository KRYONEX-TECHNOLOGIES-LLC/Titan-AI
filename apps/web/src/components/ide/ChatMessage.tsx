'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  role: 'user' | 'assistant';
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
  onRetry?: (message: string) => void;
  onApplyCode?: (code: string, filename?: string) => void;
}

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
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>
                Applied
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

function TerminalBlock({ command, output }: { command: string; output?: string }) {
  return (
    <div className="my-2 rounded-lg border border-[#3c3c3c] overflow-hidden bg-[#0d1117]">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#161b22] border-b border-[#3c3c3c]">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="#808080"><path d="M0 2.75A2.75 2.75 0 012.75 0h10.5A2.75 2.75 0 0116 2.75v10.5A2.75 2.75 0 0113.25 16H2.75A2.75 2.75 0 010 13.25V2.75zm1.5 0c0-.69.56-1.25 1.25-1.25h10.5c.69 0 1.25.56 1.25 1.25v10.5c0 .69-.56 1.25-1.25 1.25H2.75c-.69 0-1.25-.56-1.25-1.25V2.75z"/><path d="M7 11.5a.75.75 0 01-.75.75h-2.5a.75.75 0 010-1.5h2.5A.75.75 0 017 11.5zm1.303-5.75l1.135 1.134a.5.5 0 010 .707L8.303 8.75a.75.75 0 11-1.06-1.06l.97-.97-.97-.97a.75.75 0 111.06-1.06z"/></svg>
        <span className="text-[11px] text-[#808080] font-mono">Terminal</span>
      </div>
      <div className="p-3 font-mono text-[12px]">
        <div className="text-[#58a6ff]">$ {command}</div>
        {output && <div className="text-[#8b949e] mt-1 whitespace-pre-wrap">{output}</div>}
      </div>
    </div>
  );
}

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
  onRetry,
  onApplyCode,
}: ChatMessageProps) {
  if (role === 'user') {
    return (
      <div className="mb-4 px-3 py-2.5 bg-[#2a2a2a] rounded-lg border border-[#3c3c3c]">
        <div className="text-[13px] text-[#e0e0e0] whitespace-pre-wrap">{content}</div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      {thinking && <ThinkingSection thinking={thinking} thinkingTime={thinkingTime} />}
      
      <div className={`text-[13px] leading-relaxed ${isError ? 'text-[#f85149]' : 'text-[#cccccc]'}`}>
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
            pre({ children }) {
              return <>{children}</>;
            },
            p({ children }) {
              return <p className="mb-2 last:mb-0">{children}</p>;
            },
            ul({ children }) {
              return <ul className="mb-2 pl-4 list-disc space-y-1">{children}</ul>;
            },
            ol({ children }) {
              return <ol className="mb-2 pl-4 list-decimal space-y-1">{children}</ol>;
            },
            li({ children }) {
              return <li className="text-[13px]">{children}</li>;
            },
            strong({ children }) {
              return <strong className="text-[#e0e0e0] font-semibold">{children}</strong>;
            },
            em({ children }) {
              return <em className="text-[#9d9d9d]">{children}</em>;
            },
            h1({ children }) {
              return <h1 className="text-[16px] font-bold text-[#e0e0e0] mb-2 mt-3">{children}</h1>;
            },
            h2({ children }) {
              return <h2 className="text-[15px] font-bold text-[#e0e0e0] mb-2 mt-3">{children}</h2>;
            },
            h3({ children }) {
              return <h3 className="text-[14px] font-semibold text-[#e0e0e0] mb-1 mt-2">{children}</h3>;
            },
            a({ children, href }) {
              return <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#569cd6] hover:underline">{children}</a>;
            },
            blockquote({ children }) {
              return <blockquote className="border-l-2 border-[#3c3c3c] pl-3 my-2 text-[#9d9d9d]">{children}</blockquote>;
            },
            hr() {
              return <hr className="border-[#3c3c3c] my-3" />;
            },
            table({ children }) {
              return <table className="border-collapse w-full my-2 text-[12px]">{children}</table>;
            },
            th({ children }) {
              return <th className="border border-[#3c3c3c] px-2 py-1 bg-[#2d2d2d] text-left text-[#e0e0e0]">{children}</th>;
            },
            td({ children }) {
              return <td className="border border-[#3c3c3c] px-2 py-1">{children}</td>;
            },
          }}
        >
          {content}
        </ReactMarkdown>

        {streaming && <span className="inline-block ml-1 w-1.5 h-4 bg-[#569cd6] animate-pulse align-[-2px]" />}
      </div>

      {streaming && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-[#808080] font-mono">
          <span className="w-1.5 h-1.5 bg-[#569cd6] rounded-full animate-pulse" />
          {streamingModel || activeModel}
          {streamingProviderModel && streamingProviderModel !== streamingModel && (
            <span className="text-[#569cd6]">({streamingProviderModel})</span>
          )}
          {streamingProvider && <span>via {streamingProvider}</span>}
        </div>
      )}

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
