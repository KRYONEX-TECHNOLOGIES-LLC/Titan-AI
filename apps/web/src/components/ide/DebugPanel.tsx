'use client';

import React, { useState } from 'react';
import { useDebugStore } from '@/stores/debug-store';
import { useEditorStore } from '@/stores/editor-store';

const STATUS_COLORS: Record<string, string> = {
  idle: '#45475a',
  initializing: '#f9e2af',
  running: '#a6e3a1',
  stopped: '#f9e2af',
  paused: '#89b4fa',
  terminated: '#f38ba8',
};

const STATUS_LABELS: Record<string, string> = {
  idle: 'Not running',
  initializing: 'Starting...',
  running: 'Running',
  stopped: 'Stopped',
  paused: 'Paused',
  terminated: 'Terminated',
};

type Tab = 'launch' | 'breakpoints' | 'callstack' | 'variables' | 'watch' | 'console';

export default function DebugPanel() {
  const debug = useDebugStore();
  const editor = useEditorStore();
  const [activeTab, setActiveTab] = useState<Tab>('launch');
  const [newWatch, setNewWatch] = useState('');
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'launch', label: 'Launch' },
    { id: 'breakpoints', label: `Breakpoints${editor.breakpoints.length ? ` (${editor.breakpoints.length})` : ''}` },
    { id: 'callstack', label: 'Call Stack' },
    { id: 'variables', label: 'Variables' },
    { id: 'watch', label: 'Watch' },
    { id: 'console', label: 'Console' },
  ];

  const activeConfig = debug.launchConfigs.find((c) => c.id === debug.activeConfigId) ?? debug.launchConfigs[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header / Control bar */}
      <div style={{ padding: '10px 12px 6px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#a6adc8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Run & Debug
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: STATUS_COLORS[debug.status] ?? '#45475a' }}>
              ● {STATUS_LABELS[debug.status] ?? debug.status}
            </span>
          </div>
        </div>

        {/* Debug controls */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={debug.activeConfigId || activeConfig?.id || ''}
            onChange={(e) => debug.setActiveConfig(e.target.value)}
            style={{
              flex: 1,
              background: '#181825',
              border: '1px solid #313244',
              borderRadius: 4,
              color: '#cdd6f4',
              fontSize: 11,
              padding: '4px 6px',
              minWidth: 0,
            }}
          >
            {debug.launchConfigs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Action buttons */}
          {[
            { icon: '▶', title: 'Start Debugging (F5)', action: () => debug.startSession(), disabled: debug.status === 'running' || debug.status === 'paused', color: '#a6e3a1' },
            { icon: '⏹', title: 'Stop (Shift+F5)', action: () => debug.stopSession(), disabled: debug.status === 'idle' || debug.status === 'terminated', color: '#f38ba8' },
            { icon: '↺', title: 'Restart (Ctrl+Shift+F5)', action: () => debug.restart(), disabled: debug.status === 'idle' || debug.status === 'terminated', color: '#f9e2af' },
            { icon: '⏸', title: 'Pause (F6)', action: () => debug.pauseSession(), disabled: debug.status !== 'running', color: '#89b4fa' },
            { icon: '→', title: 'Step Over (F10)', action: () => debug.stepOver(), disabled: debug.status !== 'paused', color: '#cba6f7' },
            { icon: '↓', title: 'Step Into (F11)', action: () => debug.stepInto(), disabled: debug.status !== 'paused', color: '#cba6f7' },
            { icon: '↑', title: 'Step Out (Shift+F11)', action: () => debug.stepOut(), disabled: debug.status !== 'paused', color: '#cba6f7' },
          ].map((btn) => (
            <button
              key={btn.icon}
              title={btn.title}
              onClick={btn.action}
              disabled={btn.disabled}
              style={{
                width: 26,
                height: 26,
                background: '#181825',
                border: '1px solid #313244',
                borderRadius: 4,
                color: btn.disabled ? '#313244' : btn.color,
                cursor: btn.disabled ? 'default' : 'pointer',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {btn.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #313244', flexShrink: 0, overflowX: 'auto' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '5px 10px',
              background: activeTab === tab.id ? '#1e1e2e' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #89b4fa' : '2px solid transparent',
              color: activeTab === tab.id ? '#cdd6f4' : '#6c7086',
              fontSize: 11,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {/* LAUNCH CONFIG */}
        {activeTab === 'launch' && (
          <div style={{ padding: '0 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#a6adc8', fontWeight: 600 }}>Launch Configurations</span>
              <button
                onClick={() => debug.addLaunchConfig({ name: 'New Config', type: 'node', request: 'launch', program: '${workspaceFolder}/index.js' })}
                style={{ background: 'transparent', border: 'none', color: '#89b4fa', cursor: 'pointer', fontSize: 12 }}
              >
                + Add
              </button>
            </div>
            {debug.launchConfigs.map((config) => (
              <div
                key={config.id}
                style={{
                  background: '#181825',
                  border: `1px solid ${debug.activeConfigId === config.id ? '#89b4fa' : '#313244'}`,
                  borderRadius: 6,
                  padding: 10,
                  marginBottom: 8,
                  cursor: 'pointer',
                }}
                onClick={() => debug.setActiveConfig(config.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#cdd6f4', fontWeight: 600 }}>{config.name}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ fontSize: 10, background: '#313244', padding: '1px 6px', borderRadius: 3, color: '#a6adc8' }}>{config.type}</span>
                    <span style={{ fontSize: 10, background: '#313244', padding: '1px 6px', borderRadius: 3, color: '#a6adc8' }}>{config.request}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); debug.removeLaunchConfig(config.id); }}
                      style={{ background: 'transparent', border: 'none', color: '#f38ba8', cursor: 'pointer', fontSize: 12 }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {config.program && (
                  <div style={{ fontSize: 10, color: '#6c7086', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {config.program}
                  </div>
                )}
              </div>
            ))}
            {debug.launchConfigs.length === 0 && (
              <div style={{ color: '#45475a', fontSize: 12, textAlign: 'center', padding: 20 }}>
                No launch configurations.<br />Click + Add to create one.
              </div>
            )}
          </div>
        )}

        {/* BREAKPOINTS */}
        {activeTab === 'breakpoints' && (
          <div>
            <div style={{ display: 'flex', gap: 6, padding: '0 12px', marginBottom: 8 }}>
              <button onClick={() => editor.enableAllBreakpoints()} style={{ ...btnStyle, color: '#a6e3a1' }}>Enable All</button>
              <button onClick={() => editor.disableAllBreakpoints()} style={{ ...btnStyle, color: '#f9e2af' }}>Disable All</button>
              <button onClick={() => editor.removeAllBreakpoints()} style={{ ...btnStyle, color: '#f38ba8' }}>Remove All</button>
            </div>
            {editor.breakpoints.map((bp) => (
              <div
                key={bp.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 12px',
                  opacity: bp.enabled ? 1 : 0.5,
                }}
              >
                <span style={{ fontSize: 12, color: bp.enabled ? '#f38ba8' : '#45475a' }}>⬤</span>
                <span style={{ flex: 1, fontSize: 11, color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {bp.file}:{bp.line}
                </span>
                <button
                  onClick={() => editor.removeBreakpoint(bp.id)}
                  style={{ background: 'transparent', border: 'none', color: '#45475a', cursor: 'pointer', fontSize: 12 }}
                >
                  ✕
                </button>
              </div>
            ))}
            {editor.breakpoints.length === 0 && (
              <div style={{ color: '#45475a', fontSize: 12, textAlign: 'center', padding: 20 }}>
                No breakpoints set.<br />Click in the editor gutter or press F9.
              </div>
            )}
          </div>
        )}

        {/* CALL STACK */}
        {activeTab === 'callstack' && (
          <div>
            {debug.callStack.length === 0 ? (
              <div style={{ color: '#45475a', fontSize: 12, textAlign: 'center', padding: 20 }}>
                {debug.status === 'paused' ? 'Call stack unavailable' : 'Not paused at a breakpoint'}
              </div>
            ) : (
              debug.callStack.map((frame) => (
                <button
                  key={frame.id}
                  onClick={() => debug.setActiveFrame(frame.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    padding: '6px 12px',
                    background: frame.id === debug.activeFrameId ? '#313244' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderBottom: '1px solid #1e1e2e',
                  }}
                >
                  <span style={{ fontSize: 12, color: '#cdd6f4' }}>{frame.name}</span>
                  <span style={{ fontSize: 10, color: '#6c7086' }}>{frame.source}:{frame.line}</span>
                </button>
              ))
            )}
          </div>
        )}

        {/* VARIABLES */}
        {activeTab === 'variables' && (
          <div>
            {Object.keys(debug.variables).length === 0 ? (
              <div style={{ color: '#45475a', fontSize: 12, textAlign: 'center', padding: 20 }}>
                No variables to display
              </div>
            ) : (
              Object.entries(debug.variables).map(([scopeRef, vars]) => (
                <div key={scopeRef}>
                  <div style={{ padding: '4px 12px', fontSize: 10, color: '#6c7086', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Scope {scopeRef}
                  </div>
                  {vars.map((v, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 12px 3px 24px', borderBottom: '1px solid #1e1e2e22' }}>
                      <span style={{ fontSize: 11, color: '#89b4fa', minWidth: 80, flexShrink: 0 }}>{v.name}</span>
                      <span style={{ fontSize: 11, color: '#a6e3a1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.value}</span>
                      <span style={{ fontSize: 10, color: '#45475a', flexShrink: 0 }}>{v.type}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {/* WATCH */}
        {activeTab === 'watch' && (
          <div>
            <div style={{ display: 'flex', gap: 4, padding: '0 12px 8px' }}>
              <input
                value={newWatch}
                onChange={(e) => setNewWatch(e.target.value)}
                placeholder="Add expression..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newWatch.trim()) {
                    debug.addWatchExpression(newWatch.trim());
                    setNewWatch('');
                  }
                }}
                style={{ flex: 1, background: '#181825', border: '1px solid #313244', borderRadius: 4, color: '#cdd6f4', fontSize: 12, padding: '4px 8px', outline: 'none' }}
              />
              <button
                onClick={() => { if (newWatch.trim()) { debug.addWatchExpression(newWatch.trim()); setNewWatch(''); } }}
                style={{ ...btnStyle, color: '#89b4fa' }}
              >
                +
              </button>
            </div>
            {debug.watchExpressions.map((w) => (
              <div key={w.id} style={{ display: 'flex', gap: 8, padding: '4px 12px', borderBottom: '1px solid #1e1e2e22', alignItems: 'center' }}>
                <span style={{ flex: 1, fontSize: 11, color: '#89b4fa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.expression}</span>
                <span style={{ fontSize: 11, color: w.error ? '#f38ba8' : '#a6e3a1', flexShrink: 0 }}>{w.value ?? w.error ?? 'Not available'}</span>
                <button
                  onClick={() => debug.removeWatchExpression(w.id)}
                  style={{ background: 'transparent', border: 'none', color: '#45475a', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>
            ))}
            {debug.watchExpressions.length === 0 && (
              <div style={{ color: '#45475a', fontSize: 12, textAlign: 'center', padding: 16 }}>
                No watch expressions. Type an expression above and press Enter.
              </div>
            )}
          </div>
        )}

        {/* DEBUG CONSOLE */}
        {activeTab === 'console' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
              {debug.debugOutput.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    padding: '2px 12px',
                    color: entry.category === 'stderr' ? '#f38ba8' : entry.type === 'warning' ? '#f9e2af' : '#cdd6f4',
                    borderBottom: '1px solid #1e1e2e22',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {entry.output}
                </div>
              ))}
              {debug.debugOutput.length === 0 && (
                <div style={{ color: '#45475a', fontSize: 12, textAlign: 'center', padding: 20 }}>
                  Debug console output will appear here
                </div>
              )}
            </div>
            <div style={{ borderTop: '1px solid #313244', padding: '4px 8px' }}>
              <button onClick={() => debug.clearDebugOutput()} style={{ ...btnStyle, color: '#6c7086', fontSize: 10 }}>
                Clear Console
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#181825',
  border: '1px solid #313244',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  padding: '3px 8px',
  color: '#cdd6f4',
};
