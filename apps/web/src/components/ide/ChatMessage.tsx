'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useVoiceStore } from '@/stores/voice.store';
import { ttsService } from '@/lib/tts.service';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ToolCallBlock as ToolCallBlockType, CodeDiffBlock as CodeDiffBlockType, GeneratedImage } from '@/types/ide';

interface MessageAttachment {
  mediaType: string;
  base64: string;
}

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  attachments?: MessageAttachment[];
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
  generatedImages?: GeneratedImage[];
  onRetry?: (message: string) => void;
  onApplyCode?: (code: string, filename?: string) => void;
  onApplyDiff?: (diffId: string) => void;
  onRejectDiff?: (diffId: string) => void;
}

/* ═══ ICONS ═══ */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="#6e6e6e"
      style={{ transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>
      <path d="M6 4l4 4-4 4z"/>
    </svg>
  );
}
function SpinnerIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#569cd6" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </svg>
  );
}
function CheckIcon({ size = 12, color = '#3fb950' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color} style={{ flexShrink: 0 }}>
      <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
    </svg>
  );
}
function XIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="#f85149" style={{ flexShrink: 0 }}>
      <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
    </svg>
  );
}

function ToolIcon({ tool }: { tool: string }) {
  switch (tool) {
    case 'read_file':
      return <svg width="12" height="12" viewBox="0 0 16 16" fill="#808080" style={{ flexShrink: 0 }}><path d="M3 1.75C3 .784 3.784 0 4.75 0h3.5a.75.75 0 01.53.22l5 5a.75.75 0 01.22.53v8.5A1.75 1.75 0 0112.25 16h-7.5A1.75 1.75 0 013 14.25V1.75zM4.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H4.75zm4.75.97v1.78c0 .138.112.25.25.25h1.78L9.5 2.47z"/></svg>;
    case 'edit_file':
      return <svg width="12" height="12" viewBox="0 0 16 16" fill="#e0a526" style={{ flexShrink: 0 }}><path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zM12.25 3.52l-7.5 7.5-1.657.583.583-1.657 7.5-7.5 1.074 1.074z"/></svg>;
    case 'create_file':
      return <svg width="12" height="12" viewBox="0 0 16 16" fill="#3fb950" style={{ flexShrink: 0 }}><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586a.75.75 0 01.53.22l2.914 2.914a.75.75 0 01.22.53V14.25A1.75 1.75 0 0112.25 16h-8.5A1.75 1.75 0 012 14.25V1.75zM3.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V4.5h-2.75A1.75 1.75 0 018 2.75V1.5H3.75z"/></svg>;
    case 'delete_file':
      return <svg width="12" height="12" viewBox="0 0 16 16" fill="#f85149" style={{ flexShrink: 0 }}><path d="M11 1.75V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 10-1.492-.15L11.538 13h-7.076l.034-3.325z"/></svg>;
    case 'run_command':
      return <svg width="12" height="12" viewBox="0 0 16 16" fill="#808080" style={{ flexShrink: 0 }}><path d="M1.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V1.75a.25.25 0 00-.25-.25H1.75zM0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25V1.75zm4.22 9.53a.75.75 0 011.06 0L8 13.29l2.72-2.76a.75.75 0 111.06 1.06L8.53 14.88a.75.75 0 01-1.06 0L4.22 12.12a.75.75 0 010-1.06zM8 8a1 1 0 01-1-1V3a1 1 0 112 0v4a1 1 0 01-1 1z"/></svg>;
    case 'web_search':
      return <svg width="12" height="12" viewBox="0 0 16 16" fill="#808080" style={{ flexShrink: 0 }}><path d="M10.68 11.74a6 6 0 01-7.922-8.982 6 6 0 018.982 7.922l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04zm-7.22-1.54a4.5 4.5 0 106.364-6.364 4.5 4.5 0 00-6.364 6.364z"/></svg>;
    case 'web_fetch':
      return <svg width="12" height="12" viewBox="0 0 16 16" fill="#808080" style={{ flexShrink: 0 }}><path d="M7.47 8.75a.75.75 0 011.06 0l3.25 3.25a.75.75 0 11-1.06 1.06L8 9.31l-2.72 2.75a.75.75 0 01-1.06-1.06l3.25-3.25zM8 0a.75.75 0 01.75.75v8.586l2.72-2.75a.75.75 0 011.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 7.646a.75.75 0 111.06-1.06L8 9.31V.75A.75.75 0 018 0z"/></svg>;
    default:
      return <svg width="12" height="12" viewBox="0 0 16 16" fill="#808080" style={{ flexShrink: 0 }}><path d="M1.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V1.75a.25.25 0 00-.25-.25H1.75zM0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25V1.75z"/></svg>;
  }
}

