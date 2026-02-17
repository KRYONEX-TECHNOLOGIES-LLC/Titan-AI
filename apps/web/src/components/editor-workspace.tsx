// Editor Workspace Component
// apps/web/src/components/editor-workspace.tsx

'use client';

import React, { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from '@/providers/theme-provider';

interface FileTab {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  isDirty: boolean;
}

export function EditorWorkspace() {
  const { resolvedTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [tabs, setTabs] = useState<FileTab[]>([
    {
      id: 'welcome',
      name: 'welcome.md',
      path: '/welcome.md',
      content: `# Welcome to Titan AI 🚀

The next-generation AI-native IDE is now ready for you.

## Getting Started

1. **Open a file** - Use the file explorer on the left
2. **Ask AI** - Press \`Ctrl+K\` to open the AI chat
3. **Run commands** - Press \`Ctrl+Shift+P\` for the command palette

## Features

- **Multi-Agent Orchestration** - Multiple AI agents work together
- **Speculative Editing** - Fast code generation with verification
- **Semantic Indexing** - Deep understanding of your codebase
- **Shadow Workspaces** - Safe isolated execution

Happy coding! ✨
`,
      language: 'markdown',
      isDirty: false,
    },
  ]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    if (tabs.length > 0 && !activeTab) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  const activeFile = tabs.find((t) => t.id === activeTab);

  const handleEditorChange = (value: string | undefined) => {
    if (!activeTab || value === undefined) return;
    
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTab
          ? { ...tab, content: value, isDirty: true }
          : tab
      )
    );
  };

  const handleCloseTab = (tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeTab === tabId) {
      const remaining = tabs.filter((t) => t.id !== tabId);
      setActiveTab(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-[var(--titan-background)]">
      {/* Title Bar */}
      <header className="h-8 flex items-center justify-between px-4 bg-[var(--titan-background-alt)] border-b border-[var(--titan-border)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold bg-gradient-to-r from-[var(--titan-primary)] to-[var(--titan-accent)] bg-clip-text text-transparent">
            Titan AI
          </span>
        </div>
        <div className="text-xs text-[var(--titan-foreground-muted)]">
          {activeFile?.path || 'No file open'}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--titan-ai-success)]" />
          <span className="text-xs">AI Ready</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar */}
        <aside className="w-12 flex flex-col items-center py-2 bg-[var(--titan-background)] border-r border-[var(--titan-border)]">
          <button
            className={`w-10 h-10 flex items-center justify-center rounded-lg mb-1 ${
              sidebarOpen ? 'bg-[var(--titan-background-alt)]' : ''
            }`}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Explorer"
          >
            📁
          </button>
          <button className="w-10 h-10 flex items-center justify-center rounded-lg mb-1" title="Search">
            🔍
          </button>
          <button className="w-10 h-10 flex items-center justify-center rounded-lg mb-1" title="Git">
            📦
          </button>
          <button className="w-10 h-10 flex items-center justify-center rounded-lg mb-1" title="AI Chat">
            🤖
          </button>
          <div className="flex-1" />
          <button className="w-10 h-10 flex items-center justify-center rounded-lg" title="Settings">
            ⚙️
          </button>
        </aside>

        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-64 flex flex-col bg-[var(--titan-background)] border-r border-[var(--titan-border)]">
            <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--titan-foreground-muted)]">
              Explorer
            </div>
            <div className="flex-1 px-2 overflow-auto">
              <div className="text-sm">
                <div className="py-1 px-2 hover:bg-[var(--titan-background-alt)] rounded cursor-pointer">
                  📄 welcome.md
                </div>
                <div className="py-1 px-2 text-[var(--titan-foreground-muted)] text-xs">
                  Open a folder to get started
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Editor Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Tab Bar */}
          <div className="h-9 flex items-center bg-[var(--titan-background-alt)] border-b border-[var(--titan-border)] overflow-x-auto">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`group flex items-center gap-2 px-3 h-full border-r border-[var(--titan-border)] cursor-pointer text-xs ${
                  activeTab === tab.id
                    ? 'bg-[var(--titan-background)]'
                    : 'hover:bg-[var(--titan-background)]'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.name}</span>
                {tab.isDirty && (
                  <span className="w-2 h-2 rounded-full bg-[var(--titan-ai-accent)]" />
                )}
                <button
                  className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded hover:bg-[var(--titan-background-alt)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Monaco Editor */}
          <div className="flex-1">
            {activeFile ? (
              <Editor
                height="100%"
                language={activeFile.language}
                value={activeFile.content}
                onChange={handleEditorChange}
                theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
                options={{
                  minimap: { enabled: true },
                  fontSize: 14,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontLigatures: true,
                  lineNumbers: 'on',
                  renderWhitespace: 'selection',
                  bracketPairColorization: { enabled: true },
                  automaticLayout: true,
                  padding: { top: 16 },
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-[var(--titan-foreground-muted)]">
                No file open
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Panel */}
      {panelOpen && (
        <div className="h-48 flex flex-col bg-[var(--titan-background)] border-t border-[var(--titan-border)]">
          <div className="flex items-center h-8 px-2 bg-[var(--titan-background-alt)] border-b border-[var(--titan-border)]">
            <button className="px-3 py-1 text-xs bg-[var(--titan-background)] rounded-t">
              Terminal
            </button>
            <button className="px-3 py-1 text-xs">Problems</button>
            <button className="px-3 py-1 text-xs">Output</button>
            <button className="px-3 py-1 text-xs">AI Chat</button>
            <div className="flex-1" />
            <button
              className="p-1 hover:bg-[var(--titan-background)]"
              onClick={() => setPanelOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="flex-1 p-2 font-mono text-sm bg-[var(--titan-editor-background)] overflow-auto">
            <div className="text-[var(--titan-foreground-muted)]">
              $ titan ai init
            </div>
            <div className="text-[var(--titan-ai-success)]">
              ✓ AI workspace initialized
            </div>
            <div className="text-[var(--titan-foreground-muted)]">
              $ _
            </div>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <footer className="h-6 flex items-center justify-between px-2 bg-[var(--titan-primary)] text-[var(--titan-primary-foreground)] text-xs">
        <div className="flex items-center gap-4">
          <span>🚀 main</span>
          <span>0 errors, 0 warnings</span>
        </div>
        <div className="flex items-center gap-4">
          <span>UTF-8</span>
          <span>LF</span>
          <span>{activeFile?.language || 'Plain Text'}</span>
          <span>Ln 1, Col 1</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            Claude 4.6 Sonnet
          </span>
        </div>
      </footer>
    </div>
  );
}
