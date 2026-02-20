'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTerminalStore } from '@/stores/terminal-store';
import { useLayoutStore } from '@/stores/layout-store';

let xtermCssLoaded = false;
function loadXtermCss() {
  if (xtermCssLoaded || typeof document === 'undefined') return;
  xtermCssLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css';
  document.head.appendChild(link);
}

export default function IDETerminal() {
  useEffect(() => { loadXtermCss(); }, []);
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
        fontSize: 14,
        fontFamily: "'JetBrains Mono', Consolas, 'Courier New', monospace",
        scrollback,
        cursorStyle: cursorStyle as 'block' | 'underline' | 'bar',
        cursorBlink,
        theme: {
          background: '#1e1e1e',
          foreground: '#cccccc',
          cursor: '#aeafad',
          cursorAccent: '#1e1e1e',
          selectionBackground: '#264f78',
          selectionForeground: '#ffffff',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#e5e5e5',
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

      if (!wcSession) {
        let lineBuffer = '';
        let isRunning = false;
        const prompt = () => term.write('\x1b[32m$\x1b[0m ');
        prompt();

        const executeCommand = async (cmd: string) => {
          if (!cmd) { prompt(); return; }
          if (cmd === 'clear') { term.clear(); prompt(); return; }
          isRunning = true;
          try {
            const res = await fetch('/api/terminal', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ command: cmd, timeout: 30000 }),
            });
            const data = await res.json();
            if (data.error && !data.stdout && !data.stderr) {
              term.writeln(`\x1b[31m${data.error}\x1b[0m`);
            } else {
              if (data.stdout) {
                data.stdout.split('\n').forEach((line: string) => term.writeln(line));
              }
              if (data.stderr) {
                data.stderr.split('\n').forEach((line: string) => term.writeln(`\x1b[31m${line}\x1b[0m`));
              }
              if (data.exitCode !== 0 && data.exitCode !== undefined) {
                term.writeln(`\x1b[90m[exit code: ${data.exitCode}]\x1b[0m`);
              }
            }
          } catch (err) {
            term.writeln(`\x1b[31mFailed to execute: ${err instanceof Error ? err.message : 'Network error'}\x1b[0m`);
          }
          isRunning = false;
          prompt();
        };

        term.onData((data) => {
          if (isRunning) return;
          if (data === '\r') {
            term.write('\r\n');
            executeCommand(lineBuffer.trim());
            lineBuffer = '';
          } else if (data === '\u007f') {
            if (lineBuffer.length > 0) {
              lineBuffer = lineBuffer.slice(0, -1);
              term.write('\b \b');
            }
          } else if (data === '\u0003') {
            lineBuffer = '';
            term.write('^C\r\n');
            prompt();
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e1e1e' }}>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#252526',
          borderBottom: '1px solid #3c3c3c',
          height: 35,
          flexShrink: 0,
          overflowX: 'auto',
        }}
      >
        <div style={{ padding: '0 12px', fontSize: 11, color: '#cccccc', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, whiteSpace: 'nowrap' }}>
          Terminal
        </div>
        <div style={{ flex: 1 }} />
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => setActiveSession(session.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 10px',
              height: '100%',
              background: session.id === activeSessionId ? '#1e1e1e' : 'transparent',
              border: 'none',
              borderBottom: session.id === activeSessionId ? '1px solid #1e1e1e' : '1px solid transparent',
              borderTop: session.id === activeSessionId ? '1px solid #007acc' : '1px solid transparent',
              color: session.id === activeSessionId ? '#cccccc' : '#999999',
              fontSize: 12,
              fontFamily: "'Segoe UI', sans-serif",
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color 0.1s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.8 }}>
              <path d="M1 2.795l.783-.419L8.1 6.18V7.82L1.783 11.623 1 11.205V2.795zm1 .895v5.62L6.6 7 2 3.69zM8.1 2.795l.783-.419L15.2 6.18V7.82l-6.317 3.803-.783-.418V2.795zm1 .895v5.62L13.7 7 9.1 3.69z"/>
            </svg>
            {session.title}
            <span
              onClick={(e) => { e.stopPropagation(); removeSession(session.id); }}
              style={{ marginLeft: 4, color: '#666', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
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
            padding: '0 8px',
            height: '100%',
            background: 'transparent',
            border: 'none',
            color: '#999',
            cursor: 'pointer',
            fontSize: 16,
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', fontSize: 13, fontFamily: "'Segoe UI', sans-serif" }}>
            No terminal sessions. Click + to create one.
          </div>
        )}
      </div>
    </div>
  );
}
