'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTerminalStore } from '@/stores/terminal-store';
import { useLayoutStore } from '@/stores/layout-store';
import { isElectron, electronAPI } from '@/lib/electron';

let xtermCssLoaded = false;
function loadXtermCss() {
  if (xtermCssLoaded || typeof document === 'undefined') return;
  xtermCssLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css';
  document.head.appendChild(link);
}

// ── Icons ──────────────────────────────────────────────────
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1a.75.75 0 01.75.75v5.5h5.5a.75.75 0 010 1.5h-5.5v5.5a.75.75 0 01-1.5 0v-5.5h-5.5a.75.75 0 010-1.5h5.5v-5.5A.75.75 0 018 1z" />
    </svg>
  );
}
function SplitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M7.25 1H1.75A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h5.5V1zm1.5 0v14h5.5A1.75 1.75 0 0016 13.25V2.75A1.75 1.75 0 0014.25 1h-5.5z" />
    </svg>
  );
}
function MaximizeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2.75 2h10.5c.414 0 .75.336.75.75v10.5a.75.75 0 01-.75.75H2.75a.75.75 0 01-.75-.75V2.75A.75.75 0 012.75 2zM1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0113.25 15H2.75A1.75 1.75 0 011 13.25V2.75z" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
      <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
    </svg>
  );
}
function ShellIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
      <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H1.75zm1.03 3.22a.75.75 0 011.06 0l1.97 1.97v.06l-1.97 1.97a.75.75 0 11-1.06-1.06L4.94 7.5 2.78 5.34a.75.75 0 010-1.06zm3.97 5.28a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5z" />
    </svg>
  );
}
function ChevronDownIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z" />
    </svg>
  );
}

// ── Panel tab labels ───────────────────────────────────────
type PanelTab = 'terminal' | 'problems' | 'output' | 'debug' | 'ports';

