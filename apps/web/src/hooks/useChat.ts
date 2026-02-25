'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import type { Session, ChatMessage, ToolCallBlock, CodeDiffBlock, GeneratedImage, FileAttachment } from '@/types/ide';
import { parseThinkingTags, getLanguageFromFilename } from '@/utils/file-helpers';
import { useAgentTools, toolCallSummary } from './useAgentTools';
import { useParallelChat } from './useParallelChat';
import { useSupremeChat } from './useSupremeChat';
import { useOmegaChat } from './useOmegaChat';
import { usePhoenixChat } from './usePhoenixChat';
import { useTitanChat } from './useTitanChat';
import { useSniperChat } from './useSniperChat';
import { useFileStore } from '@/stores/file-store';
import { isElectron, electronAPI } from '@/lib/electron';
import { getCapabilities, requiresTools, type ToolsDisabledReason } from '@/lib/agent-capabilities';
import { ContextNavigator } from '@/lib/autonomy/context-navigator';
import { MemoryManager } from '@/lib/autonomy/memory-manager';
import { OmegaFluency } from '@/lib/autonomy/omega-fluency';
import { playBellSound } from '@/utils/notification-sound';

const MAX_TOOL_CALLS = 120;
const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_LOOP_ITERATIONS = 60;
const MAX_TOTAL_FAILURES = 12;
const MAX_HISTORY_ENTRIES = 100;
const MAX_TOOL_RESULT_LEN = 8000;
const TOKEN_BATCH_MS = 150;
const TOKEN_BUDGET_CHARS = 120000;

// Git status cache — re-fetching on every loop iteration is wasteful since
// the workspace rarely changes mid-conversation.
let gitStatusCacheValue: { branch?: string; modified?: string[]; untracked?: string[]; staged?: string[] } | undefined;
let gitStatusCacheTime = 0;
const GIT_STATUS_TTL_MS = 5000;

const TITAN_PLANNER = 'qwen3.5-plus-02-15';
const TITAN_TOOL_CALLER = 'deepseek-r1';
const TITAN_WORKER = 'qwen3-coder-next';
const TITAN_EXECUTOR = 'gemini-2.0-flash';
const TITAN_PROTOCOL_IDS = new Set(['titan-protocol', 'protocol-team']);
const CODE_WRITE_TOOLS = new Set(['edit_file', 'create_file']);

function getIterationModel(baseModel: string, iteration: number): string {
  if (!TITAN_PROTOCOL_IDS.has(baseModel)) return baseModel;
  if (baseModel === 'protocol-team') {
    if (iteration === 1) return TITAN_PLANNER;
    if (iteration % 4 === 0) return TITAN_TOOL_CALLER;
    if (iteration % 3 === 0) return TITAN_EXECUTOR;
    return TITAN_WORKER;
  }
  if (iteration === 1) return TITAN_PLANNER;
  return TITAN_TOOL_CALLER;
}

async function generateCodeWithQwen(
  tool: string,
  args: Record<string, unknown>,
  abortSignal: AbortSignal,
): Promise<Record<string, unknown>> {
  const filePath = args.path as string;
  let prompt: string;

  if (tool === 'edit_file') {
    prompt = `You are a code worker. Return ONLY the replacement code. No explanation, no markdown fences.

File: ${filePath}
Code to replace:
${args.old_string}

Reference replacement:
${args.new_string}

Return ONLY the raw replacement code:`;
  } else {
    prompt = `You are a code worker. Return ONLY the file content. No explanation, no markdown fences.

File: ${filePath}

Reference content:
${(args.content as string || '').slice(0, 6000)}

Return ONLY the raw file content:`;
  }

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortSignal,
      body: JSON.stringify({ message: prompt, model: TITAN_WORKER, stream: false }),
    });
    if (!res.ok) return args;
    const data = await res.json();
    let code = data.content || '';
    code = code.replace(/^```[\w]*\n?/, '').replace(/\n?```\s*$/, '').trim();
    if (!code || code.length < 5) return args;
    return tool === 'edit_file' ? { ...args, new_string: code } : { ...args, content: code };
  } catch {
    return args;
  }
}

interface TerminalHistoryEntry {
  command: string;
  output?: string;
  exitCode: number;
}

interface UseChatOptions {
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  activeSessionId: string;
  activeModel: string;
  activeTab: string;
  fileContents: Record<string, string>;
  editorInstance: any;
  onTerminalCommand?: (command: string, output: string, exitCode: number) => void;
  onFileEdited?: (path: string, newContent: string) => void;
  onFileCreated?: (path: string, content: string, absolutePath: string) => void;
  onFileDeleted?: (path: string) => void;
  workspacePath?: string;
  openTabs?: string[];
  terminalHistory?: TerminalHistoryEntry[];
  cursorPosition?: { line: number; column: number; file: string };
  linterDiagnostics?: Array<{ file: string; line: number; column: number; severity: string; message: string }>;
  recentlyEditedFiles?: Array<{ file: string; timestamp: number }>;
  recentlyViewedFiles?: string[];
  isDesktop?: boolean;
  osPlatform?: string;
  /** When tools are required but disabled, call before blocking send. */
  onNoToolsAvailable?: (reason: ToolsDisabledReason) => void;
}

interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

interface StreamToolCall {
  id: string;
  tool: string;
  args: Record<string, unknown>;
}

