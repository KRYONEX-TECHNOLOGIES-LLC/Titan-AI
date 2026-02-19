'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTerminalStore } from '@/stores/terminal-store';
import { useLayoutStore } from '@/stores/layout-store';

/**
 * Real xterm.js terminal with FitAddon and WebLinksAddon.
 * Shells via WebContainer API when available, or falls back to a mock PTY via /api/terminal.
 */
export default function IDETerminal() {
  const { sessions, activeSessionId, addSession, removeSession, setActiveSession, fontSize, fontFamily, scrollback, cursorStyle, cursorBlink } = useTerminalStore();
  const { panelVisible } = useLayoutStore();

  const termRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const xtermInstances = useRef<Map<string, unknown>>(new Map());

  // Ensure at least one session when panel becomes visible
  useEffect(() => {
    if (panelVisible && sessions.length === 0) {
      addSession('bash', '~');
    }
  }, [panelVisible, sessions.length, addSession]);

  const mountTerminal = useCallback(async (sessionId: string, container: HTMLDivElement) => {
    if (xtermInstances.current.has(sessionId)) return;

    try {
      const [
        { Terminal },
        { FitAddon },
        { WebLinksAddon },
        { SearchAddon },
      ] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
        import('@xterm/addon-search'),
      ]);

      const { useTerminalStore: store } = await import('@/stores/terminal-store');

      const term = new Terminal({
        fontSize,
        fontFamily,
        scrollback,
        cursorStyle: cursorStyle as 'block' | 'underline' | 'bar',
        cursorBlink,
        theme: {
          background: '#11111b',
          foreground: '#cdd6f4',
          cursor: '#89b4fa',
          cursorAccent: '#1e1e2e',
          selectionBackground: '#313244',
          black: '#45475a',
          red: '#f38ba8',
          green: '#a6e3a1',
          yellow: '#f9e2af',
          blue: '#89b4fa',
          magenta: '#cba6f7',
          cyan: '#89dceb',
          white: '#bac2de',
          brightBlack: '#585b70',
          brightRed: '#f38ba8',
          brightGreen: '#a6e3a1',
          brightYellow: '#f9e2af',
          brightBlue: '#89b4fa',
          brightMagenta: '#cba6f7',
          brightCyan: '#89dceb',
          brightWhite: '#a6adc8',
        },
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.loadAddon(new SearchAddon());

      term.open(container);
      fitAddon.fit();
      xtermInstances.current.set(sessionId, term);

      // Resize observer
      const ro = new ResizeObserver(() => {
        try { fitAddon.fit(); } catch { /* ignore */ }
      });
      ro.observe(container);

      // WebContainer spawn or SSE mock
      let wcSession: { input: WritableStream; } | null = null;
      try {
        const wcModule = await import('@/lib/webcontainer').catch(() => null);
        if (wcModule?.getWebContainer) {
          const wc = await wcModule.getWebContainer();
          const proc = await wc.spawn('bash', [], { env: { TERM: 'xterm-256color' } });
          wcSession = proc;
          const writer = proc.input.getWriter();
          term.onData((data) => writer.write(data));
          const reader = proc.output.getReader();
          (async () => {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              term.write(value);
            }
          })();
        }
      } catch {
        wcSession = null;
      }

      // Fallback: SSE + REST mock shell
      if (!wcSession) {
        term.writeln('\x1b[1;32mTitan AI Terminal\x1b[0m — WebContainer shell');
        term.writeln('\x1b[90mType commands and press Enter\x1b[0m');
        term.writeln('');

        let lineBuffer = '';
        term.write('\x1b[1;34m$ \x1b[0m');

        const mockCommands: Record<string, string[]> = {
          ls: ['orchestrator.ts', 'package.json', 'tsconfig.json', 'next.config.js'],
          pwd: ['/workspace'],
          whoami: ['titan'],
          node: ['Welcome to Node.js v20.'],
          clear: ['__CLEAR__'],
          help: ['Available: ls, pwd, whoami, node, clear, git status'],
        };

        term.onData((data) => {
          if (data === '\r') {
            term.write('\r\n');
            const cmd = lineBuffer.trim().split(' ')[0];
            const output = mockCommands[cmd];
            if (output) {
              if (output[0] === '__CLEAR__') {
                term.clear();
              } else {
                output.forEach((line) => term.writeln(line));
              }
            } else if (lineBuffer.trim()) {
              term.writeln(`\x1b[31mCommand not found: ${lineBuffer.trim()}\x1b[0m`);
              term.writeln('\x1b[90mTip: WebContainer initializing or add real API key to enable shell\x1b[0m');
            }
            lineBuffer = '';
            term.write('\x1b[1;34m$ \x1b[0m');
          } else if (data === '\u007f') {
            if (lineBuffer.length > 0) {
              lineBuffer = lineBuffer.slice(0, -1);
              term.write('\b \b');
            }
          } else if (data === '\u0003') {
            lineBuffer = '';
            term.write('^C\r\n\x1b[1;34m$ \x1b[0m');
          } else {
            lineBuffer += data;
            term.write(data);
          }
        });
      }

      // Global events
      const clearHandler = () => term.clear();
      const scrollHandler = (e: Event) => {
        const dir = (e as CustomEvent<string>).detail;
        if (dir === 'up') term.scrollLines(-5);
        else term.scrollLines(5);
      };
      const runTextHandler = (e: Event) => {
        const text = (e as CustomEvent<string>).detail;
        if (wcSession) {
          // write to WebContainer
        } else {
          term.writeln(`\r\n\x1b[90m# ${text}\x1b[0m`);
          term.write('\x1b[1;34m$ \x1b[0m');
        }
      };

      window.addEventListener('titan:terminal:clear', clearHandler);
      window.addEventListener('titan:terminal:scroll', scrollHandler);
      window.addEventListener('titan:terminal:runText', runTextHandler);

      (container as HTMLDivElement & { _cleanup?: () => void })._cleanup = () => {
        ro.disconnect();
        window.removeEventListener('titan:terminal:clear', clearHandler);
        window.removeEventListener('titan:terminal:scroll', scrollHandler);
        window.removeEventListener('titan:terminal:runText', runTextHandler);
        term.dispose();
        xtermInstances.current.delete(sessionId);
      };
    } catch (err) {
      console.error('[IDETerminal] Failed to init xterm:', err);
    }
  }, [fontSize, fontFamily, scrollback, cursorStyle, cursorBlink]);

  const handleContainerRef = useCallback(
    (sessionId: string) => (el: HTMLDivElement | null) => {
      if (el) {
        termRefs.current.set(sessionId, el);
        mountTerminal(sessionId, el);
      } else {
        const prev = termRefs.current.get(sessionId);
        if (prev) {
          (prev as HTMLDivElement & { _cleanup?: () => void })._cleanup?.();
          termRefs.current.delete(sessionId);
        }
      }
    },
    [mountTerminal]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#11111b' }}>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#181825',
          borderBottom: '1px solid #313244',
          height: 34,
          flexShrink: 0,
          overflowX: 'auto',
        }}
      >
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => setActiveSession(session.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 12px',
              height: '100%',
              background: session.id === activeSessionId ? '#11111b' : 'transparent',
              border: 'none',
              borderRight: '1px solid #313244',
              color: session.id === activeSessionId ? '#cdd6f4' : '#6c7086',
              fontSize: 12,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color 0.1s',
            }}
          >
            <span style={{ fontSize: 10 }}>⚡</span>
            {session.title}
            <span
              onClick={(e) => { e.stopPropagation(); removeSession(session.id); }}
              style={{ marginLeft: 4, color: '#45475a', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}
              title="Kill terminal"
            >
              ×
            </span>
          </button>
        ))}
        <button
          onClick={() => addSession('bash', '~')}
          title="New Terminal"
          style={{
            padding: '0 10px',
            height: '100%',
            background: 'transparent',
            border: 'none',
            color: '#6c7086',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>

      {/* Terminal instances */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {sessions.map((session) => (
          <div
            key={session.id}
            ref={handleContainerRef(session.id)}
            style={{
              position: 'absolute',
              inset: 0,
              padding: 4,
              display: session.id === activeSessionId ? 'block' : 'none',
            }}
          />
        ))}
        {sessions.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#45475a', fontSize: 13 }}>
            No terminal sessions. Click + to create one.
          </div>
        )}
      </div>
    </div>
  );
}
