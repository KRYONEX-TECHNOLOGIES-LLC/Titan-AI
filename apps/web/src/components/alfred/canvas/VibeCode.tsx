'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useAlfredCanvas } from '@/stores/alfred-canvas-store';
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview,
} from '@codesandbox/sandpack-react';

type SandpackTemplate = 'react' | 'vanilla' | 'static';

function detectTemplate(fileName: string, code: string): SandpackTemplate {
  if (fileName.endsWith('.html') || fileName.endsWith('.htm')) return 'static';
  if (code.includes('import React') || code.includes('from "react"') || code.includes("from 'react'") || fileName.endsWith('.tsx') || fileName.endsWith('.jsx'))
    return 'react';
  return 'vanilla';
}

function buildSandpackFiles(fileName: string, code: string, template: SandpackTemplate): Record<string, string> {
  if (template === 'static') {
    return { '/index.html': code };
  }
  if (template === 'react') {
    const entryPath = fileName.startsWith('/') ? fileName : `/${fileName}`;
    const hasDefaultExport = /export\s+default\s/.test(code) || /export\s*\{[^}]*default[^}]*\}/.test(code);
    if (hasDefaultExport && entryPath !== '/App.tsx' && entryPath !== '/App.jsx') {
      return {
        [entryPath]: code,
        '/App.tsx': `import Component from '${entryPath.replace(/\.(tsx?|jsx?)$/, '')}';\nexport default function App() { return <Component />; }`,
      };
    }
    if (entryPath === '/App.tsx' || entryPath === '/App.jsx') {
      return { [entryPath]: code };
    }
    return { '/App.tsx': code };
  }
  const ext = fileName.split('.').pop() || 'js';
  return { [`/index.${ext}`]: code };
}

export function VibeCode() {
  const { content, contentHistory, pushContent } = useAlfredCanvas();
  const [saved, setSaved] = useState(false);

  const codeItems = contentHistory.filter((c) => c.type === 'code' || c.type === 'vibe');
  const active = content?.type === 'vibe' ? content : content?.type === 'code' ? content : codeItems[codeItems.length - 1];

  const code = active?.data ?? '';
  const fileName = active?.title || 'App.tsx';

  const template = useMemo(() => detectTemplate(fileName, code), [fileName, code]);
  const files = useMemo(() => buildSandpackFiles(fileName, code, template), [fileName, code, template]);

  const handlePushToWorkspace = useCallback(async () => {
    if (!active?.title) return;
    try {
      await fetch('/api/agent/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'write_file', args: { path: active.title, content: code }, workspacePath: '' }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
  }, [active, code]);

  const handleRunAsSimulation = useCallback(() => {
    if (!code) return;
    pushContent({
      type: 'simulation',
      title: fileName,
      data: code,
      timestamp: Date.now(),
      meta: { language: fileName.split('.').pop() },
    });
  }, [code, fileName, pushContent]);

  if (!active) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#555] bg-[#0d0d0d]">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
        </svg>
        <p className="text-[13px] mt-3 text-[#ccc]">Vibe Code</p>
        <p className="text-[10px] text-[#555] mt-1 text-center max-w-[250px]">
          Live code sandbox with preview. Ask Alfred to build something and it appears here instantly.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a2a] bg-[#1a1a1a]">
        <span className="text-[10px] text-cyan-400 font-mono">{fileName.split('.').pop()}</span>
        <span className="text-[11px] text-[#ccc] truncate flex-1">{fileName}</span>
        <button
          onClick={handleRunAsSimulation}
          className="px-2.5 py-0.5 rounded text-[10px] font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 transition-all"
        >
          Run
        </button>
        <button
          onClick={handlePushToWorkspace}
          className={`px-2.5 py-0.5 rounded text-[10px] font-medium transition-all ${
            saved ? 'bg-green-600/20 text-green-300 border border-green-500/40' : 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-600/30'
          }`}
        >
          {saved ? 'Saved' : 'Push to Workspace'}
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <SandpackProvider
          template={template === 'static' ? 'static' : template === 'react' ? 'react-ts' : 'vanilla-ts'}
          files={files}
          theme="dark"
          options={{ externalResources: [], recompileMode: 'delayed', recompileDelay: 400 }}
        >
          <SandpackLayout style={{ height: '100%', border: 'none', borderRadius: 0 }}>
            <SandpackCodeEditor
              style={{ flex: 1, minWidth: 0 }}
              showLineNumbers
              showTabs={Object.keys(files).length > 1}
              wrapContent
            />
            <SandpackPreview
              style={{ flex: 1, minWidth: 0 }}
              showOpenInCodeSandbox={false}
              showRefreshButton
            />
          </SandpackLayout>
        </SandpackProvider>
      </div>
    </div>
  );
}