function compressConversationHistory(history: LLMMessage[]): LLMMessage[] {
  if (history.length <= MAX_HISTORY_ENTRIES) {
    return history.map(msg => {
      if (msg.role === 'tool' && msg.content && msg.content.length > MAX_TOOL_RESULT_LEN) {
        return { ...msg, content: msg.content.slice(0, MAX_TOOL_RESULT_LEN) + '\n[TRIMMED]' };
      }
      return msg;
    });
  }

  const recentCount = 12;
  const recent = history.slice(-recentCount);
  const older = history.slice(0, -recentCount).slice(-MAX_HISTORY_ENTRIES);

  const compressed = older.map(msg => {
    if (msg.role === 'tool' && msg.content && msg.content.length > 500) {
      const firstLines = msg.content.split('\n').slice(0, 3).join('\n').slice(0, 400);
      return { ...msg, content: `[Compressed] ${firstLines}...` };
    }
    if (msg.role === 'assistant' && msg.content && msg.content.length > 1000 && !msg.tool_calls?.length) {
      return { ...msg, content: msg.content.slice(0, 800) + '\n[TRIMMED]' };
    }
    return msg;
  });

  let totalChars = [...compressed, ...recent].reduce((sum, m) => sum + (m.content?.length || 0), 0);
  while (totalChars > TOKEN_BUDGET_CHARS && compressed.length > 0) {
    const dropped = compressed.shift();
    totalChars -= dropped?.content?.length || 0;
  }

  return [...compressed, ...recent];
}

