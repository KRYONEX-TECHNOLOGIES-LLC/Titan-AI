// Terminal Output Component
// packages/ui/components/terminal/src/terminal-output.tsx

import React, { useRef, useEffect, useMemo } from 'react';
import { clsx } from 'clsx';

export interface TerminalOutputProps {
  lines: TerminalLine[];
  onLineClick?: (lineIndex: number) => void;
  highlightedLine?: number;
  searchQuery?: string;
  autoScroll?: boolean;
  className?: string;
}

export interface TerminalLine {
  content: string;
  type: 'stdout' | 'stderr' | 'stdin' | 'system';
  timestamp?: Date;
  ansiCodes?: AnsiSegment[];
}

export interface AnsiSegment {
  text: string;
  foreground?: string;
  background?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
}

export function TerminalOutput({
  lines,
  onLineClick,
  highlightedLine,
  searchQuery,
  autoScroll = true,
  className,
}: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(autoScroll);

  useEffect(() => {
    shouldAutoScrollRef.current = autoScroll;
  }, [autoScroll]);

  useEffect(() => {
    if (shouldAutoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines.length]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // Auto-scroll is enabled when scrolled to bottom
    shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  return (
    <div
      ref={containerRef}
      className={clsx(
        'titan-terminal-output',
        'h-full overflow-auto font-mono text-sm',
        'bg-terminal-output-background text-terminal-output-foreground',
        className
      )}
      onScroll={handleScroll}
    >
      {lines.map((line, index) => (
        <TerminalOutputLine
          key={index}
          line={line}
          lineIndex={index}
          isHighlighted={index === highlightedLine}
          searchQuery={searchQuery}
          onClick={() => onLineClick?.(index)}
        />
      ))}
    </div>
  );
}

interface TerminalOutputLineProps {
  line: TerminalLine;
  lineIndex: number;
  isHighlighted: boolean;
  searchQuery?: string;
  onClick?: () => void;
}

function TerminalOutputLine({
  line,
  lineIndex,
  isHighlighted,
  searchQuery,
  onClick,
}: TerminalOutputLineProps) {
  const typeColors = {
    stdout: '',
    stderr: 'text-terminal-stderr',
    stdin: 'text-terminal-stdin',
    system: 'text-terminal-system italic',
  };

  const content = useMemo(() => {
    if (line.ansiCodes && line.ansiCodes.length > 0) {
      return line.ansiCodes.map((segment, i) => (
        <AnsiSpan key={i} segment={segment} searchQuery={searchQuery} />
      ));
    }

    if (searchQuery) {
      return highlightSearchMatches(line.content, searchQuery);
    }

    return line.content;
  }, [line, searchQuery]);

  return (
    <div
      className={clsx(
        'titan-terminal-line',
        'px-2 py-px hover:bg-terminal-line-hover cursor-text',
        typeColors[line.type],
        isHighlighted && 'bg-terminal-line-highlighted'
      )}
      onClick={onClick}
    >
      <span className="whitespace-pre-wrap break-all">{content}</span>
    </div>
  );
}

interface AnsiSpanProps {
  segment: AnsiSegment;
  searchQuery?: string;
}

function AnsiSpan({ segment, searchQuery }: AnsiSpanProps) {
  const style: React.CSSProperties = {};
  
  if (segment.foreground) {
    style.color = segment.foreground;
  }
  if (segment.background) {
    style.backgroundColor = segment.background;
  }

  const className = clsx(
    segment.bold && 'font-bold',
    segment.italic && 'italic',
    segment.underline && 'underline',
    segment.dim && 'opacity-60'
  );

  const content = searchQuery
    ? highlightSearchMatches(segment.text, searchQuery)
    : segment.text;

  return (
    <span className={className} style={style}>
      {content}
    </span>
  );
}

function highlightSearchMatches(text: string, query: string): React.ReactNode {
  if (!query) return text;

  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, i) => {
    if (part.toLowerCase() === query.toLowerCase()) {
      return (
        <mark key={i} className="bg-terminal-search-match text-terminal-search-match-foreground">
          {part}
        </mark>
      );
    }
    return part;
  });
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ANSI color parsing
const ANSI_COLORS: Record<number, string> = {
  30: '#000000', // Black
  31: '#cd3131', // Red
  32: '#0dbc79', // Green
  33: '#e5e510', // Yellow
  34: '#2472c8', // Blue
  35: '#bc3fbc', // Magenta
  36: '#11a8cd', // Cyan
  37: '#e5e5e5', // White
  90: '#666666', // Bright Black
  91: '#f14c4c', // Bright Red
  92: '#23d18b', // Bright Green
  93: '#f5f543', // Bright Yellow
  94: '#3b8eea', // Bright Blue
  95: '#d670d6', // Bright Magenta
  96: '#29b8db', // Bright Cyan
  97: '#ffffff', // Bright White
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: '#000000',
  41: '#cd3131',
  42: '#0dbc79',
  43: '#e5e510',
  44: '#2472c8',
  45: '#bc3fbc',
  46: '#11a8cd',
  47: '#e5e5e5',
  100: '#666666',
  101: '#f14c4c',
  102: '#23d18b',
  103: '#f5f543',
  104: '#3b8eea',
  105: '#d670d6',
  106: '#29b8db',
  107: '#ffffff',
};

export function parseAnsiCodes(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  const regex = /\x1b\[([0-9;]*)m/g;
  
  let lastIndex = 0;
  let currentStyle: Partial<AnsiSegment> = {};
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before this escape code
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        ...currentStyle,
      });
    }

    // Parse the escape code
    const codes = match[1].split(';').map(Number);
    for (const code of codes) {
      if (code === 0) {
        currentStyle = {};
      } else if (code === 1) {
        currentStyle.bold = true;
      } else if (code === 2) {
        currentStyle.dim = true;
      } else if (code === 3) {
        currentStyle.italic = true;
      } else if (code === 4) {
        currentStyle.underline = true;
      } else if (ANSI_COLORS[code]) {
        currentStyle.foreground = ANSI_COLORS[code];
      } else if (ANSI_BG_COLORS[code]) {
        currentStyle.background = ANSI_BG_COLORS[code];
      }
    }

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      ...currentStyle,
    });
  }

  return segments;
}
