'use client';

import { useState, useRef, useCallback } from 'react';
import type { Session, ChatMessage } from '@/types/ide';
import { parseThinkingTags, extractFileBlocks, getFileInfo, getLanguageFromFilename } from '@/utils/file-helpers';

interface UseChatOptions {
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  activeSessionId: string;
  activeModel: string;
  activeTab: string;
  fileContents: Record<string, string>;
  editorInstance: any;
  applyDiffDecorations: (oldContent: string, newContent: string) => void;
}

export function useChat({
  sessions,
  setSessions,
  activeSessionId,
  activeModel,
  activeTab,
  fileContents,
  editorInstance,
  applyDiffDecorations,
}: UseChatOptions) {
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const thinkingStartRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleSend = useCallback(async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput('');
    const sessionId = activeSessionId;
    const streamMessageId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const currentCode = editorInstance?.getValue() || fileContents[activeTab] || '';
    const selection = editorInstance?.getSelection();
    const selectedText = selection ? editorInstance?.getModel()?.getValueInRange(selection) : '';
    const currentLanguage = getLanguageFromFilename(activeTab);

    const userMessage: ChatMessage = {
      role: 'user',
      content: selectedText ? `[Selected Code]\n\`\`\`${currentLanguage}\n${selectedText}\n\`\`\`\n\n${msg}` : msg,
      time: 'just now',
    };
    const placeholderAssistantMessage: ChatMessage = {
      id: streamMessageId,
      role: 'assistant',
      content: '',
      time: 'just now',
      streaming: true,
      streamingModel: activeModel,
    };

    setSessions(prev => prev.map(s =>
      s.id === sessionId
        ? { ...s, messages: [...s.messages, userMessage, placeholderAssistantMessage] }
        : s
    ));
    setIsThinking(true);
    thinkingStartRef.current = Date.now();

    const updateStreamingAssistant = (
      rawContent: string,
      done = false,
      metadata?: { model?: string; providerModel?: string; provider?: string }
    ) => {
      const { thinking, content } = parseThinkingTags(rawContent);
      const thinkingTime = thinkingStartRef.current > 0
        ? Math.round((Date.now() - thinkingStartRef.current) / 1000)
        : 0;

      setSessions(prev =>
        prev.map(s => {
          if (s.id !== sessionId) return s;
          return {
            ...s,
            messages: s.messages.map(m =>
              m.id === streamMessageId
                ? {
                    ...m,
                    content: content || rawContent,
                    thinking: thinking || undefined,
                    thinkingTime: thinking ? thinkingTime : undefined,
                    streaming: !done,
                    time: 'just now',
                    streamingModel: metadata?.model ?? m.streamingModel,
                    streamingProviderModel: metadata?.providerModel ?? m.streamingProviderModel,
                    streamingProvider: metadata?.provider ?? m.streamingProvider,
                  }
                : m
            ),
          };
        })
      );
    };

    const handleSuggestedEdits = (data: { content?: string; suggestedEdits?: Array<{ file: string; content?: string }> }) => {
      let suggestedEdits = data.suggestedEdits || [];

      if (suggestedEdits.length === 0 && data.content) {
        const extractedBlocks = extractFileBlocks(data.content);
        if (extractedBlocks.length > 0) {
          suggestedEdits = extractedBlocks.map(block => ({
            file: block.filename,
            content: block.content,
          }));
        }
      }

      const newChangedFiles = suggestedEdits.map((edit: { file: string; content?: string }) => {
        const info = getFileInfo(edit.file);
        const lines = (edit.content || '').split('\n').length;
        return { name: edit.file, additions: lines, deletions: 0, icon: info.icon, color: info.color };
      });

      if (suggestedEdits.length > 0) {
        const edit = suggestedEdits[0];
        if (edit.content && edit.file === activeTab) {
          applyDiffDecorations(currentCode, edit.content);
        }
      } else if (data.content?.includes('```')) {
        const codeMatch = data.content.match(/```(?:\w+)?\n([\s\S]*?)```/);
        if (codeMatch && codeMatch[1]) {
          const suggestedCode = codeMatch[1].trim();
          if (suggestedCode.length > 50) {
            applyDiffDecorations(currentCode, suggestedCode);
          }
        }
      }

      setSessions(prev => prev.map(s =>
        s.id === sessionId
          ? {
            ...s,
            changedFiles: newChangedFiles.length > 0
              ? newChangedFiles
              : (s.changedFiles.length === 0 && data.content?.includes('```')
                ? [{ name: activeTab, additions: 15, deletions: 3, ...getFileInfo(activeTab) }]
                : s.changedFiles),
          }
          : s
      ));
    };

    const crossSessionMemory = sessions
      .filter(s => s.id !== sessionId && s.messages.length > 1)
      .map(s => {
        const lastMsgs = s.messages.slice(-4).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 200)}`).join('\n');
        return `[Session: ${s.name}]\n${lastMsgs}`;
      })
      .join('\n\n');

    let streamed = '';
    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId,
          message: msg,
          model: activeModel,
          stream: true,
          codeContext: {
            file: activeTab,
            content: currentCode,
            selection: selectedText || undefined,
            language: currentLanguage,
          },
          crossSessionMemory: crossSessionMemory || undefined,
          repoMap: typeof window !== 'undefined' ? (window as any).__titanRepoMap : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat request failed (${response.status})`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalPayload: { content?: string; suggestedEdits?: Array<{ file: string; content?: string }> } | null = null;

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
            const payload = JSON.parse(data) as {
              content?: string;
              suggestedEdits?: Array<{ file: string; content?: string }>;
              message?: string;
              model?: string;
              providerModel?: string;
              provider?: string;
            };

            if (eventType === 'token' && payload.content) {
              streamed += payload.content;
              setIsStreaming(true);
              updateStreamingAssistant(streamed, false);
            } else if (eventType === 'start') {
              setIsStreaming(true);
              setIsThinking(false);
              updateStreamingAssistant(streamed, false, {
                model: payload.model,
                providerModel: payload.providerModel,
                provider: payload.provider,
              });
            } else if (eventType === 'done') {
              finalPayload = payload;
              if (payload.content !== undefined) {
                streamed = payload.content;
              }
              setIsStreaming(false);
              updateStreamingAssistant(streamed || 'Done.', true, {
                model: payload.model,
                providerModel: payload.providerModel,
                provider: payload.provider,
              });
            } else if (eventType === 'error') {
              setIsStreaming(false);
              throw new Error(payload.message || 'Streaming error');
            }
          }
        }

        setIsThinking(false);
        setIsStreaming(false);
        const normalized = finalPayload || { content: streamed };
        updateStreamingAssistant(normalized.content || 'I apologize, but I encountered an error processing your request.', true);
        handleSuggestedEdits(normalized);
      } else {
        const data = await response.json();
        setIsThinking(false);
        setIsStreaming(false);
        updateStreamingAssistant(
          data.content || 'I apologize, but I encountered an error processing your request.',
          true
        );
        handleSuggestedEdits(data);
      }
    } catch (error) {
      setIsThinking(false);
      setIsStreaming(false);
      abortControllerRef.current = null;

      if (error instanceof DOMException && error.name === 'AbortError') {
        updateStreamingAssistant(streamed || 'Generation stopped.', true);
        return;
      }

      console.error('Chat error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const is401 = errorMessage.includes('401') || errorMessage.toLowerCase().includes('user not found');
      const troubleshooting = is401
        ? `- Your OpenRouter API key is invalid or expired\n- Go to https://openrouter.ai/keys and create a new key\n- Update OPENROUTER_API_KEY in your Railway environment variables\n- Make sure your OpenRouter account has credits`
        : `- Check your internet connection\n- Verify API keys are configured in your environment\n- Try a different model from the model selector`;
      const errorContent = `⚠️ **Connection Error**\n\n${errorMessage}\n\n**Troubleshooting:**\n${troubleshooting}\n\n_Click the retry button below to try again._`;

      setSessions(prev => prev.map(s =>
        s.id === sessionId
          ? {
            ...s,
            messages: s.messages.map(m => m.id === streamMessageId
              ? {
                  ...m,
                  content: errorContent,
                  streaming: false,
                  time: 'just now',
                  isError: true,
                  retryMessage: msg,
                }
              : m
            ),
          }
          : s
      ));
    } finally {
      abortControllerRef.current = null;
    }
  }, [chatInput, editorInstance, activeTab, fileContents, activeSessionId, activeModel, sessions, setSessions, applyDiffDecorations]);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsThinking(false);
    setIsStreaming(false);
  }, []);

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