export function useChat({
  sessions,
  setSessions,
  activeSessionId,
  activeModel,
  activeTab,
  fileContents,
  editorInstance,
  onTerminalCommand,
  onFileEdited,
  onFileCreated,
  onFileDeleted,
  workspacePath,
  openTabs,
  terminalHistory,
  cursorPosition,
  linterDiagnostics,
  recentlyEditedFiles,
  recentlyViewedFiles,
  isDesktop,
  osPlatform,
  onNoToolsAvailable,
}: UseChatOptions) {
  const [chatInput, setChatInput] = useState('');
  const chatInputRef = useRef('');
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const thinkingStartRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortedRef = useRef(false);

  const pendingContentRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeStreamRef = useRef<{ sessionId: string; messageId: string } | null>(null);
  const contextNavigatorRef = useRef(new ContextNavigator());
  const memoryManagerRef = useRef(new MemoryManager());
  const omegaFluencyRef = useRef(new OmegaFluency());

  const agentTools = useAgentTools({
    onTerminalCommand,
    onFileEdited,
    onFileCreated,
    onFileDeleted,
    workspacePath,
    onToolEvent: (tool, event) => {
      const active = activeStreamRef.current;
      if (!active) return;
      if (tool !== 'auto_debug') return;
      const eventId = `debug-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const text = JSON.stringify(event.payload).slice(0, 1200);
      appendToolCallToMessage(active.sessionId, active.messageId, {
        id: eventId,
        tool: `auto_debug:${event.type}`,
        args: {},
        status: 'done',
        result: text,
        startedAt: Date.now(),
        finishedAt: Date.now(),
      });
    },
  });

  const updateMessage = useCallback((
    sessionId: string,
    messageId: string,
    updater: (msg: ChatMessage) => ChatMessage
  ) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== sessionId) return s;
      return { ...s, messages: (s.messages || []).map(m => m.id === messageId ? updater(m) : m) };
    }));
  }, [setSessions]);

  const flushTokens = useCallback((sessionId: string, messageId: string) => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const content = pendingContentRef.current;
    if (!content) return;

    const { thinking, content: parsed } = parseThinkingTags(content);
    const thinkingTime = thinkingStartRef.current > 0
      ? Math.round((Date.now() - thinkingStartRef.current) / 1000)
      : 0;

    updateMessage(sessionId, messageId, (msg) => ({
      ...msg,
      content: parsed || content,
      thinking: thinking || msg.thinking,
      thinkingTime: thinking ? thinkingTime : msg.thinkingTime,
      streaming: true,
    }));
  }, [updateMessage]);

  const appendToolCallToMessage = useCallback((
    sessionId: string,
    messageId: string,
    toolCall: ToolCallBlock
  ) => {
    updateMessage(sessionId, messageId, (msg) => ({
      ...msg,
      toolCalls: [...(msg.toolCalls || []), toolCall],
    }));
  }, [updateMessage]);

  const updateToolCallInMessage = useCallback((
    sessionId: string,
    messageId: string,
    toolCallId: string,
    updates: Partial<ToolCallBlock>
  ) => {
    updateMessage(sessionId, messageId, (msg) => ({
      ...msg,
      toolCalls: (msg.toolCalls || []).map(tc =>
        tc.id === toolCallId ? { ...tc, ...updates } : tc
      ),
    }));
  }, [updateMessage]);

  const appendCodeDiffToMessage = useCallback((
    sessionId: string,
    messageId: string,
    diff: CodeDiffBlock
  ) => {
    updateMessage(sessionId, messageId, (msg) => ({
      ...msg,
      codeDiffs: [...(msg.codeDiffs || []), diff],
    }));
  }, [updateMessage]);

  const appendGeneratedImageToMessage = useCallback((
    sessionId: string,
    messageId: string,
    image: GeneratedImage
  ) => {
    updateMessage(sessionId, messageId, (msg) => ({
      ...msg,
      generatedImages: [...(msg.generatedImages || []), image],
    }));
  }, [updateMessage]);

  // Subscribe only to fileTree so we can memoize the serialized string.
  // This avoids walking the entire tree on every chat send when files haven't changed.
  const fileTree = useFileStore(s => s.fileTree);
  const serializedFileTree = useMemo(() => {
    try {
      if (!fileTree || fileTree.length === 0) return '';
      const lines: string[] = [];
      function walk(nodes: typeof fileTree, depth = 0) {
        for (const n of nodes) {
          const indent = '  '.repeat(depth);
          lines.push(`${indent}${n.type === 'folder' ? n.name + '/' : n.name}`);
          if (n.children && depth < 3) walk(n.children, depth + 1);
        }
      }
      walk(fileTree);
      return lines.slice(0, 200).join('\n');
    } catch { return ''; }
  }, [fileTree]);

  function serializeFileTree(): string { return serializedFileTree; }

  const addAttachments = useCallback((files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const newAttachments: FileAttachment[] = imageFiles.map(file => ({
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      mediaType: file.type,
      status: 'pending' as const,
    }));

    for (const att of newAttachments) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setAttachments(prev => prev.map(a =>
          a.id === att.id ? { ...a, base64, status: 'ready' as const } : a
        ));
      };
      reader.onerror = () => {
        setAttachments(prev => prev.map(a =>
          a.id === att.id ? { ...a, status: 'error' as const } : a
        ));
      };
      reader.readAsDataURL(att.file);
    }

    setAttachments(prev => [...prev, ...newAttachments]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const att = prev.find(a => a.id === id);
      if (att) URL.revokeObjectURL(att.previewUrl);
      return prev.filter(a => a.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments(prev => {
      prev.forEach(a => URL.revokeObjectURL(a.previewUrl));
      return [];
    });
  }, []);

  async function fetchGitStatus(): Promise<{ branch?: string; modified?: string[]; untracked?: string[]; staged?: string[] } | undefined> {
    // Return cached result if fresh enough (5-second TTL)
    if (gitStatusCacheValue && (Date.now() - gitStatusCacheTime) < GIT_STATUS_TTL_MS) {
      return gitStatusCacheValue;
    }
    try {
      const wsPath = workspacePath || useFileStore.getState().workspacePath || '';

      if (isElectron && electronAPI && wsPath) {
        const status = await electronAPI.git.status(wsPath);
        const modified: string[] = [];
        const staged: string[] = [];
        const untracked: string[] = [];
        for (const f of status.files) {
          if (f.index === 'M' || f.index === 'A' || f.index === 'R') staged.push(f.path);
          if (f.working_dir === 'M') modified.push(f.path);
          if (f.index === '?' && f.working_dir === '?') untracked.push(f.path);
        }
        const result = { branch: status.current || undefined, modified, untracked, staged };
        gitStatusCacheValue = result;
        gitStatusCacheTime = Date.now();
        return result;
      }

      const isServerPath = wsPath.startsWith('/') || /^[A-Z]:\\/i.test(wsPath);
      const url = isServerPath && wsPath
        ? `/api/git/status?path=${encodeURIComponent(wsPath)}`
        : '/api/git/status';

      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) });
      if (!res.ok) return undefined;
      const data = await res.json();
      if (!data.isRepo) return undefined;
      const result = {
        branch: data.branch || data.current,
        modified: data.modified || [],
        untracked: data.untracked || data.not_added || [],
        staged: data.staged || [],
      };
      gitStatusCacheValue = result;
      gitStatusCacheTime = Date.now();
      return result;
    } catch { return undefined; }
  }

  async function streamFromContinue(
    conversationHistory: LLMMessage[],
    sessionId: string,
    messageId: string,
    abortSignal: AbortSignal,
    messageAttachments?: { mediaType: string; base64: string }[],
    modelOverride?: string,
    titanProtocolMode?: boolean,
    forgeId?: string,
    isFirstIteration = true,
  ): Promise<{ content: string; toolCalls: StreamToolCall[] }> {
    const wsPath = workspacePath || useFileStore.getState().workspacePath || '';

    // Only fetch expensive context on the first iteration of a task.
    // On subsequent iterations Titan already has this context in the conversation history.
    const gitStatus = isFirstIteration ? await fetchGitStatus() : undefined;
    const fileTree = isFirstIteration ? serializeFileTree() : undefined;
    const lastUserMessage = [...conversationHistory].reverse().find((m) => m.role === 'user' && typeof m.content === 'string');
    const navigationPlan = isFirstIteration && lastUserMessage?.content
      ? contextNavigatorRef.current.resolveTarget(lastUserMessage.content, {
          openTabs,
          recentlyEditedFiles,
          recentlyViewedFiles,
          workspacePath: wsPath,
        })
      : undefined;
    const omegaContext = isFirstIteration && titanProtocolMode && lastUserMessage?.content
      ? {
          workOrders: omegaFluencyRef.current.decomposeToWorkOrders(lastUserMessage.content, {
            workspacePath: wsPath,
            openTabs,
            fileTree: fileTree ?? '',
            recentlyEditedFiles,
          }),
        }
      : undefined;

    const compressedHistory = compressConversationHistory(conversationHistory);
    const caps = getCapabilities(workspacePath);

    const response = await fetch('/api/chat/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortSignal,
      body: JSON.stringify({
        messages: compressedHistory,
        model: modelOverride || activeModel,
        titanProtocol: !!titanProtocolMode,
        attachments: messageAttachments,
        // Heavy context: only on first iteration, already in history for subsequent ones
        codeContext: isFirstIteration ? {
          file: activeTab,
          content: (editorInstance?.getValue() || fileContents[activeTab] || '').slice(0, 8000),
          language: getLanguageFromFilename(activeTab),
        } : undefined,
        repoMap: isFirstIteration && typeof window !== 'undefined' ? (window as any).__titanRepoMap : undefined,
        workspacePath: wsPath,
        openTabs: isFirstIteration ? (openTabs || []) : undefined,
        fileTree,
        gitStatus,
        terminalHistory: isFirstIteration ? (terminalHistory?.slice(-5) || []) : undefined,
        cursorPosition: isFirstIteration ? (cursorPosition || undefined) : undefined,
        linterDiagnostics: isFirstIteration ? (linterDiagnostics?.slice(0, 10) || []) : undefined,
        recentlyEditedFiles: isFirstIteration ? (recentlyEditedFiles?.slice(0, 10) || []) : undefined,
        recentlyViewedFiles: isFirstIteration ? (recentlyViewedFiles?.slice(0, 10) || []) : undefined,
        navigationHints: navigationPlan,
        omegaContext,
        isDesktop: isDesktop || false,
        osPlatform: osPlatform || 'unknown',
        capabilities: { runtime: caps.runtime, workspaceOpen: caps.workspaceOpen, toolsEnabled: caps.toolsEnabled, reasonIfDisabled: caps.reasonIfDisabled },
        sessionId,
        forgeId,
      }),
    });

    if (!response.ok) {
      let errDetail = '';
      try {
        const errBody = await response.json();
        errDetail = errBody?.error || errBody?.message || '';
      } catch { /* response not JSON */ }
      throw new Error(errDetail || `LLM request failed (${response.status})`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let toolCalls: StreamToolCall[] = [];

    pendingContentRef.current = '';

    while (true) {
      if (abortedRef.current || abortSignal.aborted) {
        try { reader.cancel(); } catch {}
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const evt of events) {
        const lines = evt.split('\n');
        let eventType = 'message';
        let data = '';

        for (const line of lines) {
          if (line.startsWith('event:')) eventType = line.slice(6).trim();
          if (line.startsWith('data:')) data += line.slice(5).trim();
        }

        if (!data) continue;

        try {
          const payload = JSON.parse(data);

          if (eventType === 'start') {
            setIsThinking(false);
            setIsStreaming(true);
          } else if (eventType === 'token' && payload.content) {
            fullContent += payload.content;
            pendingContentRef.current = fullContent;

            if (!flushTimerRef.current) {
              flushTimerRef.current = setTimeout(() => {
                flushTimerRef.current = null;
                flushTokens(sessionId, messageId);
              }, TOKEN_BATCH_MS);
            }
          } else if (eventType === 'tool_call') {
            toolCalls.push({
              id: payload.id,
              tool: payload.tool,
              args: payload.args,
            });
          } else if (eventType === 'done') {
            if (flushTimerRef.current) {
              clearTimeout(flushTimerRef.current);
              flushTimerRef.current = null;
            }
            if (payload.content !== undefined && payload.content) {
              fullContent = payload.content;
            }
            if (payload.toolCalls?.length) {
              toolCalls = payload.toolCalls;
            }
            const { thinking, content } = parseThinkingTags(fullContent);
            updateMessage(sessionId, messageId, (msg) => ({
              ...msg,
              content: content || fullContent,
              thinking: thinking || msg.thinking,
              streaming: false,
            }));
          } else if (eventType === 'error') {
            throw new Error(payload.message || 'Streaming error');
          }
        } catch (e) {
          if (e instanceof Error && e.message !== 'Streaming error') {
            // skip malformed JSON chunks
          } else {
            throw e;
          }
        }
      }
    }

    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    flushTokens(sessionId, messageId);

    return { content: fullContent, toolCalls };
  }

  const handleSend = useCallback(async () => {
    if (!chatInputRef.current.trim() && (!attachments || attachments.length === 0)) return;
    const msg = chatInputRef.current.trim();
    const caps = getCapabilities(workspacePath);
    if (requiresTools(msg) && !caps.toolsEnabled) {
      onNoToolsAvailable?.(caps.reasonIfDisabled ?? 'NO_WORKSPACE');
      return;
    }
    setChatInput('');
    chatInputRef.current = '';
    abortedRef.current = false;
    agentTools.reset();

    // Collect ready attachments before clearing
    const readyAttachments = attachments
      .filter(a => a.status === 'ready' && a.base64)
      .map(a => ({ mediaType: a.mediaType, base64: a.base64! }));
    clearAttachments();

    const sessionId = activeSessionId;
    const streamMessageId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeStreamRef.current = { sessionId, messageId: streamMessageId };
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const currentCode = editorInstance?.getValue() || fileContents[activeTab] || '';
    const selection = editorInstance?.getSelection();
    const selectedText = selection ? editorInstance?.getModel()?.getValueInRange(selection) : '';
    const currentLanguage = getLanguageFromFilename(activeTab);

    let memoryPrefix = '';
    if (memoryManagerRef.current.shouldReadMemory(msg)) {
      const memory = await agentTools.executeToolCall('memory_read', {});
      if (memory.success && memory.output) {
        memoryPrefix = `[Architectural Memory]\n${memory.output.slice(0, 6000)}\n\n`;
      }
    }

    const userContent = selectedText
      ? `[Selected Code]\n\`\`\`${currentLanguage}\n${selectedText}\n\`\`\`\n\n${msg}`
      : msg;
    const finalUserContent = memoryPrefix + userContent;

    const userMessage: ChatMessage = {
      role: 'user',
      content: finalUserContent,
      attachments: readyAttachments.length > 0 ? readyAttachments : undefined,
      time: 'just now',
    };

    const assistantMessage: ChatMessage = {
      id: streamMessageId,
      role: 'assistant',
      content: '',
      time: 'just now',
      streaming: true,
      streamingModel: activeModel,
      toolCalls: [],
      codeDiffs: [],
    };

    setSessions(prev => prev.map(s =>
      s.id === sessionId
        ? { ...s, messages: [...(s.messages || []), userMessage, assistantMessage] }
        : s
    ));
    // Forge: report user message as an acceptance/rejection signal for the previous turn
    const forgePrevSampleId = (window as Window & { __forgePrevSampleId?: string }).__forgePrevSampleId;
    const forgePrevTurnMs = (window as Window & { __forgePrevTurnMs?: number }).__forgePrevTurnMs || 0;
    if (forgePrevSampleId) {
      try {
        const forgePkg = '@titan' + '/forge';
        const { forgeSignals } = await import(/* webpackIgnore: true */ forgePkg);
        forgeSignals.reportUserMessage({
          sampleId: forgePrevSampleId,
          message: msg,
          timeSinceTurnMs: Date.now() - forgePrevTurnMs,
        });
      } catch { /* best-effort */ }
    }
    const forgeTurnStartMs = Date.now();

    setIsThinking(true);
    thinkingStartRef.current = Date.now();

    const conversationHistory: LLMMessage[] = [
      { role: 'user', content: finalUserContent },
    ];

    let totalToolCalls = 0;
    let consecutiveFailures = 0;
    let totalFailures = 0;
    let loopIterations = 0;
    let taskCompletedSuccessfully = false;
    let productiveCallsMade = 0;
    let nudgesUsed = 0;
    const MAX_NUDGES = 2;
    const PRODUCTIVE_TOOLS = new Set(['edit_file', 'create_file', 'delete_file', 'run_command', 'auto_debug', 'git_commit', 'git_sync', 'git_branch', 'memory_write']);
    // Forge: pre-generate the sample ID so signals can reference it immediately,
    // even before the async DB insert in route.ts completes.
    const forgeSampleId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `forge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const isTitanProtocol = TITAN_PROTOCOL_IDS.has(activeModel);
    const touchedFiles = new Set<string>();

    try {
      while (true) {
        if (abortedRef.current || controller.signal.aborted) break;

        loopIterations++;
        if (loopIterations > MAX_LOOP_ITERATIONS) {
          updateMessage(sessionId, streamMessageId, (m) => ({
            ...m,
            content: (m.content ? m.content + '\n\n' : '') + `Stopped after ${MAX_LOOP_ITERATIONS} turns.`,
            streaming: false,
          }));
          break;
        }

        setIsStreaming(true);

        const iterationModel = isTitanProtocol
          ? getIterationModel(activeModel, loopIterations)
          : undefined;

        let streamResult: { content: string; toolCalls: StreamToolCall[] };
        try {
          streamResult = await streamFromContinue(
            conversationHistory,
            sessionId,
            streamMessageId,
            controller.signal,
            loopIterations === 1 ? readyAttachments : undefined,
            iterationModel,
            isTitanProtocol,
            loopIterations === 1 ? forgeSampleId : undefined,
            loopIterations === 1,
          );
        } catch (err) {
          if (abortedRef.current || controller.signal.aborted) break;
          throw err;
        }

        if (abortedRef.current || controller.signal.aborted) break;

        const { content, toolCalls } = streamResult;

        if (toolCalls.length === 0) {
          const contentIsEmpty = !content || content.trim().length < 30 || /^(done\.?|okay\.?|got it\.?|understood\.?|i see\.?)$/i.test(content.trim());
          const actionPatterns = /\b(I'll|I will|Let me|I would|I can|I should|we can|we should|here's what|I'd)\b.*\b(create|edit|read|run|install|write|fix|modify|update|add|remove|delete|build|open|check)\b/i;

          // Nudge 1: Agent described actions but called zero tools
          if (totalToolCalls === 0 && actionPatterns.test(content) && content.length < 2000 && nudgesUsed < MAX_NUDGES) {
            conversationHistory.push({ role: 'assistant', content });
            conversationHistory.push({
              role: 'user',
              content: 'You described what you would do but did not call any tools. Stop describing and actually do it. Call the appropriate tools now.',
            });
            nudgesUsed++;
            updateMessage(sessionId, streamMessageId, (m) => ({ ...m, streaming: true }));
            continue;
          }

          // Nudge 2: Agent only explored (read/list/search) but never took productive action
          if (totalToolCalls > 0 && productiveCallsMade === 0 && contentIsEmpty && nudgesUsed < MAX_NUDGES) {
            conversationHistory.push({ role: 'assistant', content: content || '' });
            conversationHistory.push({
              role: 'user',
              content: 'You explored the codebase but took no action. The user expects you to make changes, run commands, or build something based on their request. Do NOT just say "Done" -- execute the appropriate tools now to complete the task. If the task only required information, provide a thorough answer based on what you found.',
            });
            nudgesUsed++;
            updateMessage(sessionId, streamMessageId, (m) => ({ ...m, streaming: true }));
            continue;
          }

          // Nudge 3: Agent did productive work but returned empty/minimal response
          if (productiveCallsMade > 0 && contentIsEmpty && nudgesUsed < MAX_NUDGES) {
            conversationHistory.push({ role: 'assistant', content: content || '' });
            conversationHistory.push({
              role: 'user',
              content: 'You made changes but did not provide a summary. Briefly describe what you did and verify the changes work by running a build or test command.',
            });
            nudgesUsed++;
            updateMessage(sessionId, streamMessageId, (m) => ({ ...m, streaming: true }));
            continue;
          }

          updateMessage(sessionId, streamMessageId, (m) => ({
            ...m,
            streaming: false,
            content: m.content || content || (productiveCallsMade > 0 ? 'Changes applied.' : 'No actionable changes were needed.'),
          }));
          taskCompletedSuccessfully = true;
          // Forge: finalize quality scoring for this turn, store ID for next message
          if (forgeSampleId) {
            try {
              const forgePkg = '@titan' + '/forge';
              const { forgeSignals } = await import(/* webpackIgnore: true */ forgePkg);
              forgeSignals.finalizeSample(forgeSampleId, { model_id: activeModel }).catch(() => {});
              (window as Window & { __forgePrevSampleId?: string; __forgePrevTurnMs?: number }).__forgePrevSampleId = forgeSampleId;
              (window as Window & { __forgePrevSampleId?: string; __forgePrevTurnMs?: number }).__forgePrevTurnMs = Date.now();
            } catch { /* best-effort */ }
          }
          break;
        }

        conversationHistory.push({
          role: 'assistant',
          content: content || null,
          tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.tool, arguments: JSON.stringify(tc.args) },
          })),
        });

        const readOnlyTools = new Set(['read_file', 'list_directory', 'grep_search', 'glob_search', 'semantic_search']);
        const allReadOnly = toolCalls.every(tc => readOnlyTools.has(tc.tool));

        async function executeSingleTool(tc: StreamToolCall) {
          if (abortedRef.current || controller.signal.aborted) return null;
          totalToolCalls++;
          if (totalToolCalls > MAX_TOOL_CALLS) return 'circuit_break';

          let finalArgs = tc.args;
          if (isTitanProtocol && CODE_WRITE_TOOLS.has(tc.tool)) {
            finalArgs = await generateCodeWithQwen(tc.tool, tc.args, controller.signal);
          }

          const toolCallBlock: ToolCallBlock = {
            id: tc.id,
            tool: tc.tool,
            args: finalArgs,
            status: 'running',
            startedAt: Date.now(),
          };
          appendToolCallToMessage(sessionId, streamMessageId, toolCallBlock);

          const result = await agentTools.executeToolCall(tc.tool, finalArgs);

          updateToolCallInMessage(sessionId, streamMessageId, tc.id, {
            status: result.success ? 'done' : 'error',
            result: result.output?.slice(0, 3000),
            error: result.error,
            finishedAt: Date.now(),
            retryAttempts: result.meta?.retryAttempts as number | undefined,
            parsedErrors: (result.metadata?.parsedOutput as { errors?: Array<{
              filePath: string | null;
              line: number | null;
              column: number | null;
              errorType: string | null;
              message: string;
            }> } | undefined)?.errors?.slice(0, 5),
            metadata: result.metadata,
          });

          if (PRODUCTIVE_TOOLS.has(tc.tool) && result.success) {
            productiveCallsMade++;
          }

          // Titan Forge: report tool outcome signals for quality scoring
          if (forgeSampleId) {
            try {
              const forgePkg = '@titan' + '/forge';
              const { forgeSignals } = await import(/* webpackIgnore: true */ forgePkg);
              if (tc.tool === 'run_command') {
                const exitCode = Number(result.metadata?.exitCode ?? (result.success ? 0 : 1));
                forgeSignals.reportRunCommand({ sampleId: forgeSampleId, command: String(finalArgs.command || ''), exitCode });
              } else if (tc.tool === 'read_lints') {
                const diags = (result.metadata?.diagnostics as unknown[]) || [];
                forgeSignals.reportLintResult({ sampleId: forgeSampleId, errorCount: diags.length });
              } else if (tc.tool === 'git_commit') {
                forgeSignals.reportGitCommit({ sampleId: forgeSampleId, success: result.success });
              } else if (tc.tool === 'git_restore_checkpoint') {
                forgeSignals.reportCheckpointRestore({ sampleId: forgeSampleId });
              } else if (tc.tool === 'auto_debug') {
                const loopResult = result.metadata?.loopResult as { resolved?: boolean } | undefined;
                if (loopResult) forgeSignals.reportDebugResult({ sampleId: forgeSampleId, resolved: Boolean(loopResult.resolved) });
              }
              // Hallucination detection: tool call to a path that doesn't exist
              if ((tc.tool === 'edit_file' || tc.tool === 'read_file') && !result.success) {
                const errMsg = result.error || result.output || '';
                if (errMsg.includes('not found') || errMsg.includes('ENOENT') || errMsg.includes('does not exist')) {
                  forgeSignals.reportToolHallucination({ sampleId: forgeSampleId, path: String(finalArgs.path || '') });
                }
              }
            } catch {
              // Forge signal reporting is best-effort
            }
          }

          if (typeof finalArgs.path === 'string' && finalArgs.path.trim().length > 0) {
            touchedFiles.add(finalArgs.path);
          }
          const affectedFiles = result.metadata?.affectedFiles as string[] | undefined;
          if (Array.isArray(affectedFiles)) {
            for (const file of affectedFiles) touchedFiles.add(file);
          }

          if (!result.success) {
            consecutiveFailures++;
            totalFailures++;
          } else {
            consecutiveFailures = 0;
          }

          if (tc.tool === 'edit_file' && result.success) {
            const newContent = result.metadata?.newContent as string || finalArgs.new_string as string;
            appendCodeDiffToMessage(sessionId, streamMessageId, {
              id: `diff-${tc.id}`,
              file: finalArgs.path as string,
              code: newContent,
              status: 'applied',
            });
          } else if (tc.tool === 'create_file' && result.success) {
            appendCodeDiffToMessage(sessionId, streamMessageId, {
              id: `diff-${tc.id}`,
              file: finalArgs.path as string,
              code: finalArgs.content as string,
              status: 'applied',
            });
          } else if (tc.tool === 'generate_image' && result.success && result.metadata?.b64_json) {
            appendGeneratedImageToMessage(sessionId, streamMessageId, {
              id: `img-${tc.id}`,
              prompt: result.metadata.prompt as string || tc.args.prompt as string,
              revisedPrompt: result.metadata.revised_prompt as string || '',
              b64: result.metadata.b64_json as string,
              size: result.metadata.size as string || '1024x1024',
            });
          }

          const resultOutput = result.success
            ? result.output
            : `TOOL FAILED: ${result.error || 'Unknown error'}\n${result.output || ''}`;

          return { tc, resultOutput };
        }

        let hitCircuitBreaker = false;

        if (allReadOnly && toolCalls.length > 1) {
          const results = await Promise.all(toolCalls.map(executeSingleTool));
          for (const r of results) {
            if (r === 'circuit_break') { hitCircuitBreaker = true; break; }
            if (r && typeof r === 'object') {
              const capped = r.resultOutput.slice(0, MAX_TOOL_RESULT_LEN);
              const wasTruncated = r.resultOutput.length > MAX_TOOL_RESULT_LEN;
              conversationHistory.push({
                role: 'tool',
                content: capped + (wasTruncated ? '\n[OUTPUT TRUNCATED]' : ''),
                tool_call_id: r.tc.id,
                name: r.tc.tool,
              });
            }
          }
        } else {
          for (const tc of toolCalls) {
            if (abortedRef.current || controller.signal.aborted) break;
            const r = await executeSingleTool(tc);
            if (r === 'circuit_break') { hitCircuitBreaker = true; break; }
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES || totalFailures >= MAX_TOTAL_FAILURES) {
              hitCircuitBreaker = true;
              break;
            }
            if (r && typeof r === 'object') {
              const capped = r.resultOutput.slice(0, MAX_TOOL_RESULT_LEN);
              const wasTruncated = r.resultOutput.length > MAX_TOOL_RESULT_LEN;
              conversationHistory.push({
                role: 'tool',
                content: capped + (wasTruncated ? '\n[OUTPUT TRUNCATED]' : ''),
                tool_call_id: r.tc.id,
                name: r.tc.tool,
              });
            }
          }
        }

        if (hitCircuitBreaker || consecutiveFailures >= MAX_CONSECUTIVE_FAILURES || totalFailures >= MAX_TOTAL_FAILURES) {
          const reason = totalToolCalls > MAX_TOOL_CALLS
            ? `${MAX_TOOL_CALLS} tool calls`
            : consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
              ? `${MAX_CONSECUTIVE_FAILURES} consecutive failures`
              : `${totalFailures} total failures`;
          updateMessage(sessionId, streamMessageId, (m) => ({
            ...m,
            content: (m.content ? m.content + '\n\n' : '') + `Circuit breaker: ${reason}. Stopped.`,
            streaming: false,
          }));
          break;
        }

        if (abortedRef.current || controller.signal.aborted) {
          updateMessage(sessionId, streamMessageId, (m) => ({
            ...m,
            content: m.content || 'Generation stopped.',
            streaming: false,
          }));
          break;
        }

        updateMessage(sessionId, streamMessageId, (m) => ({ ...m, streaming: true }));
      }

      const shouldWriteMemory = taskCompletedSuccessfully
        && /architecture|decision|adr|chose|chosen|rationale|protocol|refactor|migrate|deploy|setup|config|build|fix|implement|create|design|plan|feature|engine|module|upgrade|switch|change|update|improve|integrate/i.test(msg)
        && !abortedRef.current
        && !controller.signal.aborted;
      if (shouldWriteMemory) {
        const touchedSummary = Array.from(touchedFiles).slice(0, 8);
        const decision = touchedSummary.length > 0
          ? `Architectural change: ${msg.slice(0, 80)} [files: ${touchedSummary.join(', ')}]`
          : `Architectural change: ${msg.slice(0, 100)}`;
        const memoryWrite = await agentTools.executeToolCall('memory_write', {
          decision,
          rationale: 'Autonomous completion updated as part of persistent memory workflow.',
          taskId: `CHAT-${Date.now()}`,
          status: 'ACTIVE',
          references: activeTab || undefined,
        });
        if (!memoryWrite.success) {
          console.warn('Memory auto-write failed:', memoryWrite.error || memoryWrite.output);
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        updateMessage(sessionId, streamMessageId, (m) => ({
          ...m,
          content: m.content || 'Generation stopped.',
          streaming: false,
        }));
        return;
      }

      console.error('Chat error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const is401 = errorMessage.includes('401') || errorMessage.toLowerCase().includes('user not found');
      const troubleshooting = is401
        ? `- Your OpenRouter API key is invalid or expired\n- Go to https://openrouter.ai/keys and create a new key\n- Update OPENROUTER_API_KEY in your environment\n- Make sure your OpenRouter account has credits`
        : `- Check your internet connection\n- Verify API keys are configured\n- Try a different model`;

      updateMessage(sessionId, streamMessageId, (m) => ({
        ...m,
        content: `**Error:** ${errorMessage}\n\n${troubleshooting}`,
        streaming: false,
        isError: true,
        retryMessage: msg,
      }));
    } finally {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      const wasAborted = abortedRef.current;
      setIsThinking(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
      activeStreamRef.current = null;

      if (!wasAborted) {
        playBellSound(0.6);
      }
    }
  }, [
    editorInstance, activeTab, fileContents, activeSessionId, activeModel, attachments, clearAttachments,
    setSessions, updateMessage, appendToolCallToMessage, updateToolCallInMessage,
    appendCodeDiffToMessage, appendGeneratedImageToMessage, agentTools, flushTokens, workspacePath, openTabs, terminalHistory,
    cursorPosition, linterDiagnostics, recentlyEditedFiles, recentlyViewedFiles, isDesktop, osPlatform, onNoToolsAvailable,
  ]);

  const handleStop = useCallback(() => {
    abortedRef.current = true;
    agentTools.abort();

    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setIsThinking(false);
    setIsStreaming(false);

    setSessions(prev => prev.map(s => ({
      ...s,
      messages: (s.messages || []).map(m =>
        m.streaming ? { ...m, streaming: false, content: m.content || 'Stopped.' } : m
      ),
    })));
  }, [agentTools, setSessions]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Titan Protocol v2 (Parallel) mode delegation
  const parallelChat = useParallelChat({
    sessions,
    setSessions,
    activeSessionId,
    activeTab,
    fileContents,
    workspacePath,
    openTabs,
    isDesktop,
    osPlatform,
  });

  const supremeChat = useSupremeChat({
    sessions,
    setSessions,
    activeSessionId,
    workspacePath,
    openTabs,
    isDesktop,
    osPlatform,
  });

  const omegaChat = useOmegaChat({
    sessions,
    setSessions,
    activeSessionId,
    workspacePath,
    openTabs,
    isDesktop,
    osPlatform,
  });

  const phoenixChat = usePhoenixChat({
    sessions,
    setSessions,
    activeSessionId,
    workspacePath,
    openTabs,
    isDesktop,
    osPlatform,
  });

  const titanChat = useTitanChat({
    sessions,
    setSessions,
    activeSessionId,
  });

  const sniperChat = useSniperChat({
    sessions,
    setSessions,
    activeSessionId,
    workspacePath,
    openTabs,
  });

  const setChatInputWithRef = useCallback((v: string | ((prev: string) => string)) => {
    setChatInput(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      chatInputRef.current = next;
      return next;
    });
  }, []);

  const isPhoenixMode = activeModel === 'titan-phoenix-protocol';
  const isParallelMode = activeModel === 'titan-protocol-v2';
  const isSupremeMode = activeModel === 'titan-supreme-protocol';
  const isOmegaMode = activeModel === 'titan-omega-protocol';
  const isTitanChatMode = activeModel === 'titan-chat';
  const isSniperMode = activeModel === 'titan-plan-sniper';

  const sharedProps = {
    attachments: attachments || [],
    addAttachments: addAttachments || (() => {}),
    removeAttachment: removeAttachment || (() => {}),
    clearAttachments: clearAttachments || (() => {}),
    capabilities: getCapabilities(workspacePath),
    lastToolResult: agentTools.lastResult ?? null,
  };

  if (isPhoenixMode) {
    return {
      chatInput: phoenixChat.chatInput,
      setChatInput: phoenixChat.setChatInput,
      isThinking: phoenixChat.isThinking,
      isStreaming: phoenixChat.isStreaming,
      handleSend: phoenixChat.handleSend,
      handleStop: phoenixChat.handleStop,
      handleKeyDown: phoenixChat.handleKeyDown,
      ...sharedProps,
    };
  }

  if (isParallelMode) {
    return {
      chatInput: parallelChat.chatInput,
      setChatInput: parallelChat.setChatInput,
      isThinking: parallelChat.isThinking,
      isStreaming: parallelChat.isStreaming,
      handleSend: parallelChat.handleSend,
      handleStop: parallelChat.handleStop,
      handleKeyDown: parallelChat.handleKeyDown,
      ...sharedProps,
    };
  }

  if (isSupremeMode) {
    return {
      chatInput: supremeChat.chatInput,
      setChatInput: supremeChat.setChatInput,
      isThinking: supremeChat.isThinking,
      isStreaming: supremeChat.isStreaming,
      handleSend: supremeChat.handleSend,
      handleStop: supremeChat.handleStop,
      handleKeyDown: supremeChat.handleKeyDown,
      ...sharedProps,
    };
  }

  if (isOmegaMode) {
    return {
      chatInput: omegaChat.chatInput,
      setChatInput: omegaChat.setChatInput,
      isThinking: omegaChat.isThinking,
      isStreaming: omegaChat.isStreaming,
      handleSend: omegaChat.handleSend,
      handleStop: omegaChat.handleStop,
      handleKeyDown: omegaChat.handleKeyDown,
      ...sharedProps,
    };
  }

  if (isTitanChatMode) {
    return {
      chatInput: titanChat.chatInput,
      setChatInput: titanChat.setChatInput,
      isThinking: titanChat.isThinking,
      isStreaming: titanChat.isStreaming,
      handleSend: titanChat.handleSend,
      handleStop: titanChat.handleStop,
      handleKeyDown: titanChat.handleKeyDown,
      ...sharedProps,
    };
  }

  if (isSniperMode) {
    return {
      chatInput: sniperChat.chatInput,
      setChatInput: sniperChat.setChatInput,
      isThinking: sniperChat.isThinking,
      isStreaming: sniperChat.isStreaming,
      handleSend: sniperChat.handleSend,
      handleStop: sniperChat.handleStop,
      handleKeyDown: sniperChat.handleKeyDown,
      ...sharedProps,
    };
  }

  return {
    chatInput,
    setChatInput: setChatInputWithRef,
    isThinking,
    isStreaming,
    handleSend,
    handleStop,
    handleKeyDown,
    attachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
    capabilities: getCapabilities(workspacePath),
    lastToolResult: agentTools.lastResult,
  };
}
