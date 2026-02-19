'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getAllCommands, searchCommands, executeCommand, type Command } from '@/lib/ide/command-registry';
import { useEditorStore } from '@/stores/editor-store';

type PaletteMode = 'command' | 'file' | 'symbol' | 'line';

interface PaletteEvent {
  mode?: PaletteMode;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PaletteMode>('command');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Command[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { tabs, setActiveTab } = useEditorStore();

  // ── Open via global event ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PaletteEvent>).detail ?? {};
      const m: PaletteMode = detail.mode ?? 'command';
      setMode(m);
      setQuery(m === 'file' ? '' : m === 'line' ? ':' : m === 'symbol' ? '@' : '>');
      setOpen(true);
    };
    window.addEventListener('titan:commandPalette:open', handler);
    return () => window.removeEventListener('titan:commandPalette:open', handler);
  }, []);

  // ── Ctrl+Shift+P / Ctrl+P shortcut ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setMode('command');
        setQuery('>');
        setOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'p') {
        e.preventDefault();
        setMode('file');
        setQuery('');
        setOpen(true);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [open]);

  // ── Search ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    let q = query;

    // Strip prefix characters used for mode detection
    if (q.startsWith('>')) {
      setMode('command');
      q = q.slice(1).trim();
      const cmds = searchCommands(q);
      setResults(cmds);
    } else if (q.startsWith('@')) {
      setMode('symbol');
      setResults([]);
    } else if (q.startsWith(':')) {
      setMode('line');
      setResults([]);
    } else {
      setMode('file');
      // Search open tabs
      const q2 = q.toLowerCase();
      const fileResults = tabs
        .filter((t) => t.name.toLowerCase().includes(q2))
        .map((t) => ({
          id: `__file__${t.name}`,
          label: t.name,
          category: 'File',
          description: t.path,
          execute: () => setActiveTab(t.name),
        })) as unknown as Command[];
      setResults(fileResults);
    }
    setSelectedIdx(0);
  }, [query, open, tabs, setActiveTab]);

  // ── Focus input on open ───────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
      // Reset
      const q = mode === 'command' ? '>' : mode === 'line' ? ':' : mode === 'symbol' ? '@' : '';
      setQuery(q);
      setResults(mode === 'command' ? getAllCommands() : []);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard nav ──────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = results[selectedIdx];
        if (!item) {
          // Line mode – jump to line
          if (mode === 'line') {
            const lineNum = parseInt(query.slice(1));
            if (!isNaN(lineNum)) {
              window.dispatchEvent(new CustomEvent('titan:editor:gotoLine', { detail: lineNum }));
              setOpen(false);
            }
          }
          return;
        }
        setOpen(false);
        if (item.id.startsWith('__file__')) {
          const name = item.id.replace('__file__', '');
          setActiveTab(name);
        } else {
          executeCommand(item.id);
        }
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    },
    [results, selectedIdx, mode, query, setActiveTab]
  );

  // ── Scroll selected into view ────────────────────────────────────────────
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const selected = container.children[selectedIdx] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  if (!open) return null;

  // Group results by category
  const grouped: Record<string, Command[]> = {};
  for (const cmd of results) {
    const cat = cmd.category ?? 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(cmd);
  }

  const flatList: (Command | { separator: true; label: string })[] = [];
  for (const [cat, cmds] of Object.entries(grouped)) {
    flatList.push({ separator: true, label: cat });
    flatList.push(...cmds);
  }

  let cmdIdx = 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 80,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 620,
          background: '#1e1e2e',
          border: '1px solid #313244',
          borderRadius: 8,
          boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
          overflow: 'hidden',
        }}
      >
        {/* Input */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #313244', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#89b4fa', fontSize: 14 }}>
            {mode === 'command' ? '⌘' : mode === 'file' ? '📄' : mode === 'symbol' ? '◈' : '#'}
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'command'
                ? '> Type a command...'
                : mode === 'file'
                ? 'Type a file name...'
                : mode === 'symbol'
                ? '@ Type a symbol...'
                : ': Go to line...'
            }
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#cdd6f4',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
          <span style={{ color: '#45475a', fontSize: 11 }}>Esc to close</span>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{
            maxHeight: 420,
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {flatList.length === 0 && (
            <div style={{ color: '#45475a', padding: '20px 16px', fontSize: 13, textAlign: 'center' }}>
              No results found
            </div>
          )}
          {flatList.map((item, i) => {
            if ('separator' in item) {
              return (
                <div
                  key={`sep-${i}`}
                  style={{
                    padding: '6px 16px 2px',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#45475a',
                    fontWeight: 600,
                  }}
                >
                  {item.label}
                </div>
              );
            }
            const myIdx = cmdIdx++;
            const isSelected = myIdx === selectedIdx;
            return (
              <button
                key={item.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  if (item.id.startsWith('__file__')) {
                    setActiveTab(item.id.replace('__file__', ''));
                  } else {
                    executeCommand(item.id);
                  }
                }}
                onMouseEnter={() => setSelectedIdx(myIdx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '7px 16px',
                  background: isSelected ? '#313244' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#cdd6f4',
                  fontSize: 13,
                  textAlign: 'left',
                  gap: 8,
                  transition: 'background 0.08s',
                }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
                {(item as Command).keybinding && (
                  <span
                    style={{
                      color: '#6c7086',
                      fontSize: 11,
                      whiteSpace: 'nowrap',
                      background: '#181825',
                      padding: '1px 6px',
                      borderRadius: 3,
                      border: '1px solid #313244',
                    }}
                  >
                    {(item as Command).keybinding}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: '1px solid #313244',
            padding: '6px 12px',
            display: 'flex',
            gap: 16,
            fontSize: 11,
            color: '#45475a',
          }}
        >
          <span>↑↓ navigate</span>
          <span>Enter select</span>
          <span>Esc close</span>
          <span style={{ marginLeft: 'auto' }}>
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
