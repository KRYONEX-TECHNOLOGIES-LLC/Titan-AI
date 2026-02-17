import * as React from 'react';
import { cn } from '../lib/utils';
import { User, Bot, Copy, Check, ThumbsUp, ThumbsDown } from 'lucide-react';

export interface ChatMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  isStreaming?: boolean;
  onCopy?: () => void;
  onFeedback?: (type: 'positive' | 'negative') => void;
}

const ChatMessage = React.forwardRef<HTMLDivElement, ChatMessageProps>(
  (
    {
      className,
      role,
      content,
      timestamp,
      isStreaming = false,
      onCopy,
      onFeedback,
      ...props
    },
    ref
  ) => {
    const [copied, setCopied] = React.useState(false);
    const isUser = role === 'user';
    const isAssistant = role === 'assistant';

    const handleCopy = async () => {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div
        ref={ref}
        className={cn(
          'group flex gap-4 py-4 px-4',
          isUser && 'bg-zinc-900/50',
          className
        )}
        {...props}
      >
        {/* Avatar */}
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            isUser && 'bg-blue-600',
            isAssistant && 'bg-purple-600',
            role === 'system' && 'bg-zinc-600'
          )}
        >
          {isUser ? (
            <User className="h-4 w-4 text-white" />
          ) : (
            <Bot className="h-4 w-4 text-white" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-2 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-200">
              {isUser ? 'You' : isAssistant ? 'Titan AI' : 'System'}
            </span>
            {timestamp && (
              <span className="text-xs text-zinc-500">
                {timestamp.toLocaleTimeString()}
              </span>
            )}
          </div>

          {/* Message content */}
          <div className="prose prose-invert prose-sm max-w-none">
            <p className="text-zinc-300 whitespace-pre-wrap">{content}</p>
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-purple-500 animate-pulse" />
            )}
          </div>

          {/* Actions */}
          {isAssistant && !isStreaming && (
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-md hover:bg-zinc-800 transition-colors"
                aria-label="Copy message"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-zinc-400" />
                )}
              </button>
              {onFeedback && (
                <>
                  <button
                    onClick={() => onFeedback('positive')}
                    className="p-1.5 rounded-md hover:bg-zinc-800 transition-colors"
                    aria-label="Helpful"
                  >
                    <ThumbsUp className="h-3.5 w-3.5 text-zinc-400" />
                  </button>
                  <button
                    onClick={() => onFeedback('negative')}
                    className="p-1.5 rounded-md hover:bg-zinc-800 transition-colors"
                    aria-label="Not helpful"
                  >
                    <ThumbsDown className="h-3.5 w-3.5 text-zinc-400" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);
ChatMessage.displayName = 'ChatMessage';

export { ChatMessage };
