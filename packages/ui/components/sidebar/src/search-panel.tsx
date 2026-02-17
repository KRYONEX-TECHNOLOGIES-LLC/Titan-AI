// Search Panel Component
// packages/ui/components/sidebar/src/search-panel.tsx

import React, { useState, useCallback, useRef } from 'react';
import { clsx } from 'clsx';

export interface SearchPanelProps {
  onSearch?: (query: string, options: SearchOptions) => void;
  onReplace?: (search: string, replace: string, options: SearchOptions) => void;
  results?: SearchResult[];
  isSearching?: boolean;
  className?: string;
}

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  includePattern?: string;
  excludePattern?: string;
}

export interface SearchResult {
  id: string;
  filePath: string;
  fileName: string;
  matches: SearchMatch[];
}

export interface SearchMatch {
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

export function SearchPanel({
  onSearch,
  onReplace,
  results = [],
  isSearching,
  className,
}: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [options, setOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
  });
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(() => {
    if (query.trim()) {
      onSearch?.(query, options);
      // Expand all results by default
      setExpandedFiles(new Set(results.map(r => r.id)));
    }
  }, [query, options, onSearch, results]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const toggleOption = (key: keyof SearchOptions) => {
    setOptions(prev => ({
      ...prev,
      [key]: !prev[key as keyof typeof prev],
    }));
  };

  const toggleFile = (id: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

  return (
    <div
      className={clsx(
        'titan-search-panel',
        'flex flex-col h-full',
        className
      )}
    >
      {/* Search input */}
      <div className="titan-search-input-container p-2 space-y-2">
        <div className="flex items-center gap-1">
          <button
            className={clsx(
              'titan-search-toggle p-1 rounded',
              'hover:bg-search-toggle-hover',
              showReplace && 'bg-search-toggle-active'
            )}
            onClick={() => setShowReplace(!showReplace)}
            title="Toggle Replace"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d={showReplace ? 'M4 8L8 4L12 8M4 12L8 8L12 12' : 'M4 6L8 10L12 6'} />
            </svg>
          </button>

          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search"
              className={clsx(
                'w-full px-2 py-1 text-sm rounded',
                'bg-search-input-background text-search-input-foreground',
                'border border-search-input-border',
                'focus:outline-none focus:border-search-input-focus-border',
                'placeholder:text-search-input-placeholder'
              )}
            />
          </div>
        </div>

        {/* Search options */}
        <div className="flex items-center gap-1 px-1">
          <OptionButton
            active={options.caseSensitive}
            onClick={() => toggleOption('caseSensitive')}
            title="Match Case"
          >
            Aa
          </OptionButton>
          <OptionButton
            active={options.wholeWord}
            onClick={() => toggleOption('wholeWord')}
            title="Match Whole Word"
          >
            [ab]
          </OptionButton>
          <OptionButton
            active={options.useRegex}
            onClick={() => toggleOption('useRegex')}
            title="Use Regular Expression"
          >
            .*
          </OptionButton>
        </div>

        {/* Replace input */}
        {showReplace && (
          <div className="flex items-center gap-1 pl-6">
            <div className="flex-1">
              <input
                type="text"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="Replace"
                className={clsx(
                  'w-full px-2 py-1 text-sm rounded',
                  'bg-search-input-background text-search-input-foreground',
                  'border border-search-input-border',
                  'focus:outline-none focus:border-search-input-focus-border'
                )}
              />
            </div>
            <button
              className="p-1 rounded hover:bg-search-action-hover"
              title="Replace"
              onClick={() => onReplace?.(query, replaceText, options)}
            >
              <ReplaceIcon />
            </button>
            <button
              className="p-1 rounded hover:bg-search-action-hover"
              title="Replace All"
            >
              <ReplaceAllIcon />
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="titan-search-results flex-1 overflow-auto">
        {isSearching && (
          <div className="p-4 text-center text-sm text-search-status">
            Searching...
          </div>
        )}

        {!isSearching && query && results.length === 0 && (
          <div className="p-4 text-center text-sm text-search-status">
            No results found
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div className="text-xs text-search-status px-2 py-1 border-b border-search-border">
            {totalMatches} results in {results.length} files
          </div>
        )}

        {results.map((result) => (
          <SearchResultFile
            key={result.id}
            result={result}
            isExpanded={expandedFiles.has(result.id)}
            onToggle={() => toggleFile(result.id)}
            searchQuery={query}
          />
        ))}
      </div>
    </div>
  );
}

interface OptionButtonProps {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

function OptionButton({ active, onClick, title, children }: OptionButtonProps) {
  return (
    <button
      className={clsx(
        'px-1.5 py-0.5 text-xs font-mono rounded',
        'border',
        active
          ? 'bg-search-option-active text-search-option-active-foreground border-search-option-active-border'
          : 'bg-transparent text-search-option-foreground border-transparent hover:bg-search-option-hover'
      )}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

interface SearchResultFileProps {
  result: SearchResult;
  isExpanded: boolean;
  onToggle: () => void;
  searchQuery: string;
}

function SearchResultFile({ result, isExpanded, onToggle, searchQuery }: SearchResultFileProps) {
  return (
    <div className="titan-search-result-file">
      <button
        className={clsx(
          'w-full flex items-center gap-1 px-2 py-1 text-left',
          'hover:bg-search-result-hover'
        )}
        onClick={onToggle}
      >
        <svg
          className={clsx('w-3 h-3 transition-transform', isExpanded && 'rotate-90')}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M4 2L8 6L4 10" />
        </svg>
        <span className="flex-1 truncate text-xs">{result.fileName}</span>
        <span className="text-xs text-search-result-count bg-search-result-count-background px-1.5 rounded-full">
          {result.matches.length}
        </span>
      </button>

      {isExpanded && (
        <div className="pl-4">
          {result.matches.map((match, idx) => (
            <SearchResultMatch key={idx} match={match} searchQuery={searchQuery} />
          ))}
        </div>
      )}
    </div>
  );
}

interface SearchResultMatchProps {
  match: SearchMatch;
  searchQuery: string;
}

function SearchResultMatch({ match, searchQuery }: SearchResultMatchProps) {
  const before = match.lineContent.slice(0, match.matchStart);
  const matched = match.lineContent.slice(match.matchStart, match.matchEnd);
  const after = match.lineContent.slice(match.matchEnd);

  return (
    <button
      className={clsx(
        'w-full flex items-start gap-2 px-2 py-0.5 text-left',
        'hover:bg-search-match-hover text-xs font-mono'
      )}
    >
      <span className="text-search-line-number w-8 text-right flex-shrink-0">
        {match.lineNumber}
      </span>
      <span className="truncate">
        <span className="text-search-match-context">{before}</span>
        <span className="bg-search-match-highlight text-search-match-foreground font-semibold">
          {matched}
        </span>
        <span className="text-search-match-context">{after}</span>
      </span>
    </button>
  );
}

function ReplaceIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M3.646 11.354a.5.5 0 0 1 0-.708L7.293 7H1.5a.5.5 0 0 1 0-1h5.793L3.646 2.354a.5.5 0 1 1 .708-.708l4.5 4.5a.5.5 0 0 1 0 .708l-4.5 4.5a.5.5 0 0 1-.708 0z" />
    </svg>
  );
}

function ReplaceAllIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2.646 11.354a.5.5 0 0 1 0-.708L6.293 7H.5a.5.5 0 0 1 0-1h5.793L2.646 2.354a.5.5 0 1 1 .708-.708l4.5 4.5a.5.5 0 0 1 0 .708l-4.5 4.5a.5.5 0 0 1-.708 0zM8.646 11.354a.5.5 0 0 1 0-.708L12.293 7H6.5a.5.5 0 0 1 0-1h5.793l-3.647-3.646a.5.5 0 0 1 .708-.708l4.5 4.5a.5.5 0 0 1 0 .708l-4.5 4.5a.5.5 0 0 1-.708 0z" />
    </svg>
  );
}
