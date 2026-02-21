'use client';

import { useState, useRef, useCallback } from 'react';
import type { Session, ChatMessage, ToolCallBlock, CodeDiffBlock, GeneratedImage, FileAttachment } from '@/types/ide';
import { parseThinkingTags, getLanguageFromFilename } from '@/utils/file-helpers';
import { useAgentTools, toolCallSummary } from './useAgentTools';
import { useParallelChat } from './useParallelChat';
import { useFileStore } from '@/stores/file-store';
import { isElectron, electronAPI } from '@/lib/electron';

const MAX_TOOL_CALLS = 50;
const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_LOOP_ITERATIONS = 25;
const MAX_TOTAL_FAILURES = 8;
const MAX_HISTORY_ENTRIES = 40;
const MAX_TOOL_RESULT_LEN = 4000;
const TOKEN_BATCH_MS = 80;
const TOKEN_BUDGET_CHARS = 120000;

const TITAN_PLANNER = 'claude-opus-4.6';
const TITAN_TOOL_CALLER = 'gpt-5.3';
const TITAN_WORKER = 'qwen3-coder';
const TITAN_PROTOCOL_IDS = new Set(['titan-protocol']);
const CODE_WRITE_TOOLS = new Set(['edit_file', 'create_file']);

function getIterationModel(baseModel: string, iteration: number): string {
  if (!TITAN_PROTOCOL_IDS.has(baseModel)) return baseModel;
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
  onFileCreated?: (path: string, content: string) => void;
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

  const recentCount = 6;
  const recent = history.slice(-recentCount);
  const older = history.slice(0, -recentCount).slice(-MAX_HISTORY_ENTRIES);

  const compressed = older.map(msg => {
    if (msg.role === 'tool' && msg.content && msg.content.length > 200) {
      const firstLine = msg.content.split('\n')[0]?.slice(0, 150) || '';
      return { ...msg, content: `[Compressed] ${firstLine}...` };
    }
    if (msg.role === 'assistant' && msg.content && msg.content.length > 500 && !msg.tool_calls?.length) {
      return { ...msg, content: msg.content.slice(0, 400) + '\n[TRIMMED]' };
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
}: UseChatOptions) {
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const thinkingStartRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortedRef = useRef(false);

  const pendingContentRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const agentTools = useAgentTools({ onTerminalCommand, onFileEdited, onFileCreated, onFileDeleted, workspacePath });

  const updateMessage = useCallback((
    sessionId: string,
    messageId: string,
    updater: (msg: ChatMessage) => ChatMessage
  ) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== sessionId) return s;
      return { ...s, messages: s.messages.map(m => m.id === messageId ? updater(m) : m) };
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

  function serializeFileTree(): string {
    try {
      const { fileTree } = useFileStore.getState();
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
  }

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
        return { branch: status.current || undefined, modified, untracked, staged };
      }

      const isServerPath = wsPath.startsWith('/') || /^[A-Z]:\\/i.test(wsPath);
      const url = isServerPath && wsPath
        ? `/api/git/status?path=${encodeURIComponent(wsPath)}`
        : '/api/git/status';

      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) });
      if (!res.ok) return undefined;
      const data = await res.json();
      if (!data.isRepo) return undefined;
      return {
        branch: data.branch || data.current,
        modified: data.modified || [],
        untracked: data.untracked || data.not_added || [],
        staged: data.staged || [],
      };
    } catch { return undefined; }
  }

  async function streamFromContinue(
    conversationHistory: LLMMessage[],
    sessionId: string,
    messageId: string,
    abortSignal: AbortSignal,
    messageAttachments?: { mediaType: string; base64: string }[],
    modelOverride?: string,
  ): Promise<{ content: string; toolCalls: StreamToolCall[] }> {
    const gitStatus = await fetchGitStatus();
    const fileTree = serializeFileTree();
    const wsPath = workspacePath || useFileStore.getState().workspacePath || '';

    const compressedHistory = compressConversationHistory(conversationHistory);

    const response = await fetch('/api/chat/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortSignal,
      body: JSON.stringify({
        messages: compressedHistory,
        model: modelOverride || activeModel,
        attachments: messageAttachments,
        codeContext: {
          file: activeTab,
          content: (editorInstance?.getValue() || fileContents[activeTab] || '').slice(0, 8000),
          language: getLanguageFromFilename(activeTab),
        },
        repoMap: typeof window !== 'undefined' ? (window as any).__titanRepoMap : undefined,
        workspacePath: wsPath,
        openTabs: openTabs || [],
        fileTree,
        gitStatus,
        terminalHistory: terminalHistory?.slice(-5) || [],
        cursorPosition: cursorPosition || undefined,
        linterDiagnostics: linterDiagnostics?.slice(0, 10) || [],
        recentlyEditedFiles: recentlyEditedFiles?.slice(0, 10) || [],
        recentlyViewedFiles: recentlyViewedFiles?.slice(0, 10) || [],
        isDesktop: isDesktop || false,
        osPlatform: osPlatform || 'unknown',
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed (${response.status})`);
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
    if (!chatInput.trim() && attachments.length === 0) return;
    const msg = chatInput.trim();
    setChatInput('');
    abortedRef.current = false;
    agentTools.reset();

    // Collect ready attachments before clearing
    const readyAttachments = attachments
      .filter(a => a.status === 'ready' && a.base64)
      .map(a => ({ mediaType: a.mediaType, base64: a.base64! }));
    clearAttachments();

    const sessionId = activeSessionId;
    const streamMessageId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const currentCode = editorInstance?.getValue() || fileContents[activeTab] || '';
    const selection = editorInstance?.getSelection();
    const selectedText = selection ? editorInstance?.getModel()?.getValueInRange(selection) : '';
    const currentLanguage = getLanguageFromFilename(activeTab);

    const userContent = selectedText
      ? `[Selected Code]\n\`\`\`${currentLanguage}\n${selectedText}\n\`\`\`\n\n${msg}`
      : msg;

    const userMessage: ChatMessage = {
      role: 'user',
      content: userContent,
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
        ? { ...s, messages: [...s.messages, userMessage, assistantMessage] }
        : s
    ));
    setIsThinking(true);
    thinkingStartRef.current = Date.now();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const conversationHistory: LLMMessage[] = [
      { role: 'user', content: userContent },
    ];

    let totalToolCalls = 0;
    let consecutiveFailures = 0;
    let totalFailures = 0;
    let loopIterations = 0;
    const isTitanProtocol = TITAN_PROTOCOL_IDS.has(activeModel);

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
          );
        } catch (err) {
          if (abortedRef.current || controller.signal.aborted) break;
          throw err;
        }

        if (abortedRef.current || controller.signal.aborted) break;

        const { content, toolCalls } = streamResult;

        if (toolCalls.length === 0) {
          const actionPatterns = /\b(I'll|I will|Let me|I would|I can|I should|we can|we should|here's what|I'd)\b.*\b(create|edit|read|run|install|write|fix|modify|update|add|remove|delete|build|open|check)\b/i;
          const hasNoToolCalls = totalToolCalls === 0;
          const looksLikeActionDescription = actionPatterns.test(content) && hasNoToolCalls && content.length < 2000;

          if (looksLikeActionDescription && consecutiveFailures === 0) {
            conversationHistory.push({ role: 'assistant', content });
            conversationHistory.push({
              role: 'user',
              content: 'You described what you would do but did not call any tools. Stop describing and actually do it. Call the appropriate tools now.',
            });
            consecutiveFailures++;
            updateMessage(sessionId, streamMessageId, (m) => ({ ...m, streaming: true }));
            continue;
          }

          updateMessage(sessionId, streamMessageId, (m) => ({
            ...m,
            streaming: false,
            content: m.content || content || 'Done.',
          }));
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
          });

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
            : `Error: ${result.error || 'Unknown error'}\n${result.output || ''}`;

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
      setIsThinking(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [
    chatInput, editorInstance, activeTab, fileContents, activeSessionId, activeModel, attachments, clearAttachments,
    setSessions, updateMessage, appendToolCallToMessage, updateToolCallInMessage,
    appendCodeDiffToMessage, appendGeneratedImageToMessage, agentTools, flushTokens, workspacePath, openTabs, terminalHistory,
    cursorPosition, linterDiagnostics, recentlyEditedFiles, recentlyViewedFiles, isDesktop, osPlatform,
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
      messages: s.messages.map(m =>
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

  const isParallelMode = activeModel === 'titan-protocol-v2';

  if (isParallelMode) {
    return {
      chatInput: parallelChat.chatInput,
      setChatInput: parallelChat.setChatInput,
      isThinking: parallelChat.isThinking,
      isStreaming: parallelChat.isStreaming,
      handleSend: parallelChat.handleSend,
      handleStop: parallelChat.handleStop,
      handleKeyDown: parallelChat.handleKeyDown,
    };
  }

  return {
    chatInput,
    setChatInput,
    isThinking,
    isStreaming,
    handleSend,
    handleStop,
    handleKeyDown,
    attachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
  };
}