export default function ChatMessage(props: ChatMessageProps) {
  const { content, role, streaming } = props;
  const { isTTSEnabled } = useVoiceStore();

  useEffect(() => {
    if (role === 'assistant' && !streaming && isTTSEnabled && content) {
      ttsService.speak(content);
    }
    // Only re-run when content is finalized or TTS is toggled
  }, [content, streaming, isTTSEnabled, role]);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const [isDiffExpanded, setIsDiffExpanded] = useState<Record<string, boolean>>({});

  const thinkingTimeRef = useRef<NodeJS.Timeout | null>(null);
  const [displayThinkingTime, setDisplayThinkingTime] = useState(0);

  useEffect(() => {
    if (props.thinkingTime) {
      setDisplayThinkingTime(props.thinkingTime);
    }
  }, [props.thinkingTime]);

  const renderableContent = content || (streaming ? '...' : '');

  const renderAttachments = () => {
    if (!props.attachments || props.attachments.length === 0) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {props.attachments.map((att, index) => (
          <div key={index} className="border border-gray-700 rounded-md p-2 bg-gray-800/50">
            <p className="text-xs text-gray-400 mb-1">{att.mediaType}</p>
            <img src={`data:${att.mediaType};base64,${att.base64}`} alt={`attachment ${index + 1}`} className="max-w-xs max-h-48 rounded" />
          </div>
        ))}
      </div>
    );
  };

  const renderThinkingBlock = () => {
    if (!props.thinking) return null;
    return (
      <div className="mt-2 text-xs text-gray-400 border-l-2 border-gray-600 pl-2">
        <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}>
          <ChevronIcon open={isThinkingExpanded} />
          <span className="font-mono">Thinking...</span>
          {displayThinkingTime > 0 && <span className="text-gray-500">({(displayThinkingTime / 1000).toFixed(2)}s)</span>}
        </div>
        {isThinkingExpanded && (
          <div className="mt-1 pl-3.5 whitespace-pre-wrap font-mono text-gray-500">
            {props.thinking}
          </div>
        )}
      </div>
    );
  };

  const renderToolCalls = () => {
    if (!props.toolCalls || props.toolCalls.length === 0) return null;
    return (
      <div className="mt-2 text-xs">
        {props.toolCalls.map((call, index) => (
          <ToolCallBlock key={index} {...call} />
        ))}
      </div>
    );
  };

  const renderCodeDiffs = () => {
    if (!props.codeDiffs || props.codeDiffs.length === 0) return null;
    return (
      <div className="mt-2 text-xs">
        {props.codeDiffs.map((diff) => (
          <CodeDiffBlock
            key={diff.diffId}
            {...diff}
            isExpanded={isDiffExpanded[diff.diffId] ?? true}
            onToggleExpand={() => setIsDiffExpanded(prev => ({ ...prev, [diff.diffId]: !(prev[diff.diffId] ?? true) }))}
            onApply={() => props.onApplyDiff?.(diff.diffId)}
            onReject={() => props.onRejectDiff?.(diff.diffId)}
          />
        ))}
      </div>
    );
  };
  
  const renderGeneratedImages = () => {
    if (!props.generatedImages || props.generatedImages.length === 0) return null;
    return (
      <div className="mt-2 grid grid-cols-2 gap-2">
        {props.generatedImages.map((image, index) => (
          <div key={index} className="border border-gray-700 rounded-md overflow-hidden">
            <img src={image.url} alt={image.prompt} className="w-full h-auto" />
            <p className="text-xs text-gray-400 p-2 bg-gray-800/50">{image.prompt}</p>
          </div>
        ))}
      </div>
    );
  };

  const renderMessageContent = () => {
    return (
      <div className="prose prose-sm prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {renderableContent}
        </ReactMarkdown>
      </div>
    );
  };

  const renderRetry = () => {
    if (!props.isError || !props.onRetry) return null;
    return (
      <div className="mt-2">
        <button
          onClick={() => props.onRetry?.(props.retryMessage || props.content)}
          className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white"
        >
          Retry
        </button>
      </div>
    );
  };

  const getAvatar = () => {
    if (role === 'user') return 'M';
    if (role === 'assistant') return 'T';
    return 'T';
  };

  const getAvatarBgColor = () => {
    if (role === 'user') return '#2a3d54';
    if (role === 'assistant') return '#4a2a54';
    return '#333';
  };

  return (
    <div className={`p-4 border-b border-gray-800 ${role === 'user' ? 'bg-gray-800/30' : ''}`}>
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ backgroundColor: getAvatarBgColor() }}
        >
          {getAvatar()}
        </div>
        <div className="flex-1 pt-0.5">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <span className="font-bold text-white">{role === 'user' ? 'You' : 'Titan'}</span>
            {streaming && (
              <div className="flex items-center gap-1.5">
                <SpinnerIcon size={10} />
                <span className="font-mono">{props.streamingProviderModel || props.streamingModel || '...'}</span>
              </div>
            )}
          </div>
          {renderMessageContent()}
          {renderAttachments()}
          {renderThinkingBlock()}
          {renderToolCalls()}
          {renderCodeDiffs()}
          {renderGeneratedImages()}
          {renderRetry()}
        </div>
      </div>
    </div>
  );
}

