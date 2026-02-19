'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useLayoutStore } from '@/stores/layout-store';

interface SearchResult {
  file: string;
  path: string;
  line: number;
  column: number;
  preview: string;
  score: number;
  matchType: 'exact' | 'fuzzy' | 'semantic';
}

interface IndexedSymbol {
  name: string;
  file: string;
  path: string;
  line: number;
  kind: string;
  preview: string;
}

export default function SemanticSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [symbols, setSymbols] = useState<IndexedSymbol[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const [matchWord, setMatchWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const { fileTree, workspaceOpen } = useFileStore();
  const { openTab, updateFileContent, fileContents } = useEditorStore();
  const { setSidebarView } = useLayoutStore();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Search ──────────────────────────────────────────────────────────────────
  const performSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) { setResults([]); return; }
      setIsSearching(true);

      try {
        // 1. Try vector/semantic search via API
        const vectorRes = await fetch('/api/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ op: 'semanticSearch', query: q, limit: 20 }),
        }).catch(() => null);

        if (vectorRes?.ok) {
          const { results: apiResults } = await vectorRes.json();
          setResults((apiResults ?? []).map((r: SearchResult) => ({ ...r, matchType: 'semantic' })));
          setIsSearching(false);
          return;
        }
      } catch { /* fall through to fuzzy */ }

      // 2. Fuzzy search over in-memory file contents
      const allResults: SearchResult[] = [];
      const searchStr = matchCase ? q : q.toLowerCase();

      for (const [name, content] of Object.entries(fileContents)) {
        const lines = content.split('\n');
        lines.forEach((rawLine, i) => {
          const line = matchCase ? rawLine : rawLine.toLowerCase();
          let matches = false;

          if (useRegex) {
            try { matches = new RegExp(searchStr).test(line); } catch { matches = false; }
          } else if (matchWord) {
            matches = new RegExp(`\\b${escapeRegex(searchStr)}\\b`).test(line);
          } else {
            matches = line.includes(searchStr);
          }

          if (matches) {
            const col = line.indexOf(searchStr);
            allResults.push({
              file: name,
              path: `/${name}`,
              line: i + 1,
              column: col,
              preview: rawLine.trim().slice(0, 120),
              score: rawLine.toLowerCase().startsWith(searchStr) ? 2 : 1,
              matchType: 'exact',
            });
          }
        });
      }

      // Sort by score
      allResults.sort((a, b) => b.score - a.score);
      setResults(allResults.slice(0, 100));
      setIsSearching(false);
    },
    [fileContents, matchCase, matchWord, useRegex]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, performSearch]);

  // ── Load symbols ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceOpen) return;
    fetch('/api/workspace?op=symbols')
      .then((r) => r.json())
      .then((data) => setSymbols(data.symbols ?? []))
      .catch(() => setSymbols([]));
  }, [workspaceOpen]);

  // ── Open result ─────────────────────────────────────────────────────────────
  const openResult = useCallback((result: SearchResult) => {
    const ext = result.file.split('.').pop()?.toLowerCase() ?? '';
    const langMap: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', py: 'python', rs: 'rust', go: 'go', json: 'json', md: 'markdown', css: 'css', html: 'html' };
    openTab({ name: result.file, path: result.path, icon: ext.slice(0, 3).toUpperCase() || 'TXT', color: '#888', modified: false, language: langMap[ext] ?? 'plaintext' });
    // Signal editor to go to line
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('titan:editor:gotoLine', { detail: result.line }));
    }, 100);
  }, [openTab]);

  // ── Replace all ─────────────────────────────────────────────────────────────
  const replaceAll = useCallback(() => {
    if (!query || !replaceQuery) return;
    let count = 0;
    const regex = useRegex
      ? new RegExp(query, matchCase ? 'g' : 'gi')
      : new RegExp(escapeRegex(query), matchCase ? 'g' : 'gi');
    for (const [name, content] of Object.entries(fileContents)) {
      const newContent = content.replace(regex, replaceQuery);
      if (newContent !== content) {
        updateFileContent(name, newContent);
        count++;
      }
    }
    alert(`Replaced in ${count} file(s)`);
    performSearch(query);
  }, [query, replaceQuery, useRegex, matchCase, fileContents, updateFileContent, performSearch]);

  // Group results by file
  const grouped: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!grouped[r.file]) grouped[r.file] = [];
    grouped[r.file].push(r);
  }

  const totalMatches = results.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 12px 6px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#a6adc8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Search
          </span>
          <button
            onClick={() => setShowReplace(!showReplace)}
            title="Toggle Replace"
            style={{ background: 'transparent', border: 'none', color: showReplace ? '#89b4fa' : '#6c7086', cursor: 'pointer', fontSize: 13, padding: 2 }}
          >
            ⇄
          </button>
        </div>

        {/* Search input */}
        <div style={{ position: 'relative', marginBottom: 6 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search (Ctrl+Shift+F)"
            style={{
              width: '100%',
              background: '#181825',
              border: '1px solid #313244',
              borderRadius: 4,
              color: '#cdd6f4',
              fontSize: 12,
              padding: '5px 72px 5px 8px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') performSearch(query);
              if (e.key === 'Escape') { setQuery(''); setResults([]); }
            }}
          />
          <div style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 2 }}>
            {[
              { label: 'Aa', title: 'Match Case', active: matchCase, toggle: () => setMatchCase(!matchCase) },
              { label: '\\b', title: 'Match Whole Word', active: matchWord, toggle: () => setMatchWord(!matchWord) },
              { label: '.*', title: 'Use Regex', active: useRegex, toggle: () => setUseRegex(!useRegex) },
            ].map((btn) => (
              <button
                key={btn.label}
                title={btn.title}
                onClick={btn.toggle}
                style={{
                  width: 20,
                  height: 20,
                  background: btn.active ? '#313244' : 'transparent',
                  border: btn.active ? '1px solid #89b4fa' : '1px solid transparent',
                  borderRadius: 3,
                  color: btn.active ? '#89b4fa' : '#6c7086',
                  cursor: 'pointer',
                  fontSize: 9,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Replace input */}
        {showReplace && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <input
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              placeholder="Replace..."
              style={{
                flex: 1,
                background: '#181825',
                border: '1px solid #313244',
                borderRadius: 4,
                color: '#cdd6f4',
                fontSize: 12,
                padding: '5px 8px',
                outline: 'none',
              }}
            />
            <button
              onClick={replaceAll}
              disabled={!query || !replaceQuery}
              style={{
                background: '#313244',
                border: '1px solid #45475a',
                borderRadius: 4,
                color: '#cdd6f4',
                fontSize: 11,
                padding: '4px 8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Replace All
            </button>
          </div>
        )}
      </div>

      {/* Status */}
      {query && (
        <div style={{ padding: '2px 12px 6px', fontSize: 11, color: '#6c7086', flexShrink: 0 }}>
          {isSearching ? 'Searching...' : `${totalMatches} result${totalMatches !== 1 ? 's' : ''} in ${Object.keys(grouped).length} file${Object.keys(grouped).length !== 1 ? 's' : ''}`}
        </div>
      )}

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {Object.entries(grouped).map(([file, fileResults]) => (
          <div key={file}>
            {/* File header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                background: '#181825',
                borderBottom: '1px solid #1e1e2e',
                position: 'sticky',
                top: 0,
                zIndex: 1,
              }}
            >
              <span style={{ fontSize: 10 }}>📄</span>
              <span style={{ fontSize: 11, color: '#a6adc8', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file}
              </span>
              <span style={{ fontSize: 10, color: '#45475a', flexShrink: 0 }}>
                {fileResults.length}
              </span>
            </div>

            {/* Matches */}
            {fileResults.map((result, i) => (
              <button
                key={i}
                onClick={() => openResult(result)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  width: '100%',
                  padding: '4px 12px 4px 24px',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: '#cdd6f4',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1e1e2e'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <span style={{ color: '#45475a', fontSize: 11, flexShrink: 0, minWidth: 32, textAlign: 'right', marginTop: 1 }}>
                  {result.line}
                </span>
                <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#cdd6f4' }}>
                  <HighlightMatch text={result.preview} query={query} />
                </span>
              </button>
            ))}
          </div>
        ))}

        {!query && symbols.length > 0 && (
          <div style={{ padding: '8px 12px' }}>
            <div style={{ fontSize: 10, color: '#45475a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Workspace Symbols ({symbols.length})
            </div>
            {symbols.slice(0, 30).map((sym, i) => (
              <button
                key={i}
                onClick={() => openResult({ file: sym.file, path: sym.path, line: sym.line, column: 0, preview: sym.preview, score: 1, matchType: 'semantic' })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '3px 4px',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1e1e2e'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 9, color: '#cba6f7', width: 16, textAlign: 'center' }}>
                  {sym.kind === 'function' ? 'ƒ' : sym.kind === 'class' ? 'C' : sym.kind === 'interface' ? 'I' : '◈'}
                </span>
                <span style={{ fontSize: 12, color: '#cdd6f4', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sym.name}
                </span>
                <span style={{ fontSize: 10, color: '#45475a', flexShrink: 0 }}>
                  {sym.file}:{sym.line}
                </span>
              </button>
            ))}
          </div>
        )}

        {query && results.length === 0 && !isSearching && (
          <div style={{ padding: 20, textAlign: 'center', color: '#45475a', fontSize: 12 }}>
            No results for "{query}"
          </div>
        )}
      </div>
    </div>
  );
}

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} style={{ background: '#f9e2af44', color: '#f9e2af', borderRadius: 2 }}>{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
