'use client';

import { useCallback } from 'react';
import dynamic from 'next/dynamic';
import type * as Monaco from 'monaco-editor';
import { getLanguageFromFilename } from '@/utils/file-helpers';
import { useEditorStore } from '@/stores/editor-store';
import type { FileTab } from '@/types/ide';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="flex-1 bg-[#1e1e1e]" />,
});

interface EditorAreaProps {
  tabs: FileTab[];
  activeTab: string;
  fileContents: Record<string, string>;
  setFileContents: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setTabs: React.Dispatch<React.SetStateAction<FileTab[]>>;
  cursorPosition: { line: number; column: number };
  setCursorPosition: (pos: { line: number; column: number }) => void;
  setEditorInstance: (editor: Monaco.editor.IStandaloneCodeEditor | null) => void;
  setMonacoInstance: (monaco: typeof Monaco | null) => void;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  isLoadingFiles: boolean;
  loadingMessage: string;
  onOpenFolder: () => void;
  onOpenCloneDialog: () => void;
  onNewFile: () => void;
}

export default function EditorArea({
  tabs, activeTab, fileContents, setFileContents, setTabs,
  cursorPosition, setCursorPosition, setEditorInstance, setMonacoInstance,
  fontSize, tabSize, wordWrap,
  isLoadingFiles, loadingMessage,
  onOpenFolder, onOpenCloneDialog, onNewFile,
}: EditorAreaProps) {
  const currentFileContent = fileContents[activeTab] || '';
  const currentFileLanguage = getLanguageFromFilename(activeTab);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setFileContents(prev => ({ ...prev, [activeTab]: value }));
      setTabs(prev => prev.map(t => t.name === activeTab ? { ...t, modified: true } : t));
      useEditorStore.getState().loadFileContents({ [activeTab]: value });
    }
  }, [activeTab, setFileContents, setTabs]);

  if (tabs.length === 0) {
    return (
      <div className="flex-1 min-h-0">
        <div className="h-full flex flex-col items-center justify-center text-[#666] bg-[#1e1e1e]">
          {isLoadingFiles ? (
            <>
              <div className="w-8 h-8 border-2 border-[#007acc] border-t-transparent rounded-full animate-spin mb-4"></div>
              <div className="text-sm text-[#808080]">{loadingMessage || 'Loading...'}</div>
            </>
          ) : (
            <>
              <div className="text-6xl mb-4 opacity-20">📂</div>
              <div className="text-xl mb-2 text-[#cccccc]">No Files Open</div>
              <div className="text-sm text-[#555] mb-6">Open a folder, clone a repo, or create a new file to get started</div>
              <div className="flex flex-wrap gap-3 justify-center">
                <button onClick={onOpenFolder} className="px-5 py-2.5 bg-[#007acc] hover:bg-[#005a99] text-white rounded text-sm font-medium transition-colors flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H7.707l-1-1A1.5 1.5 0 0 0 5.586 3H1.5z"/></svg>
                  Open Folder
                </button>
                <button onClick={onOpenCloneDialog} className="px-5 py-2.5 bg-[#3c3c3c] hover:bg-[#4a4a4a] text-[#cccccc] rounded text-sm font-medium transition-colors flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z"/></svg>
                  Clone Repository
                </button>
                <button onClick={onNewFile} className="px-5 py-2.5 bg-[#3c3c3c] hover:bg-[#4a4a4a] text-[#cccccc] rounded text-sm font-medium transition-colors flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1v6H2v2h6v6h2V9h6V7H10V1z"/></svg>
                  New File
                </button>
              </div>
              <div className="mt-8 text-xs text-[#444]">
                <span className="text-[#555]">Ctrl+O</span> Open Folder • <span className="text-[#555]">Ctrl+N</span> New File
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {activeTab && (
        <div className="h-[28px] bg-[#1e1e1e] border-b border-[#3c3c3c] flex items-center justify-between px-3 shrink-0">
          <div className="flex items-center gap-1 text-[12px] text-[#808080]">
            <span className="hover:text-[#cccccc] cursor-pointer">src</span>
            <span className="text-[#555]">&gt;</span>
            <span className="text-[#cccccc]">{activeTab}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#808080]">
            <span>Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
            <span>{currentFileLanguage.toUpperCase()}</span>
            <span>UTF-8</span>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          path={activeTab}
          language={currentFileLanguage}
          theme="vs-dark"
          value={currentFileContent}
          onChange={handleEditorChange}
          options={{
            fontSize, tabSize,
            wordWrap: wordWrap ? 'on' : 'off',
            fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            cursorBlinking: 'smooth',
            renderValidationDecorations: 'off' as const,
            overviewRulerBorder: false,
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
          }}
          onMount={(editor, monaco) => {
            setEditorInstance(editor);
            setMonacoInstance(monaco);
            editor.onDidChangeCursorPosition((e) => {
              setCursorPosition({ line: e.position.lineNumber, column: e.position.column });
            });
            monaco.editor.defineTheme('titan-dark', {
              base: 'vs-dark',
              inherit: true,
              rules: [],
              colors: {
                'editor.background': '#1e1e1e',
                'editor.foreground': '#cccccc',
                'editorCursor.foreground': '#ffffff',
                'editor.lineHighlightBackground': '#2a2a2a',
                'editorLineNumber.foreground': '#5a5a5a',
                'editorLineNumber.activeForeground': '#cccccc',
                'editorError.foreground': '#00000000',
                'editorError.background': '#00000000',
                'editorError.border': '#00000000',
                'editorWarning.foreground': '#00000000',
                'editorWarning.background': '#00000000',
                'editorWarning.border': '#00000000',
                'editorInfo.foreground': '#00000000',
                'editorInfo.background': '#00000000',
                'editorInfo.border': '#00000000',
                'editorHint.foreground': '#00000000',
                'editorHint.border': '#00000000',
                'editorOverviewRuler.errorForeground': '#00000000',
                'editorOverviewRuler.warningForeground': '#00000000',
                'editorOverviewRuler.infoForeground': '#00000000',
                'editorOverviewRuler.border': '#00000000',
                'editorOverviewRuler.background': '#1e1e1e',
                'editorOverviewRuler.currentContentForeground': '#00000000',
                'editorOverviewRuler.incomingContentForeground': '#00000000',
                'editorOverviewRuler.commonContentForeground': '#00000000',
                'minimap.errorHighlight': '#00000000',
                'minimap.warningHighlight': '#00000000',
                'minimap.background': '#1e1e1e',
                'editorUnnecessaryCode.border': '#00000000',
                'editorUnnecessaryCode.opacity': '#00000000',
              },
            });
            monaco.editor.setTheme('titan-dark');
            monaco.languages.typescript?.typescriptDefaults?.setDiagnosticsOptions({
              noSemanticValidation: true,
              noSyntaxValidation: true,
              noSuggestionDiagnostics: true,
            });
            monaco.languages.typescript?.javascriptDefaults?.setDiagnosticsOptions({
              noSemanticValidation: true,
              noSyntaxValidation: true,
              noSuggestionDiagnostics: true,
            });
            const style = document.createElement('style');
            style.textContent = `
              .diff-line-added { background-color: rgba(63, 185, 80, 0.2) !important; }
              .diff-line-removed { background-color: rgba(248, 81, 73, 0.2) !important; }
              .diff-glyph-added { background-color: #3fb950; width: 4px !important; margin-left: 3px; }
              .diff-glyph-removed { background-color: #f85149; width: 4px !important; margin-left: 3px; }
              .diff-line-decoration-added { background-color: #3fb950; width: 3px !important; }
              .diff-line-decoration-removed { background-color: #f85149; width: 3px !important; }
            `;
            document.head.appendChild(style);
          }}
        />
      </div>
    </>
  );
}