function ToolCallBlock({ tool_name, tool_args, status, result, isExpanded: initialIsExpanded }: ToolCallBlockType) {
  const [isExpanded, setIsExpanded] = useState(initialIsExpanded ?? false);
  const [isResultExpanded, setIsResultExpanded] = useState(false);

  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return <SpinnerIcon />;
      case 'success':
        return <CheckIcon />;
      case 'failure':
        return <XIcon />;
      default:
        return null;
    }
  };

  const formatArgs = (args: any) => {
    if (typeof args === 'string') {
      try {
        const parsed = JSON.parse(args);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return args;
      }
    }
    return JSON.stringify(args, null, 2);
  };

  return (
    <div className="font-mono bg-gray-800/50 border border-gray-700 rounded-md mb-2">
      <div className="flex items-center gap-2 p-2 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <ChevronIcon open={isExpanded} />
        <div className="flex items-center gap-1.5">
          {getStatusIcon()}
          <ToolIcon tool={tool_name} />
          <span>{tool_name}</span>
        </div>
      </div>
      {isExpanded && (
        <div className="border-t border-gray-700 p-2">
          <pre className="whitespace-pre-wrap text-gray-300 text-xs bg-transparent p-0 m-0">
            {formatArgs(tool_args)}
          </pre>
          {result && (
            <div className="mt-2 border-t border-dashed border-gray-600 pt-2">
               <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setIsResultExpanded(!isResultExpanded)}>
                <ChevronIcon open={isResultExpanded} />
                <span className="text-gray-400">Result</span>
              </div>
              {isResultExpanded && (
                <pre className="mt-1 pl-3.5 whitespace-pre-wrap text-gray-400 text-xs bg-transparent p-0 m-0">
                  {result}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CodeDiffBlock({
  diffId,
  filename,
  language,
  status,
  diff,
  isExpanded,
  onToggleExpand,
  onApply,
  onReject
}: CodeDiffBlockType & { isExpanded: boolean; onToggleExpand: () => void; onApply: () => void; onReject: () => void; }) {

  const renderDiff = () => {
    const lines = diff.split('\n');
    return lines.map((line, index) => {
      let colorClass = 'text-gray-300';
      if (line.startsWith('+')) colorClass = 'text-green-400';
      if (line.startsWith('-')) colorClass = 'text-red-400';
      return (
        <div key={index} className={`flex ${line.startsWith('+') ? 'bg-green-900/20' : line.startsWith('-') ? 'bg-red-900/20' : ''}`}>
          <span className="w-8 text-right pr-2 text-gray-500 select-none">{index + 1}</span>
          <span className="flex-1 pr-4">{line}</span>
        </div>
      );
    });
  };

  return (
    <div className="font-mono bg-gray-800/50 border border-gray-700 rounded-md mb-2">
      <div className="flex items-center justify-between p-2">
        <div className="flex items-center gap-2 cursor-pointer" onClick={onToggleExpand}>
          <ChevronIcon open={isExpanded} />
          <span className="text-gray-300">{filename}</span>
        </div>
        {status === 'pending' && (
          <div className="flex items-center gap-2">
            <button onClick={onApply} className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-white">Apply</button>
            <button onClick={onReject} className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-white">Reject</button>
          </div>
        )}
        {status === 'applied' && <span className="text-xs text-green-400">Applied</span>}
        {status === 'rejected' && <span className="text-xs text-red-400">Rejected</span>}
      </div>
      {isExpanded && (
        <div className="border-t border-gray-700 p-2 bg-gray-900/50 max-h-80 overflow-y-auto">
          <pre className="whitespace-pre text-xs p-0 m-0">
            {renderDiff()}
          </pre>
        </div>
      )}
    </div>
  );
}