export default function IDETerminal() {
  useEffect(() => { loadXtermCss(); }, []);

  const {
    sessions, activeSessionId,
    addSession, removeSession, setActiveSession,
    fontSize, fontFamily, scrollback, cursorStyle, cursorBlink
  } = useTerminalStore();
  const { panelVisible, setPanelView } = useLayoutStore();

  const [panelTab, setPanelTab] = useState<PanelTab>('terminal');
  const [isMaximized, setIsMaximized] = useState(false);

  const termRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const xtermInstances = useRef<Map<string, unknown>>(new Map());

  useEffect(() => {
    if (panelVisible && sessions.length === 0) {
      const isWin = typeof navigator !== 'undefined' && /win/i.test(navigator.platform);
      addSession(isWin ? 'powershell' : 'bash', '~');
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

      const term = new Terminal({
        fontSize: 13,
        fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, 'Courier New', monospace",
        lineHeight: 1.2,
        letterSpacing: 0,
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
      xtermInstances.current.set(sessionId, term);

      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      let ptyReady = false;

      const debouncedFit = () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          try { fitAddon.fit(); } catch { /* ignore */ }
        }, 80);
      };

      const ro = new ResizeObserver(() => { debouncedFit(); });
      ro.observe(container);

      if (isElectron && electronAPI) {
        const cwd = (window as unknown as Record<string, unknown>).__titanWorkspacePath as string || undefined;
        await electronAPI.terminal.create(sessionId, undefined, cwd);

        await new Promise(r => setTimeout(r, 200));
        ptyReady = true;
        fitAddon.fit();

        const unsubData = electronAPI.terminal.onData(sessionId, (data) => {
          term.write(data);
        });

        const unsubExit = electronAPI.terminal.onExit(sessionId, (exitCode) => {
          term.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`);
        });

        term.onData((data) => {
          electronAPI!.terminal.write(sessionId, data);
        });

        term.onResize(({ cols, rows }) => {
          if (!ptyReady) return;
          electronAPI!.terminal.resize(sessionId, cols, rows);
        });

        (container as HTMLDivElement & { _unsubData?: () => void; _unsubExit?: () => void })._unsubData = unsubData;
        (container as HTMLDivElement & { _unsubData?: () => void; _unsubExit?: () => void })._unsubExit = unsubExit;
      } else {
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
                if (data.stdout) data.stdout.split('\n').forEach((line: string) => term.writeln(line));
                if (data.stderr) data.stderr.split('\n').forEach((line: string) => term.writeln(`\x1b[31m${line}\x1b[0m`));
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
              if (lineBuffer.length > 0) { lineBuffer = lineBuffer.slice(0, -1); term.write('\b \b'); }
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
      }

      const clearHandler = () => term.clear();
      const scrollHandler = (e: Event) => {
        const dir = (e as CustomEvent<string>).detail;
        if (dir === 'up') term.scrollLines(-5);
        else term.scrollLines(5);
      };
      const runTextHandler = (e: Event) => {
        const text = (e as CustomEvent<string>).detail;
        term.writeln(`\r\n\x1b[90m# ${text}\x1b[0m`);
        term.write('\x1b[1;34m$ \x1b[0m');
      };

      window.addEventListener('titan:terminal:clear', clearHandler);
      window.addEventListener('titan:terminal:scroll', scrollHandler);
      window.addEventListener('titan:terminal:runText', runTextHandler);

      (container as HTMLDivElement & { _cleanup?: () => void })._cleanup = () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        ro.disconnect();
        window.removeEventListener('titan:terminal:clear', clearHandler);
        window.removeEventListener('titan:terminal:scroll', scrollHandler);
        window.removeEventListener('titan:terminal:runText', runTextHandler);
        if (isElectron && electronAPI) {
          electronAPI.terminal.kill(sessionId).catch(() => {});
          const ext = container as HTMLDivElement & { _unsubData?: () => void; _unsubExit?: () => void };
          ext._unsubData?.();
          ext._unsubExit?.();
        }
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

  const addNewSession = () => {
    const isWin = typeof navigator !== 'undefined' && /win/i.test(navigator.platform);
    addSession(isWin ? 'powershell' : 'bash', '~');
  };

  const PANEL_TABS: { id: PanelTab; label: string }[] = [
    { id: 'problems', label: 'Problems' },
    { id: 'output', label: 'Output' },
    { id: 'debug', label: 'Debug Console' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'ports', label: 'Ports' },
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#1e1e1e',
      userSelect: 'none',
    }}>
      {/* ── Panel tab bar (Problems / Output / Terminal / Ports) ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: '#252526',
        borderBottom: '1px solid #3c3c3c',
        height: 35,
        flexShrink: 0,
        paddingLeft: 8,
      }}>
        {/* Tab labels */}
        <div style={{ display: 'flex', alignItems: 'stretch', height: '100%', flex: 1 }}>
          {PANEL_TABS.map((tab) => {
            const isActive = panelTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setPanelTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  height: '100%',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '1px solid #cccccc' : '1px solid transparent',
                  color: isActive ? '#cccccc' : '#999999',
                  fontSize: 12,
                  fontFamily: "'Segoe UI', -apple-system, sans-serif",
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.1s',
                  letterSpacing: '0.1px',
                  position: 'relative',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 1, paddingRight: 6 }}>
          {panelTab === 'terminal' && (
            <>
              {/* New terminal */}
              <button
                onClick={addNewSession}
                title="New Terminal"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, background: 'transparent', border: 'none',
                  color: '#cccccc', cursor: 'pointer', borderRadius: 4,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#3c3c3c')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <PlusIcon />
              </button>
              {/* Split */}
              <button
                title="Split Terminal"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, background: 'transparent', border: 'none',
                  color: '#cccccc', cursor: 'pointer', borderRadius: 4,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#3c3c3c')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <SplitIcon />
              </button>
              {/* More actions ⋯ */}
              <button
                title="More Actions"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, background: 'transparent', border: 'none',
                  color: '#cccccc', cursor: 'pointer', borderRadius: 4,
                  fontSize: 16, letterSpacing: 1,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#3c3c3c')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                ···
              </button>
            </>
          )}
          {/* Maximize / Restore */}
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            title={isMaximized ? 'Restore Panel Size' : 'Maximize Panel Size'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, background: 'transparent', border: 'none',
              color: '#cccccc', cursor: 'pointer', borderRadius: 4,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#3c3c3c')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {/* ∧ chevron up */}
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.573 8.573l-3.396-3.396a.25.25 0 00-.354 0L4.427 8.573A.25.25 0 004.604 9h6.792a.25.25 0 00.177-.427z" />
            </svg>
          </button>
          {/* Close */}
          <button
            onClick={() => useLayoutStore.setState({ panelVisible: false })}
            title="Close Panel"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, background: 'transparent', border: 'none',
              color: '#cccccc', cursor: 'pointer', borderRadius: 4,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#3c3c3c')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* ── Terminal tab content ── */}
      {panelTab === 'terminal' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {/* Shell session list row (below panel tabs, shows active sessions) */}
          {sessions.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: '#2d2d2d',
              borderBottom: '1px solid #3c3c3c',
              height: 28,
              flexShrink: 0,
              overflowX: 'auto',
              paddingLeft: 4,
            }}>
              <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
                {sessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  return (
                    <div
                      key={session.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        height: '100%',
                        background: isActive ? '#1e1e1e' : 'transparent',
                        borderRight: '1px solid #3c3c3c',
                        position: 'relative',
                      }}
                    >
                      <button
                        onClick={() => setActiveSession(session.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '0 8px 0 10px',
                          height: '100%',
                          background: 'transparent', border: 'none',
                          color: isActive ? '#cccccc' : '#888',
                          fontSize: 11.5,
                          fontFamily: "'Segoe UI', -apple-system, sans-serif",
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        <ShellIcon />
                        <span>{session.title}</span>
                      </button>
                      {/* Kill session */}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeSession(session.id); }}
                        title="Kill Terminal"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 18, height: 18, background: 'transparent', border: 'none',
                          color: '#777', cursor: 'pointer', marginRight: 4, borderRadius: 3,
                          flexShrink: 0,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#4e4e4e'; e.currentTarget.style.color = '#cccccc'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#777'; }}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  );
                })}
              </div>
              {/* Trash / Kill all */}
              <button
                onClick={() => sessions.forEach(s => removeSession(s.id))}
                title="Kill All Terminals"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 26, height: 26, marginLeft: 4,
                  background: 'transparent', border: 'none',
                  color: '#777', cursor: 'pointer', borderRadius: 4,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#3c3c3c')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <TrashIcon />
              </button>
            </div>
          )}

          {/* xterm instances */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
            {sessions.map((session) => (
              <div
                key={session.id}
                ref={handleContainerRef(session.id)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  padding: '4px 6px',
                  display: session.id === activeSessionId ? 'block' : 'none',
                  background: '#1e1e1e',
                }}
              />
            ))}
            {sessions.length === 0 && (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                height: '100%', gap: 12,
              }}>
                <svg width="32" height="32" viewBox="0 0 16 16" fill="#555">
                  <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H1.75zm1.03 3.22a.75.75 0 011.06 0l1.97 1.97v.06l-1.97 1.97a.75.75 0 11-1.06-1.06L4.94 7.5 2.78 5.34a.75.75 0 010-1.06zm3.97 5.28a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5z" />
                </svg>
                <span style={{ color: '#666', fontSize: 12, fontFamily: "'Segoe UI', sans-serif" }}>
                  No terminal sessions
                </span>
                <button
                  onClick={addNewSession}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', background: '#2d2d2d',
                    border: '1px solid #3c3c3c', borderRadius: 4,
                    color: '#cccccc', fontSize: 12, cursor: 'pointer',
                    fontFamily: "'Segoe UI', sans-serif",
                  }}
                >
                  <PlusIcon />
                  New Terminal
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Other panel tabs placeholder content ── */}
      {panelTab === 'problems' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 12, fontFamily: "'Segoe UI', sans-serif" }}>
          No problems detected in the workspace.
        </div>
      )}
      {panelTab === 'output' && (
        <div style={{ flex: 1, padding: '8px 12px', color: '#888', fontSize: 12, fontFamily: "'Cascadia Code', Consolas, monospace", overflowY: 'auto' }}>
          <div style={{ color: '#569cd6' }}>[Titan AI] Output channel ready.</div>
        </div>
      )}
      {panelTab === 'debug' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 12, fontFamily: "'Segoe UI', sans-serif" }}>
          No debugger attached.
        </div>
      )}
      {panelTab === 'ports' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 12, fontFamily: "'Segoe UI', sans-serif" }}>
          No forwarded ports.
        </div>
      )}
    </div>
  );
}
