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
      return <svg width="12" height="12" viewBox="0 0 16 16" fill="#e0a526" style={{ flexShrink: 0 }}><path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L3.463 11.1a.25.25 0 00-.064.108l-.563 1.97 1.971-.564a.25.25 0 00.108-.064l8.61-8.61a.25.25 0 000-.353L12.427 2.487z"/></svg>;
    case 'create_file':
      return <svg width="12" height="12" viewBox="0 0 16 16" fill="#3fb950" style={{ flexShrink: 0 }}><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0113.25 16h-9.5A1.75 1.75 0 012 14.25V1.75zm1.75-.25a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 00.25-.25V6h-2.75A1.75 1.75 0 019 4.25V1.5H3.75zm6.75.96v1.79c0 .138.112.25.25.25h1.79L10.5 2.46z"/></svg>;
    case 'delete_file':
      return <svg width="12" height="12" viewBox="0 0 16 16" fill="#f85149" style={{ flexShrink: 0 }}><path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z"/></svg>;
    case 'list_directory':
      return <svg width="12" height="12" viewBox="0 0 16 16" fill="#dcb67a" style={{ flexShrink: 0 }}><path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/></svg>;
    case 'grep_search': case 'glob_search': case 'semantic_search':
      return <svg width="12" height="12" viewBox="0 0 16 16" fill="#569cd6" style={{ flexShrink: 0 }}><path d="M11.5 7a4.499 4.499 0 11-8.998 0A4.499 4.499 0 0111.5 7zm-.82 4.74a6 6 0 111.06-1.06l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04z"/></svg>;
    case 'run_command':
      return <svg width="12" height="12" viewBox="0 0 16 16" fill="#c586c0" style={{ flexShrink: 0 }}><path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H1.75z"/><path d="M7 11.5a.75.75 0 01-.75.75h-2.5a.75.75 0 010-1.5h2.5A.75.75 0 017 11.5zm1.303-5.75l1.135 1.134a.5.5 0 010 .707L8.303 8.75a.75.75 0 11-1.06-1.06l.97-.97-.97-.97a.75.75 0 111.06-1.06z"/></svg>;
    default:
      return <svg width="12" height="12" viewBox="0 0 16 16" fill="#808080" style={{ flexShrink: 0 }}><path d="M8.878.392a1.75 1.75 0 00-1.756 0l-5.25 3.045A1.75 1.75 0 001 5.07v5.86c0 .624.332 1.2.872 1.514l5.25 3.045a1.75 1.75 0 001.756 0l5.25-3.045c.54-.313.872-.89.872-1.514V5.07c0-.624-.332-1.2-.872-1.514L8.878.392z"/></svg>;
  }
}

/* ═══ TOOL CALL ROW ═══ */
function getToolLabel(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'read_file': return `Read ${args.path || 'file'}`;
    case 'edit_file': return `Edited ${args.path || 'file'}`;
    case 'create_file': return `Created ${args.path || 'file'}`;
    case 'delete_file': return `Deleted ${args.path || 'file'}`;
    case 'list_directory': return `Listed ${args.path || '.'}`;
    case 'grep_search': return `Searched "${(args.query as string || '').slice(0, 35)}"`;
    case 'glob_search': return `Glob ${args.pattern || ''}`;
    case 'semantic_search': return `Searched codebase`;
    case 'run_command': return `Ran \`${(args.command as string || '').slice(0, 55)}\``;
    case 'read_lints': return `Lints ${args.path || ''}`;
    default: return tool.replace(/_/g, ' ');
  }
}

function formatToolArgs(tool: string, args: Record<string, unknown>): string {
  if (tool === 'run_command') return `$ ${args.command || ''}`;
  if (tool === 'edit_file') {
    const lines: string[] = [];
    if (args.path) lines.push(`file: ${args.path}`);
    if (args.old_string) lines.push(`find: ${(args.old_string as string).slice(0, 120)}...`);
    if (args.new_string) lines.push(`replace: ${(args.new_string as string).slice(0, 120)}...`);
    return lines.join('\n') || JSON.stringify(args, null, 2);
  }
  return JSON.stringify(args, null, 2);
}

