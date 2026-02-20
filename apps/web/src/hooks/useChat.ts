'use client';

import { useState, useRef, useCallback } from 'react';
import type { Session, ChatMessage, ToolCallBlock, CodeDiffBlock } from '@/types/ide';
import { parseThinkingTags, getLanguageFromFilename } from '@/utils/file-helpers';
import { useAgentTools, toolCallSummary } from './useAgentTools';
import { useFileStore } from '@/stores/file-store';

const MAX_TOOL_CALLS = 25;
const MAX_CONSECUTIVE_FAILURES = 3;

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
  workspacePath?: string;
  openTabs?: string[];
  terminalHistory?: TerminalHistoryEntry[];
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
  workspacePath,
  openTabs,
  terminalHistory,
}: UseChatOptions) {
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const thinkingStartRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortedRef = useRef(false);

  const agentTools = useAgentTools({ onTerminalCommand, onFileEdited, onFileCreated, workspacePath });

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

  async function fetchGitStatus(): Promise<{ branch?: string; modified?: string[]; untracked?: string[]; staged?: string[] } | undefined> {
    try {
      const res = await fetch('/api/git/status', { method: 'GET', signal: AbortSignal.timeout(3000) });
      if (!res.ok) return undefined;
      const data = await res.json();
      return {
        branch: data.branch || data.current,
        modified: data.modified || data.files?.filter((f: any) => f.working_dir !== ' ').map((f: any) => f.path),
        untracked: data.not_added || data.files?.filter((f: any) => f.index === '?').map((f: any) => f.path),
        staged: data.staged || data.files?.filter((f: any) => f.index !== ' ' && f.index !== '?').map((f: any) => f.path),
      };
    } catch { return undefined; }
  }

  async function streamFromContinue(
    conversationHistory: LLMMessage[],
    sessionId: string,
    messageId: string,
    abortSignal: AbortSignal,
  ): Promise<{ content: string; toolCalls: StreamToolCall[] }> {
    const gitStatus = await fetchGitStatus();
    const fileTree = serializeFileTree();
    const wsPath = workspacePath || useFileStore.getState().workspacePath || '';

    const response = await fetch('/api/chat/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortSignal,
      body: JSON.stringify({
        messages: conversationHistory,
        model: activeModel,
        codeContext: {
          file: activeTab,
          content: editorInstance?.getValue() || fileContents[activeTab] || '',
          language: getLanguageFromFilename(activeTab),
        },
        repoMap: typeof window !== 'undefined' ? (window as any).__titanRepoMap : undefined,
        workspacePath: wsPath,
        openTabs: openTabs || [],
        fileTree,
        gitStatus,
        terminalHistory: terminalHistory?.slice(-5) || [],
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

    while (true) {
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
            const { thinking, content } = parseThinkingTags(fullContent);
            const thinkingTime = thinkingStartRef.current > 0
              ? Math.round((Date.now() - thinkingStartRef.current) / 1000)
              : 0;
            updateMessage(sessionId, messageId, (msg) => ({
              ...msg,
              content: content || fullContent,
              thinking: thinking || msg.thinking,
              thinkingTime: thinking ? thinkingTime : msg.thinkingTime,
              streaming: true,
            }));
          } else if (eventType === 'tool_call') {
            toolCalls.push({
              id: payload.id,
              tool: payload.tool,
              args: payload.args,
            });
          } else if (eventType === 'done') {
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
            // Skip JSON parse errors on individual chunks
          } else {
            throw e;
          }
        }
      }
    }

    return { content: fullContent, toolCalls };
  }

  const handleSend = useCallback(async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput('');
    abortedRef.current = false;
    agentTools.reset();

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

    // Build the LLM conversation history
    const conversationHistory: LLMMessage[] = [
      { role: 'user', content: userContent },
    ];

    let totalToolCalls = 0;
    let consecutiveFailures = 0;

    try {
      // ── The Tool-Calling Loop ──
      // Keep streaming + executing tool calls until the LLM returns pure text
      while (true) {
        if (abortedRef.current || controller.signal.aborted) break;

        setIsStreaming(true);
        const { content, toolCalls } = await streamFromContinue(
          conversationHistory,
          sessionId,
          streamMessageId,
          controller.signal,
        );

        // No tool calls => LLM is done, final text response
        if (toolCalls.length === 0) {
          // Tool-nudge retry: detect when LLM describes actions without calling tools
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
            updateMessage(sessionId, streamMessageId, (m) => ({
              ...m,
              streaming: true,
            }));
            continue;
          }

          updateMessage(sessionId, streamMessageId, (m) => ({
            ...m,
            streaming: false,
            content: m.content || content || 'Done.',
          }));
          break;
        }

        // Append the assistant message with tool_calls to conversation history
        conversationHistory.push({
          role: 'assistant',
          content: content || null,
          tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.tool,
              arguments: JSON.stringify(tc.args),
            },
          })),
        });

        // Execute tool calls -- parallelize read-only tools, serialize mutating ones
        const readOnlyTools = new Set(['read_file', 'list_directory', 'grep_search']);
        const allReadOnly = toolCalls.every(tc => readOnlyTools.has(tc.tool));

        async function executeSingleTool(tc: StreamToolCall) {
          if (abortedRef.current || controller.signal.aborted) return null;
          totalToolCalls++;
          if (totalToolCalls > MAX_TOOL_CALLS) return 'circuit_break';

          const toolCallBlock: ToolCallBlock = {
            id: tc.id,
            tool: tc.tool,
            args: tc.args,
            status: 'running',
            startedAt: Date.now(),
          };
          appendToolCallToMessage(sessionId, streamMessageId, toolCallBlock);

          const result = await agentTools.executeToolCall(tc.tool, tc.args);

          updateToolCallInMessage(sessionId, streamMessageId, tc.id, {
            status: result.success ? 'done' : 'error',
            result: result.output,
            error: result.error,
            finishedAt: Date.now(),
          });

          if (!result.success) {
            consecutiveFailures++;
          } else {
            consecutiveFailures = 0;
          }

          if (tc.tool === 'edit_file' && result.success) {
            const newContent = result.metadata?.newContent as string || tc.args.new_string as string;
            const diffBlock: CodeDiffBlock = {
              id: `diff-${tc.id}`,
              file: tc.args.path as string,
              code: newContent,
              status: 'pending',
            };
            appendCodeDiffToMessage(sessionId, streamMessageId, diffBlock);
          } else if (tc.tool === 'create_file' && result.success) {
            const diffBlock: CodeDiffBlock = {
              id: `diff-${tc.id}`,
              file: tc.args.path as string,
              code: tc.args.content as string,
              status: 'pending',
            };
            appendCodeDiffToMessage(sessionId, streamMessageId, diffBlock);
          }

          const resultOutput = result.success
            ? result.output
            : `Error: ${result.error || 'Unknown error'}\n${result.output || ''}`;

          return { tc, resultOutput };
        }

        if (allReadOnly && toolCalls.length > 1) {
          // Parallel execution for read-only tools
          const results = await Promise.all(toolCalls.map(executeSingleTool));
          for (const r of results) {
            if (r === 'circuit_break') {
              const warnMsg = `Circuit breaker: stopped after ${MAX_TOOL_CALLS} tool calls to prevent infinite loops.`;
              updateMessage(sessionId, streamMessageId, (m) => ({
                ...m,
                content: (m.content ? m.content + '\n\n' : '') + warnMsg,
                streaming: false,
              }));
              return;
            }
            if (r && typeof r === 'object') {
              conversationHistory.push({
                role: 'tool',
                content: r.resultOutput.slice(0, 10000),
                tool_call_id: r.tc.id,
                name: r.tc.tool,
              });
            }
          }
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            const warnMsg = `Circuit breaker: ${MAX_CONSECUTIVE_FAILURES} consecutive tool failures.`;
            updateMessage(sessionId, streamMessageId, (m) => ({
              ...m,
              content: (m.content ? m.content + '\n\n' : '') + warnMsg,
              streaming: false,
            }));
            return;
          }
        } else {
          // Sequential execution for mutating tools
          for (const tc of toolCalls) {
            if (abortedRef.current || controller.signal.aborted) break;
            const r = await executeSingleTool(tc);
            if (r === 'circuit_break') {
              const warnMsg = `Circuit breaker: stopped after ${MAX_TOOL_CALLS} tool calls to prevent infinite loops.`;
              updateMessage(sessionId, streamMessageId, (m) => ({
                ...m,
                content: (m.content ? m.content + '\n\n' : '') + warnMsg,
                streaming: false,
              }));
              return;
            }
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              const warnMsg = `Circuit breaker: ${MAX_CONSECUTIVE_FAILURES} consecutive tool failures.`;
              updateMessage(sessionId, streamMessageId, (m) => ({
                ...m,
                content: (m.content ? m.content + '\n\n' : '') + warnMsg,
                streaming: false,
              }));
              return;
            }
            if (r && typeof r === 'object') {
              conversationHistory.push({
                role: 'tool',
                content: r.resultOutput.slice(0, 10000),
                tool_call_id: r.tc.id,
                name: r.tc.tool,
              });
            }
          }
        }

        // If aborted, stop the loop
        if (abortedRef.current || controller.signal.aborted) {
          updateMessage(sessionId, streamMessageId, (m) => ({
            ...m,
            content: m.content || 'Generation stopped.',
            streaming: false,
          }));
          break;
        }

        // Clear the content for the next turn (the LLM will produce a new response)
        updateMessage(sessionId, streamMessageId, (m) => ({
          ...m,
          streaming: true,
        }));
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
        ? `- Your OpenRouter API key is invalid or expired\n- Go to https://openrouter.ai/keys and create a new key\n- Update OPENROUTER_API_KEY in your Railway environment variables\n- Make sure your OpenRouter account has credits`
        : `- Check your internet connection\n- Verify API keys are configured in your environment\n- Try a different model from the model selector`;
      const errorContent = `⚠️ **Connection Error**\n\n${errorMessage}\n\n**Troubleshooting:**\n${troubleshooting}\n\n_Click the retry button below to try again._`;

      updateMessage(sessionId, streamMessageId, (m) => ({
        ...m,
        content: errorContent,
        streaming: false,
        isError: true,
        retryMessage: msg,
      }));
    } finally {
      setIsThinking(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [
    chatInput, editorInstance, activeTab, fileContents, activeSessionId, activeModel,
    setSessions, updateMessage, appendToolCallToMessage, updateToolCallInMessage,
    appendCodeDiffToMessage, agentTools, workspacePath, openTabs, terminalHistory,
  ]);

  const handleStop = useCallback(() => {
    abortedRef.current = true;
    agentTools.abort();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsThinking(false);
    setIsStreaming(false);
  }, [agentTools]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return {
    chatInput,
    setChatInput,
    isThinking,
    isStreaming,
    handleSend,
    handleStop,
    handleKeyDown,
  };
}
