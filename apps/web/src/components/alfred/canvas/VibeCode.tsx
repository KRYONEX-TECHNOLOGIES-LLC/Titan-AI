'use client';

import React, { useState, useCallback } from 'react';
import { useAlfredCanvas } from '@/stores/alfred-canvas-store';

export function VibeCode() {
  const { content, contentHistory } = useAlfredCanvas();
  const [editedCode, setEditedCode] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const codeItems = contentHistory.filter((c) => c.type === 'code' || c.type === 'vibe');
  const active = content?.type === 'vibe' ? content : content?.type === 'code' ? content : codeItems[codeItems.length - 1];

  const code = editedCode ?? active?.data ?? '';
  const fileName = active?.title || 'sandbox.tsx';

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedCode(e.target.value);
    setSaved(false);
    if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
      setPreviewHtml(e.target.value);
    }
  }, [fileName]);

  const handlePushToWorkspace = useCallback(async () => {
    if (!active?.title || !editedCode) return;
    try {
      await fetch('/api/agent/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'write_file', args: { path: active.title, content: editedCode }, workspacePath: '' }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
  }, [active, editedCode]);

  if (!active) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#555]">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
        </svg>
        <p className="text-[13px] mt-3 text-[#ccc]">Vibe Code</p>
        <p className="text-[10px] text-[#555] mt-1 text-center max-w-[250px]">
          Interactive code sandbox. Edit Alfred&apos;s code live and push changes back to workspace.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a2a] bg-[#1a1a1a]">
        <span className="text-[10px] text-cyan-400 font-mono">{fileName.split('.').pop()}</span>
        <span className="text-[11px] text-[#ccc] truncate flex-1">{fileName}</span>
        {editedCode && (
          <button
            onClick={handlePushToWorkspace}
            className={`px-2.5 py-0.5 rounded text-[10px] font-medium transition-all ${
              saved ? 'bg-green-600/20 text-green-300 border border-green-500/40' : 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-600/30'
            }`}
          >
            {saved ? 'Saved' : 'Push to Workspace'}
          </button>
        )}
      </div>

      {/* Split: editor + preview */}
      <div className="flex-1 flex min-h-0">
        {/* Editor */}
        <div className="flex-1 min-w-0">
          <textarea
            value={code}
            onChange={handleCodeChange}
            className="w-full h-full bg-transparent text-[12px] font-mono text-[#d4d4d4] p-4 resize-none focus:outline-none leading-[1.6]"
            spellCheck={false}
          />
        </div>

        {/* Preview (for HTML/CSS) */}
        {previewHtml && (
          <div className="w-[50%] border-l border-[#2a2a2a] bg-white">
            <iframe
              srcDoc={previewHtml}
              className="w-full h-full border-0"
              sandbox="allow-scripts"
              title="Preview"
            />
          </div>
        )}
      </div>
    </div>
  );
}