function ToolCallRow({ tc, index, total }: { tc: ToolCallBlockType; index: number; total: number }) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = tc.status === 'running';
  const isDone = tc.status === 'done';
  const isError = tc.status === 'error';

  const label = getToolLabel(tc.tool, tc.args);
  const duration = tc.finishedAt && tc.startedAt
    ? `${((tc.finishedAt - tc.startedAt) / 1000).toFixed(1)}s`
    : null;

  return (
    <div style={{ borderLeft: `2px solid ${isError ? '#f85149' : isRunning ? '#569cd6' : isDone ? '#3fb950' : '#333'}`, marginLeft: 2, marginBottom: 1 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', padding: '3px 6px', textAlign: 'left',
          background: isRunning ? '#1a2030' : 'transparent',
          border: 'none', cursor: 'pointer',
          borderRadius: 2, transition: 'background 0.1s',
        }}
        onMouseEnter={e => { if (!isRunning) e.currentTarget.style.background = '#ffffff06'; }}
        onMouseLeave={e => { if (!isRunning) e.currentTarget.style.background = 'transparent'; }}
      >
        <ChevronIcon open={expanded} />
        <ToolIcon tool={tc.tool} />
        <span style={{ flex: 1, fontSize: 12, color: isError ? '#f85149' : isRunning ? '#9bb8e0' : isDone ? '#9d9d9d' : '#9d9d9d', fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        {isRunning && <SpinnerIcon size={11} />}
        {isDone && <CheckIcon size={11} />}
        {isError && <XIcon size={11} />}
        {duration && <span style={{ fontSize: 10, color: '#555', fontVariantNumeric: 'tabular-nums' }}>{duration}</span>}
      </button>

      {expanded && (
        <div style={{ margin: '2px 0 4px 18px', borderRadius: 3, overflow: 'hidden', border: '1px solid #2a2a2a', background: '#0d0d0d' }}>
          {tc.args && Object.keys(tc.args).length > 0 && (
            <div style={{ padding: '6px 10px', borderBottom: '1px solid #1e1e1e' }}>
              <pre style={{ fontSize: 11, color: '#6e6e6e', fontFamily: "'Cascadia Code', Consolas, monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5, margin: 0, userSelect: 'text', cursor: 'text' }}>
                {formatToolArgs(tc.tool, tc.args)}
              </pre>
            </div>
          )}
          {(tc.result || tc.error) && (
            <div style={{ padding: '6px 10px', maxHeight: 200, overflowY: 'auto' }}>
              <pre style={{ fontSize: 11, color: tc.error ? '#f85149' : '#6e6e6e', fontFamily: "'Cascadia Code', Consolas, monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5, margin: 0, userSelect: 'text', cursor: 'text' }}>
                {(tc.error || tc.result || '').slice(0, 3000)}
                {(tc.error || tc.result || '').length > 3000 && '\n[truncated...]'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══ CURSOR-STYLE TASK LIST ═══
   Parses a numbered/bulleted plan from AI text and renders as animated todo checklist.
   Items check off as tool calls complete.
*/
interface TaskItem {
  text: string;
  done: boolean;
  active: boolean;
}

function parsePlanItems(text: string): string[] {
  if (!text) return [];
  const lines = text.split('\n');
  const items: string[] = [];
  for (const line of lines) {
    // Match "1. text", "- text", "* text", "• text"
    const m = line.match(/^[\s]*(?:\d+[\.\)]\s+|\-\s+|\*\s+|•\s+)(.+)/);
    if (m) items.push(m[1].trim());
  }
  return items;
}

function extractPlanBlock(content: string): { plan: string[]; rest: string } {
  if (!content) return { plan: [], rest: content };
  // Look for a plan section: numbered/bulleted list of 2+ items at start or after a "plan:" header
  const lines = content.split('\n');
  const planLines: number[] = [];
  let inPlan = false;
  let planStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isPlanHeader = /^(plan|steps|i.ll|here.s what|going to|will:)/i.test(line.trim().replace(/[*_#]/g, ''));
    const isBullet = /^[\s]*(?:\d+[\.\)]\s+|\-\s+|\*\s+|•\s+)/.test(line);

    if (isPlanHeader) { inPlan = true; continue; }
    if (inPlan && isBullet) {
      if (planStart === -1) planStart = i;
      planLines.push(i);
    } else if (inPlan && planLines.length > 0 && line.trim() === '') {
      continue;
    } else if (planLines.length >= 2) {
      break;
    } else {
      inPlan = false;
      planLines.length = 0;
      planStart = -1;
    }
  }

  if (planLines.length >= 2) {
    const planText = planLines.map(i => lines[i]).join('\n');
    const plan = parsePlanItems(planText);
    const rest = lines.filter((_, i) => !planLines.includes(i)).join('\n').trim();
    return { plan, rest };
  }

  return { plan: [], rest: content };
}

function TaskList({ items, toolCalls, isStreaming }: { items: string[]; toolCalls: ToolCallBlockType[]; isStreaming?: boolean }) {
  const doneCount = toolCalls.filter(t => t.status === 'done').length;
  const activeIdx = toolCalls.findIndex(t => t.status === 'running');

  // Map plan items to done/active state based on tool call progress
  const taskItems: TaskItem[] = items.map((text, i) => ({
    text,
    done: i < Math.floor((doneCount / Math.max(toolCalls.length, 1)) * items.length),
    active: i === Math.floor((activeIdx / Math.max(toolCalls.length, 1)) * items.length),
  }));

  return (
    <div style={{ margin: '6px 0 8px 0', padding: '8px 10px', background: '#161616', borderRadius: 6, border: '1px solid #2a2a2a' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#569cd6', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Plan
        </span>
        <span style={{ fontSize: 10, color: '#555' }}>
          {doneCount}/{toolCalls.length} ops
        </span>
      </div>
      {taskItems.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '2px 0' }}>
          {/* Checkbox */}
          <div style={{
            width: 14, height: 14, marginTop: 1, borderRadius: 3, flexShrink: 0,
            border: `1.5px solid ${item.done ? '#3fb950' : item.active ? '#569cd6' : '#3c3c3c'}`,
            background: item.done ? '#3fb950' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
          }}>
            {item.done && (
              <svg width="9" height="9" viewBox="0 0 16 16" fill="white">
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
              </svg>
            )}
            {item.active && !item.done && (
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#569cd6', animation: 'pulse 1s infinite' }} />
            )}
          </div>
          <span style={{
            fontSize: 12, lineHeight: '1.4',
            color: item.done ? '#555' : item.active ? '#cccccc' : '#808080',
            textDecoration: item.done ? 'line-through' : 'none',
            transition: 'color 0.2s',
            userSelect: 'text', cursor: 'text',
          }}>
            {item.text}
          </span>
        </div>
      ))}
      {/* Progress bar */}
      {toolCalls.length > 0 && (
        <div style={{ marginTop: 8, height: 2, background: '#2a2a2a', borderRadius: 1 }}>
          <div style={{
            height: '100%', borderRadius: 1,
            background: isStreaming ? '#569cd6' : '#3fb950',
            width: `${(doneCount / toolCalls.length) * 100}%`,
            transition: 'width 0.3s ease',
          }} />
        </div>
      )}
    </div>
  );
}

/* ═══ CODE DIFF CARD ═══ */
function CodeDiffCard({ diff, onApply, onReject }: {
  diff: CodeDiffBlockType;
  onApply?: (diffId: string) => void;
  onReject?: (diffId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const statusColor = diff.status === 'applied' ? '#238636' : diff.status === 'rejected' ? '#f85149' : '#3c3c3c';
  return (
    <div style={{ margin: '4px 0', borderRadius: 4, overflow: 'hidden', borderLeft: `2px solid ${statusColor}` }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '3px 8px',
        background: diff.status === 'applied' ? '#0d1f12' : diff.status === 'rejected' ? '#1c0c0c' : '#1a1a1a',
      }}>
        <button onClick={() => setCollapsed(!collapsed)} style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, background: 'none', border: 'none', cursor: 'pointer', minWidth: 0 }}>
          <ChevronIcon open={!collapsed} />
          <ToolIcon tool="edit_file" />
          <span style={{ fontSize: 11, color: '#808080', fontFamily: "'Cascadia Code', Consolas, monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{diff.file}</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, marginLeft: 8 }}>
          {diff.status === 'pending' && (
            <>
              <button onClick={() => onApply?.(diff.id)} title="Accept" style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 3 }}
                onMouseEnter={e => e.currentTarget.style.background = '#238636cc'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <CheckIcon size={13} />
              </button>
              <button onClick={() => onReject?.(diff.id)} title="Reject" style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 3 }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8514933'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <XIcon size={13} />
              </button>
            </>
          )}
          {diff.status === 'applied' && <span style={{ fontSize: 10, color: '#3fb950', display: 'flex', alignItems: 'center', gap: 3 }}><CheckIcon size={10} /> Applied</span>}
          {diff.status === 'rejected' && <span style={{ fontSize: 10, color: '#f85149', display: 'flex', alignItems: 'center', gap: 3 }}><XIcon size={10} /> Rejected</span>}
        </div>
      </div>
      {!collapsed && (
        <pre style={{ padding: '8px 12px', overflowX: 'auto', fontSize: 11, lineHeight: 1.6, fontFamily: "'Cascadia Code', Consolas, monospace", color: '#d4d4d4', background: '#111', maxHeight: 240, overflowY: 'auto', margin: 0, userSelect: 'text', cursor: 'text' }}>
          <code style={{ userSelect: 'text' }}>{diff.code}</code>
        </pre>
      )}
    </div>
  );
}

/* ═══ CODE BLOCK ═══ */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 3, color: copied ? '#3fb950' : '#6e6e6e' }}
      onMouseEnter={e => e.currentTarget.style.background = '#ffffff15'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
      title="Copy"
    >
      {copied
        ? <CheckIcon size={11} color="#3fb950" />
        : <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"/></svg>
      }
    </button>
  );
}

function CodeBlock({ language, filename, children, onApply }: {
  language?: string; filename?: string; children: string;
  onApply?: (code: string, filename?: string) => void;
}) {
  const [applied, setApplied] = useState(false);
  const label = filename || language || 'code';
  return (
    <div style={{ margin: '6px 0', borderRadius: 5, overflow: 'hidden', background: '#0d0d0d', border: '1px solid #2a2a2a' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 8px 3px 10px', background: '#161616', borderBottom: '1px solid #2a2a2a' }}>
        <span style={{ fontSize: 11, color: '#6e6e6e', fontFamily: "'Cascadia Code', Consolas, monospace" }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <CopyButton text={children} />
          {onApply && !applied && (
            <button
              onClick={() => { onApply(children, filename); setApplied(true); }}
              style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 3, color: '#569cd6' }}
              onMouseEnter={e => e.currentTarget.style.background = '#569cd620'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
              title="Apply to editor"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm.75 4.75a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z"/></svg>
            </button>
          )}
          {applied && <span style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckIcon size={11} /></span>}
        </div>
      </div>
      <pre style={{ padding: '10px 12px', overflowX: 'auto', fontSize: 12, lineHeight: 1.6, fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace", color: '#d4d4d4', margin: 0, userSelect: 'text', cursor: 'text' }}>
        <code style={{ userSelect: 'text' }}>{children}</code>
      </pre>
    </div>
  );
}

/* ═══ THINKING SECTION ═══ */
function ThinkingSection({ thinking, thinkingTime, isStreaming }: {
  thinking: string; thinkingTime?: number; isStreaming?: boolean;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [wasStreaming, setWasStreaming] = useState(false);
  useEffect(() => {
    if (isStreaming) setWasStreaming(true);
    else if (wasStreaming && detailsRef.current) { detailsRef.current.open = false; setWasStreaming(false); }
  }, [isStreaming, wasStreaming]);
  const label = thinkingTime && thinkingTime > 0 ? `Thought for ${thinkingTime}s` : isStreaming ? 'Thinking...' : 'Thought';
  return (
    <details ref={detailsRef} open={!!isStreaming} style={{ marginBottom: 6 }}>
      <summary style={{ padding: '2px 0', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, listStyle: 'none', color: '#6e6e6e', userSelect: 'none' }}>
        <ChevronIcon open={false} />
        {isStreaming && <SpinnerIcon size={11} />}
        <span>{label}</span>
      </summary>
      <div style={{ marginLeft: 16, marginTop: 4, padding: '6px 10px', fontSize: 11, color: '#555', fontFamily: "'Cascadia Code', Consolas, monospace", whiteSpace: 'pre-wrap', lineHeight: 1.5, maxHeight: 200, overflowY: 'auto', borderRadius: 4, background: '#0d0d0d', border: '1px solid #1e1e1e', userSelect: 'text', cursor: 'text' }}>
        {thinking}
      </div>
    </details>
  );
}

/* ═══ MARKDOWN RENDERER ═══ */
function MarkdownContent({ content, onApplyCode }: {
  content: string; onApplyCode?: (code: string, filename?: string) => void;
}) {
  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    if (typeof window !== 'undefined' && (window as any).electronAPI?.shell?.openExternal) {
      (window as any).electronAPI.shell.openExternal(href);
    } else {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div style={{ userSelect: 'text', cursor: 'text' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeStr = String(children).replace(/\n$/, '');
            if (!className && !codeStr.includes('\n')) {
              return <code style={{ background: '#1a1a1a', color: '#ce9178', padding: '1px 4px', borderRadius: 3, fontSize: 11.5, fontFamily: "'Cascadia Code', Consolas, monospace", userSelect: 'text' }}>{children}</code>;
            }
            const lang = match?.[1] || '';
            const parts = lang.split(':');
            const language = parts[0];
            const filename = parts.length > 1 ? parts.slice(1).join(':') : undefined;
            return <CodeBlock language={language} filename={filename} onApply={onApplyCode}>{codeStr}</CodeBlock>;
          },
          pre({ children }) { return <>{children}</>; },
          p({ children }) { return <p style={{ marginBottom: 6, lineHeight: 1.55, userSelect: 'text' }}>{children}</p>; },
          ul({ children }) { return <ul style={{ marginBottom: 6, paddingLeft: 18, listStyleType: 'disc', userSelect: 'text' }}>{children}</ul>; },
          ol({ children }) { return <ol style={{ marginBottom: 6, paddingLeft: 18, listStyleType: 'decimal', userSelect: 'text' }}>{children}</ol>; },
          li({ children }) { return <li style={{ fontSize: 12.5, lineHeight: 1.55, marginBottom: 2, userSelect: 'text' }}>{children}</li>; },
          strong({ children }) { return <strong style={{ color: '#e0e0e0', fontWeight: 600 }}>{children}</strong>; },
          em({ children }) { return <em style={{ color: '#9d9d9d' }}>{children}</em>; },
          h1({ children }) { return <h1 style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0', marginBottom: 6, marginTop: 8 }}>{children}</h1>; },
          h2({ children }) { return <h2 style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0', marginBottom: 5, marginTop: 8 }}>{children}</h2>; },
          h3({ children }) { return <h3 style={{ fontSize: 12.5, fontWeight: 500, color: '#e0e0e0', marginBottom: 4, marginTop: 6 }}>{children}</h3>; },
          a({ children, href }) {
            return <a href={href || '#'} onClick={(e) => handleLinkClick(e, href || '')} style={{ color: '#569cd6', textDecoration: 'none', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>{children}</a>;
          },
          blockquote({ children }) { return <blockquote style={{ borderLeft: '2px solid #333', paddingLeft: 10, margin: '6px 0', color: '#6e6e6e' }}>{children}</blockquote>; },
          hr() { return <hr style={{ border: 'none', borderTop: '1px solid #2a2a2a', margin: '8px 0' }} />; },
          table({ children }) { return <table style={{ borderCollapse: 'collapse', width: '100%', margin: '6px 0', fontSize: 11 }}>{children}</table>; },
          th({ children }) { return <th style={{ border: '1px solid #2a2a2a', padding: '4px 8px', background: '#1a1a1a', textAlign: 'left', color: '#e0e0e0' }}>{children}</th>; },
          td({ children }) { return <td style={{ border: '1px solid #2a2a2a', padding: '4px 8px' }}>{children}</td>; },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/* ═══ MAIN COMPONENT ═══ */
export default function ChatMessage({
  role, content, thinking, thinkingTime, streaming,
  isError, retryMessage, activeModel, toolCalls, codeDiffs,
  onRetry, onApplyCode, onApplyDiff, onRejectDiff,
}: ChatMessageProps) {

  if (role === 'user') {
    return (
      <div style={{ marginBottom: 16, marginTop: 4 }}>
        <div style={{ fontSize: 12.5, color: '#e0e0e0', whiteSpace: 'pre-wrap', lineHeight: 1.55, userSelect: 'text', cursor: 'text' }}>
          {content}
        </div>
      </div>
    );
  }

  const isParallelMode = activeModel === 'titan-protocol-v2' || content?.includes('Titan Protocol v2');
  const hasToolCalls = toolCalls && toolCalls.length > 0;
  const hasCodeDiffs = codeDiffs && codeDiffs.length > 0;
  const hasContent = content && content.trim().length > 0;

  // Try to extract a plan block from the content
  const { plan, rest } = hasToolCalls && hasContent
    ? extractPlanBlock(content)
    : { plan: [], rest: content };

  const displayContent = plan.length > 0 ? rest : content;

  const doneCount = toolCalls?.filter(t => t.status === 'done').length ?? 0;
  const totalOps = toolCalls?.length ?? 0;
  const activeOp = toolCalls?.find(t => t.status === 'running');

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Titan Protocol v2 indicator */}
      {isParallelMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 4,
            fontSize: 10, fontWeight: 700, color: '#fff',
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            letterSpacing: '0.5px',
          }}>
            TITAN v2 PARALLEL
          </span>
          {streaming && (
            <span style={{ fontSize: 10, color: '#818cf8' }}>
              Orchestrating lanes...
            </span>
          )}
        </div>
      )}

      {/* Thinking */}
      {thinking && (
        <ThinkingSection thinking={thinking} thinkingTime={thinkingTime} isStreaming={streaming && !hasContent} />
      )}

      {/* ── Cursor-style plan/task list ── */}
      {plan.length > 0 && toolCalls && (
        <TaskList items={plan} toolCalls={toolCalls} isStreaming={streaming} />
      )}

      {/* ── Operation progress header (when running) ── */}
      {hasToolCalls && totalOps > 0 && !plan.length && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, padding: '2px 0' }}>
          {activeOp ? (
            <>
              <SpinnerIcon size={11} />
              <span style={{ fontSize: 11, color: '#569cd6' }}>Working... ({doneCount}/{totalOps})</span>
            </>
          ) : doneCount === totalOps ? (
            <>
              <CheckIcon size={11} />
              <span style={{ fontSize: 11, color: '#3fb950' }}>Completed {totalOps} operation{totalOps !== 1 ? 's' : ''}</span>
            </>
          ) : null}
        </div>
      )}

      {/* ── Tool call rows ── */}
      {hasToolCalls && (
        <div style={{ marginBottom: 6 }}>
          {toolCalls!.map((tc, i) => (
            <ToolCallRow key={tc.id} tc={tc} index={i} total={toolCalls!.length} />
          ))}
        </div>
      )}

      {/* ── Code diffs ── */}
      {hasCodeDiffs && (
        <div style={{ marginBottom: 6 }}>
          {codeDiffs!.map((diff) => (
            <CodeDiffCard key={diff.id} diff={diff} onApply={onApplyDiff} onReject={onRejectDiff} />
          ))}
        </div>
      )}

      {/* ── Text content ── */}
      {hasContent && displayContent && (
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: isError ? '#f85149' : '#c0c0c0', userSelect: 'text', cursor: 'text' }}>
          <MarkdownContent content={displayContent} onApplyCode={onApplyCode} />
        </div>
      )}

      {/* Streaming cursor */}
      {streaming && (
        <span style={{ display: 'inline-block', width: 2, height: 14, background: '#569cd6', animation: 'blink 1s step-start infinite', borderRadius: 1, verticalAlign: '-2px', marginLeft: 2 }}>
          <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
        </span>
      )}

      {/* Error retry */}
      {isError && retryMessage && onRetry && (
        <button
          onClick={() => onRetry(retryMessage)}
          style={{ marginTop: 6, padding: '3px 10px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 4, color: '#9d9d9d', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          onMouseEnter={e => e.currentTarget.style.background = '#222'}
          onMouseLeave={e => e.currentTarget.style.background = '#1a1a1a'}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>
          Retry
        </button>
      )}
    </div>
  );
}
