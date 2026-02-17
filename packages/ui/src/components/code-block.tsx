import * as React from 'react';
import { cn } from '../lib/utils';
import { Copy, Check } from 'lucide-react';

export interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
  filename?: string;
  copyable?: boolean;
}

const CodeBlock = React.forwardRef<HTMLPreElement, CodeBlockProps>(
  (
    {
      className,
      code,
      language = 'text',
      showLineNumbers = true,
      highlightLines = [],
      filename,
      copyable = true,
      ...props
    },
    ref
  ) => {
    const [copied, setCopied] = React.useState(false);
    const lines = code.split('\n');

    const handleCopy = async () => {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div className="relative group rounded-lg border bg-zinc-950 overflow-hidden">
        {/* Header */}
        {(filename || copyable) && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900">
            <div className="flex items-center gap-2">
              {filename && (
                <span className="text-xs text-zinc-400 font-mono">{filename}</span>
              )}
              <span className="text-xs text-zinc-500 uppercase">{language}</span>
            </div>
            {copyable && (
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-md hover:bg-zinc-800 transition-colors"
                aria-label="Copy code"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4 text-zinc-400" />
                )}
              </button>
            )}
          </div>
        )}

        {/* Code */}
        <pre
          ref={ref}
          className={cn('overflow-x-auto p-4 text-sm font-mono', className)}
          {...props}
        >
          <code className="block">
            {lines.map((line, index) => {
              const lineNumber = index + 1;
              const isHighlighted = highlightLines.includes(lineNumber);

              return (
                <div
                  key={index}
                  className={cn(
                    'flex',
                    isHighlighted && 'bg-yellow-500/10 -mx-4 px-4'
                  )}
                >
                  {showLineNumbers && (
                    <span className="select-none text-zinc-600 w-10 shrink-0 pr-4 text-right">
                      {lineNumber}
                    </span>
                  )}
                  <span className="text-zinc-100 flex-1">{line || ' '}</span>
                </div>
              );
            })}
          </code>
        </pre>
      </div>
    );
  }
);
CodeBlock.displayName = 'CodeBlock';

export { CodeBlock };
