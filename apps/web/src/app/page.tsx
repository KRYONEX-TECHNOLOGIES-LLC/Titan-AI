'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type * as Monaco from 'monaco-editor';

// Types
import type { FileTab, PendingDiff } from '@/types/ide';

// Hooks
import { useChat } from '@/hooks/useChat';
import { useSessions } from '@/hooks/useSessions';
import { useSettings } from '@/hooks/useSettings';
import { useMidnight } from '@/hooks/useMidnight';
import { useFileSystem } from '@/hooks/useFileSystem';
import { useAutoContext } from '@/hooks/useAutoContext';

// Utils
import { getFileInfo, getLanguageFromFilename } from '@/utils/file-helpers';

// Components
import ChatMessage from '@/components/ide/ChatMessage';
import { ErrorBoundary } from '@/components/ide/ErrorBoundary';

const FactoryView = dynamic(() => import('@/components/midnight/FactoryView'), { ssr: false });
const TrustSlider = dynamic(() => import('@/components/midnight/TrustSlider'), { ssr: false });
const IDEMenuBar = dynamic(() => import('@/components/ide/MenuBar'), { ssr: false });
const IDECommandPalette = dynamic(() => import('@/components/ide/CommandPalette'), { ssr: false });
const IDEKeybindingService = dynamic(() => import('@/components/ide/KeybindingService'), { ssr: false });
const IDETerminal = dynamic(() => import('@/components/ide/IDETerminal'), { ssr: false });
const IDEFileExplorer = dynamic(() => import('@/components/ide/FileExplorer'), { ssr: false });
const IDESemanticSearch = dynamic(() => import('@/components/ide/SemanticSearch'), { ssr: false });
const IDEDebugPanel = dynamic(() => import('@/components/ide/DebugPanel'), { ssr: false });
const IDEGitPanel = dynamic(() => import('@/components/ide/GitPanel'), { ssr: false });
const IDECloneRepoDialog = dynamic(() => import('@/components/ide/CloneRepoDialog'), { ssr: false });
const EditorArea = dynamic(() => import('@/components/ide/EditorArea'), { ssr: false });
const TitleBar = dynamic(() => import('@/components/ide/TitleBar'), { ssr: false });
const StatusBar = dynamic(() => import('@/components/ide/StatusBar'), { ssr: false });

// Zustand stores
import { useLayoutStore } from '@/stores/layout-store';
import { useEditorStore } from '@/stores/editor-store';
import { useFileStore } from '@/stores/file-store';
import { useTerminalStore } from '@/stores/terminal-store';
import { useDebugStore } from '@/stores/debug-store';
import { initCommandRegistry } from '@/lib/ide/command-registry';
import { isElectron, electronAPI } from '@/lib/electron';

/* ═══ MAIN IDE COMPONENT ═══ */
export default function TitanIDE() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Zustand stores
  useLayoutStore();
  useEditorStore();
  useFileStore();
  useTerminalStore();
  useDebugStore();

  useEffect(() => {
    initCommandRegistry({
      layout: useLayoutStore.getState,
      editor: useEditorStore.getState,
      file: useFileStore.getState,
      terminal: useTerminalStore.getState,
      debug: useDebugStore.getState,
    });
  }, []);

  // Layout state
  const [activeView, setActiveView] = useState<string>('titan-agent');
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showCloneDialog, setShowCloneDialog] = useState(false);

  // Editor state
  const [editorInstance, setEditorInstance] = useState<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [monacoInstance, setMonacoInstance] = useState<typeof Monaco | null>(null);
  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [activeTab, setActiveTab] = useState('');
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [pendingDiff, setPendingDiff] = useState<PendingDiff | null>(null);

  // Menu state
  const [showPlusDropdown, setShowPlusDropdown] = useState(false);

  // Git state
  const [gitBranch, setGitBranch] = useState('main');

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Sync layout store
  useEffect(() => {
    if (!mounted) return;
    const unsub = useLayoutStore.subscribe((state) => {
      setActiveView(state.sidebarView || '');
      setShowTerminal(state.panelVisible && state.panelView === 'terminal');
      setShowRightPanel(state.rightPanelVisible);
    });
    return unsub;
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    useLayoutStore.setState({ sidebarView: activeView as import('@/stores/layout-store').SidebarView, sidebarVisible: !!activeView });
  }, [activeView, mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (showTerminal) useLayoutStore.setState({ panelVisible: true, panelView: 'terminal' });
    else useLayoutStore.setState({ panelVisible: false });
  }, [showTerminal, mounted]);

  // Composed hooks
  const settings = useSettings(mounted);
  const midnight = useMidnight(mounted, settings.activeModel);
  const { sessions, setSessions, activeSessionId, setActiveSessionId, currentSession, handleNewAgent, handleRenameSession, handleDeleteSession } = useSessions(mounted);
  const fileSystem = useFileSystem(setTabs, setActiveTab, setFileContents, setActiveView, activeView);
  const autoContext = useAutoContext(editorInstance, activeTab, fileSystem.workspacePath);

  // Expose workspace path globally for terminal component
  useEffect(() => {
    if (fileSystem.workspacePath) {
      (window as unknown as Record<string, unknown>).__titanWorkspacePath = fileSystem.workspacePath;
    }
  }, [fileSystem.workspacePath]);

  // Sync: when FileExplorer opens a file via editor store, update page.tsx local state
  useEffect(() => {
    if (!mounted) return;
    const unsub = useEditorStore.subscribe((state, prev) => {
      if (state.tabs !== prev.tabs) {
          setTabs(state.tabs);
        }
      if (state.activeTab !== prev.activeTab) {
        setActiveTab(state.activeTab);
      }
      if (state.fileContents !== prev.fileContents) {
        setFileContents(prevLocal => {
          const merged = { ...prevLocal };
          for (const key of Object.keys(state.fileContents)) {
            if (!(key in merged) || merged[key] !== state.fileContents[key]) {
              merged[key] = state.fileContents[key];
            }
          }
          return merged;
        });
      }
    });
    return unsub;
  }, [mounted]);

  // Diff decorations
  const applyDiffDecorations = useCallback((oldContent: string, newContent: string) => {
    if (!editorInstance || !monacoInstance) return;
    const model = editorInstance.getModel();
    if (!model) return;
    if (pendingDiff?.decorationIds) {
      editorInstance.deltaDecorations(pendingDiff.decorationIds, []);
    }
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];
    const maxLines = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLines; i++) {
      if (oldLines[i] !== newLines[i]) {
        if (oldLines[i] !== undefined) {
          decorations.push({
            range: new monacoInstance.Range(i + 1, 1, i + 1, 1),
            options: { isWholeLine: true, className: 'diff-line-removed', glyphMarginClassName: 'diff-glyph-removed', linesDecorationsClassName: 'diff-line-decoration-removed', overviewRuler: { color: '#f85149', position: monacoInstance.editor.OverviewRulerLane.Full } },
          });
        }
        if (newLines[i] !== undefined) {
          decorations.push({
            range: new monacoInstance.Range(i + 1, 1, i + 1, 1),
            options: { isWholeLine: true, className: 'diff-line-added', glyphMarginClassName: 'diff-glyph-added', linesDecorationsClassName: 'diff-line-decoration-added', overviewRuler: { color: '#3fb950', position: monacoInstance.editor.OverviewRulerLane.Full } },
          });
        }
      }
    }
    const decorationIds = editorInstance.deltaDecorations([], decorations);
    setPendingDiff({ file: activeTab, oldContent, newContent, decorationIds });
  }, [editorInstance, monacoInstance, activeTab, pendingDiff]);

  // Terminal history tracking for agent context
  const terminalHistoryRef = useRef<Array<{ command: string; output?: string; exitCode: number }>>([]);

  const handleTerminalCommand = useCallback((command: string, output: string, exitCode: number) => {
    setShowTerminal(true);
    useLayoutStore.setState({ panelVisible: true, panelView: 'terminal' });
    terminalHistoryRef.current = [
      ...terminalHistoryRef.current.slice(-9),
      { command, output: output.slice(0, 500), exitCode },
    ];
  }, []);

  const handleAgentFileEdited = useCallback((filePath: string, newContent: string) => {
    setFileContents(prev => ({ ...prev, [filePath]: newContent }));
    useEditorStore.getState().loadFileContents({ [filePath]: newContent });

    const info = getFileInfo(filePath);
    setTabs(prev => {
      if (prev.find(t => t.name === filePath)) {
        return prev.map(t => t.name === filePath ? { ...t, modified: false } : t);
      }
      return [...prev, { name: filePath, icon: info.icon, color: info.color, modified: false }];
    });
    setActiveTab(filePath);

    if (editorInstance) {
      const model = editorInstance.getModel();
      if (model && filePath === activeTab) model.setValue(newContent);
    }

    if (electronAPI) {
      electronAPI.fs.writeFile(filePath, newContent).catch(err =>
        console.error('[handleAgentFileEdited] Disk write failed:', err)
      );
    }
  }, [activeTab, editorInstance]);

  const handleAgentFileCreated = useCallback((filePath: string, content: string) => {
    const info = getFileInfo(filePath);
    setFileContents(prev => ({ ...prev, [filePath]: content }));
    useEditorStore.getState().loadFileContents({ [filePath]: content });

    setTabs(prev => {
      if (prev.find(t => t.name === filePath)) return prev;
      return [...prev, { name: filePath, icon: info.icon, color: info.color, modified: false }];
    });
    setActiveTab(filePath);

    // Add new file to the file explorer tree
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1] || filePath;
    const store = useFileStore.getState();
    const newNode = { name: fileName, path: filePath, type: 'file' as const };
    if (parts.length === 1) {
      store.setFileTree([...store.fileTree, newNode]);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      store.expandPath(parentPath);
      function insertIntoTree(nodes: typeof store.fileTree): typeof store.fileTree {
        return nodes.map(n => {
          if (n.type === 'folder' && n.path === parentPath) {
            return { ...n, children: [...(n.children || []), newNode] };
          }
          if (n.type === 'folder' && n.children) {
            return { ...n, children: insertIntoTree(n.children) };
          }
          return n;
        });
      }
      store.setFileTree(insertIntoTree(store.fileTree));
    }

    if (electronAPI) {
      electronAPI.fs.writeFile(filePath, content).catch(err =>
        console.error('[handleAgentFileCreated] Disk write failed:', err)
      );
    } else if (fileSystem.directoryHandle) {
      fileSystem.writeFile(filePath, content).catch(err =>
        console.error('[handleAgentFileCreated] FS write failed:', err)
      );
    }
  }, [fileSystem]);

  const chat = useChat({
    sessions, setSessions, activeSessionId,
    activeModel: settings.activeModel, activeTab, fileContents, editorInstance,
    onTerminalCommand: handleTerminalCommand,
    onFileEdited: handleAgentFileEdited,
    onFileCreated: handleAgentFileCreated,
    workspacePath: fileSystem.workspacePath,
    openTabs: tabs.map(t => t.name),
    terminalHistory: terminalHistoryRef.current,
    cursorPosition: autoContext.cursorPosition || undefined,
    linterDiagnostics: autoContext.linterDiagnostics,
    recentlyEditedFiles: autoContext.recentlyEditedFiles,
    recentlyViewedFiles: autoContext.recentlyViewedFiles,
    isDesktop: autoContext.isDesktop,
    osPlatform: autoContext.osPlatform,
  });

  // Apply changes
  const handleApplyChanges = useCallback(() => {
    if (pendingDiff && editorInstance && monacoInstance) {
      const model = editorInstance.getModel();
      if (model) {
        if (pendingDiff.decorationIds.length > 0) editorInstance.deltaDecorations(pendingDiff.decorationIds, []);
        model.setValue(pendingDiff.newContent);
        setFileContents(prev => ({ ...prev, [pendingDiff.file]: pendingDiff.newContent }));
        setTabs(prev => prev.map(t => t.name === pendingDiff.file ? { ...t, modified: true } : t));
        setPendingDiff(null);
      }
    }
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, changedFiles: [] } : s));
  }, [pendingDiff, editorInstance, monacoInstance, activeSessionId, setSessions]);

  // Editor commands
  const executeCommand = useCallback((command: string) => {
    switch (command) {
      case 'newFile': {
        const newFileName = `untitled-${Date.now()}.ts`;
        setFileContents(prev => ({ ...prev, [newFileName]: '// New file\n' }));
        const info = getFileInfo(newFileName);
        setTabs(prev => [...prev, { name: newFileName, icon: info.icon, color: info.color }]);
        setActiveTab(newFileName);
        return;
      }
      case 'file.openFolder': return fileSystem.openFolder();
      case 'file.openFile': return fileSystem.openFile();
      case 'save': {
        setTabs(prev => prev.map(t => t.name === activeTab ? { ...t, modified: false } : t));
        useEditorStore.getState().markTabModified(activeTab, false);
        if (fileSystem.directoryHandle && activeTab) {
          fileSystem.writeFile(activeTab, fileContents[activeTab] || '').catch(err =>
            console.error('Save failed:', err)
          );
        }
        return;
      }
      case 'saveAll': {
        setTabs(prev => prev.map(t => ({ ...t, modified: false })));
        useEditorStore.getState().saveAllTabs();
        return;
      }
      case 'toggleSidebar': { setActiveView(prev => prev ? '' : 'titan-agent'); return; }
      case 'togglePanel': { setShowTerminal(prev => !prev); return; }
      case 'newTerminal': { setShowTerminal(true); return; }
      case 'splitTerminal': { setShowTerminal(true); return; }
      case 'startDebug': { setShowTerminal(true); return; }
      case 'stopDebug': return;
    }
    if (!editorInstance || !monacoInstance) return;
    const editorCommands: Record<string, string> = {
      undo: 'undo', redo: 'redo',
      cut: 'editor.action.clipboardCutAction', copy: 'editor.action.clipboardCopyAction',
      paste: 'editor.action.clipboardPasteAction', find: 'actions.find',
      replace: 'editor.action.startFindReplaceAction', selectAll: 'editor.action.selectAll',
      expandSelection: 'editor.action.smartSelect.expand', commandPalette: 'editor.action.quickCommand',
      goToFile: 'workbench.action.quickOpen', goToSymbol: 'editor.action.quickOutline',
      goToLine: 'editor.action.gotoLine',
    };
    const action = editorCommands[command];
    if (action) editorInstance.trigger('keyboard', action, null);
  }, [editorInstance, monacoInstance, activeTab, fileContents, fileSystem]);

  // Tab/file handlers
  const handleFileClick = useCallback((fileName: string) => {
    const info = getFileInfo(fileName);
    if (!tabs.find(t => t.name === fileName)) setTabs(prev => [...prev, { name: fileName, icon: info.icon, color: info.color }]);
    setActiveTab(fileName);
  }, [tabs]);

  const handleTabClose = useCallback((fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = tabs.filter(t => t.name !== fileName);
    setTabs(newTabs);
    if (activeTab === fileName && newTabs.length > 0) setActiveTab(newTabs[newTabs.length - 1].name);
  }, [tabs, activeTab]);

  const handleActivityClick = useCallback((view: string) => {
    setActiveView(prev => prev === view ? '' : view);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'b') { e.preventDefault(); setActiveView(prev => prev ? '' : 'titan-agent'); }
      else if (ctrl && e.key === 's') { e.preventDefault(); executeCommand('save'); }
      else if (ctrl && e.key === 'n') { e.preventDefault(); executeCommand('newFile'); }
      else if (ctrl && e.key === 'o' && !e.shiftKey) { e.preventDefault(); fileSystem.openFolder(); }
      else if (ctrl && e.key === '`') { e.preventDefault(); setShowTerminal(prev => !prev); }
      else if (ctrl && e.shiftKey && e.key === 'E') { e.preventDefault(); setShowRightPanel(prev => !prev); }
      else if (ctrl && e.shiftKey && e.key === 'F') { e.preventDefault(); setActiveView('search'); }
      else if (ctrl && e.shiftKey && e.key === 'G') { e.preventDefault(); setActiveView('git'); }
      else if (ctrl && e.shiftKey && e.key === 'P') { e.preventDefault(); executeCommand('commandPalette'); }
      else if (e.key === 'Escape') {
        settings.setShowModelDropdown(false);
        setShowPlusDropdown(false);
        if (midnight.showFactoryView) midnight.setShowFactoryView(false);
      }
    };
    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  }, [executeCommand, fileSystem, settings, midnight]);

  // Close dropdowns
  useEffect(() => {
    const handleClick = () => { setShowPlusDropdown(false); settings.setShowModelDropdown(false); };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [settings]);

  // Chat scroll
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [currentSession?.messages]);
  useEffect(() => {
    if (!chat.isThinking && !chat.isStreaming) return;
    const timer = window.setInterval(() => { chatEndRef.current?.scrollIntoView({ behavior: 'auto' }); }, 100);
    return () => window.clearInterval(timer);
  }, [chat.isThinking, chat.isStreaming]);

  // Persist tabs/editor state
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem('titan-editor', JSON.stringify({
        tabs: tabs.map(t => ({ name: t.name, icon: t.icon, color: t.color, modified: t.modified })),
        activeTab, gitBranch,
      }));
    } catch { /* ignore */ }
  }, [mounted, tabs, activeTab, gitBranch]);

  useEffect(() => {
    if (!mounted) return;
    try {
      const saved = localStorage.getItem('titan-editor');
      if (saved) {
        const state = JSON.parse(saved);
        if (state.tabs?.length > 0) setTabs(state.tabs);
        if (state.activeTab) setActiveTab(state.activeTab);
        if (state.gitBranch) setGitBranch(state.gitBranch);
      }
    } catch { /* ignore */ }
  }, [mounted]);

  const currentFileLanguage = getLanguageFromFilename(activeTab);

  if (!mounted) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#1e1e1e]">
        <div className="text-[#808080] text-sm">Loading Titan AI...</div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div suppressHydrationWarning className="h-screen w-screen flex flex-col bg-[#1e1e1e] text-[#cccccc] overflow-hidden select-none" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      {mounted && <IDEMenuBar />}
      {mounted && <IDECommandPalette />}
      {mounted && <IDEKeybindingService />}

      {/* Title Bar */}
      <TitleBar
        activeView={activeView} setActiveView={setActiveView}
        tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab} onTabClose={handleTabClose}
        showPlusDropdown={showPlusDropdown} setShowPlusDropdown={setShowPlusDropdown}
        showModelDropdown={settings.showModelDropdown} setShowModelDropdown={settings.setShowModelDropdown}
        activeModel={settings.activeModel} activeModelLabel={settings.activeModelLabel}
        cappedModelRegistry={settings.cappedModelRegistry} filteredModels={settings.filteredModels}
        modelSearchQuery={settings.modelSearchQuery} setModelSearchQuery={settings.setModelSearchQuery}
        highlightedModelIndex={settings.highlightedModelIndex} setHighlightedModelIndex={settings.setHighlightedModelIndex}
        modelSearchInputRef={settings.modelSearchInputRef}
        onSelectModel={settings.selectActiveModel} onModelSearchKeyDown={settings.handleModelSearchKeyDown}
        onNewFile={() => executeCommand('newFile')} onNewTerminal={() => executeCommand('newTerminal')}
        onNewAgent={() => handleNewAgent(settings.activeModel)}
        mounted={mounted}
      />

      {/* Clone Dialog */}
      {mounted && (
        <IDECloneRepoDialog
          isOpen={showCloneDialog}
          onClose={() => setShowCloneDialog(false)}
          onCloneComplete={(path) => { fileSystem.setWorkspacePath(path); setShowCloneDialog(false); }}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Activity Bar */}
        <div className="w-[48px] bg-[#2b2b2b] flex flex-col items-center py-1 shrink-0 border-r border-[#3c3c3c]">
          <ActivityIcon active={showRightPanel} onClick={() => setShowRightPanel(prev => !prev)} title="Explorer"><ExplorerIcon /></ActivityIcon>
          <ActivityIcon active={activeView === 'search'} onClick={() => handleActivityClick('search')} title="Search"><SearchIcon /></ActivityIcon>
          <ActivityIcon active={activeView === 'git'} onClick={() => handleActivityClick('git')} title="Source Control"><GitIcon /></ActivityIcon>
          <ActivityIcon active={activeView === 'debug'} onClick={() => handleActivityClick('debug')} title="Run and Debug"><DebugIcon /></ActivityIcon>
          <ActivityIcon active={activeView === 'extensions'} onClick={() => handleActivityClick('extensions')} title="Extensions"><ExtensionsIcon /></ActivityIcon>
          <ActivityIcon active={activeView === 'titan-agent'} onClick={() => handleActivityClick('titan-agent')} title="Titan Agent"><TitanAgentIcon /></ActivityIcon>
          <div className="flex-1" />
          <ActivityIcon active={activeView === 'accounts'} onClick={() => handleActivityClick('accounts')} title="Accounts"><AccountIcon /></ActivityIcon>
          <ActivityIcon active={activeView === 'settings'} onClick={() => handleActivityClick('settings')} title="Settings"><SettingsGearIcon /></ActivityIcon>
        </div>

        {/* LEFT PANEL */}
        {activeView && activeView !== 'explorer' && (
          <div className="w-[320px] bg-[#1e1e1e] border-r border-[#3c3c3c] flex flex-col shrink-0 overflow-hidden">
            {activeView === 'search' && <IDESemanticSearch />}
            {activeView === 'git' && <IDEGitPanel workspacePath={fileSystem.workspacePath} />}
            {activeView === 'debug' && <IDEDebugPanel />}
            {activeView === 'extensions' && <ExtensionsPanel />}
            {activeView === 'titan-agent' && (
              <TitanAgentPanel
                sessions={sessions} activeSessionId={activeSessionId} setActiveSessionId={setActiveSessionId}
                currentSession={currentSession} chatInput={chat.chatInput} setChatInput={chat.setChatInput}
                isThinking={chat.isThinking} isStreaming={chat.isStreaming} activeModel={settings.activeModelLabel}
                onNewAgent={() => handleNewAgent(settings.activeModel)} onSend={chat.handleSend} onStop={chat.handleStop}
                onKeyDown={chat.handleKeyDown} onApply={handleApplyChanges} chatEndRef={chatEndRef}
                onRenameSession={handleRenameSession} onDeleteSession={handleDeleteSession}
                hasPendingDiff={pendingDiff !== null}
                onRejectDiff={() => {
                  if (pendingDiff && editorInstance) {
                    const model = editorInstance.getModel();
                    if (model) {
                      if (pendingDiff.decorationIds.length > 0) editorInstance.deltaDecorations(pendingDiff.decorationIds, []);
                      model.setValue(pendingDiff.oldContent);
                    }
                  }
                  setPendingDiff(null);
                }}
                onRetry={(message) => {
                  setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: s.messages.filter(m => !m.isError) } : s));
                  chat.setChatInput(message);
                  setTimeout(() => chat.handleSend(), 100);
                }}
                onApplyCode={(code, filename) => {
                  const targetFile = filename || activeTab;
                  if (targetFile) {
                    setFileContents(prev => ({ ...prev, [targetFile]: code }));
                    if (targetFile === activeTab && editorInstance) {
                      const model = editorInstance.getModel();
                      if (model) model.setValue(code);
                    }
                    if (fileSystem.directoryHandle) fileSystem.writeFile(targetFile, code);
                  }
                }}
                onApplyDiff={(diffId) => {
                  const session = sessions.find(s => s.id === activeSessionId);
                  if (session) {
                    for (const msg of session.messages) {
                      const diff = msg.codeDiffs?.find(d => d.id === diffId);
                      if (diff && diff.status === 'pending') {
                        const targetFile = diff.file.split('/').pop() || diff.file;
                        setFileContents(prev => ({ ...prev, [targetFile]: diff.code, [diff.file]: diff.code }));
                        if (targetFile === activeTab && editorInstance) {
                          const model = editorInstance.getModel();
                          if (model) model.setValue(diff.code);
                        }
                        if (fileSystem.directoryHandle) fileSystem.writeFile(targetFile, diff.code);
                        break;
                      }
                    }
                  }
                  setSessions(prev => prev.map(s => {
                    if (s.id !== activeSessionId) return s;
                    return {
                      ...s,
                      messages: s.messages.map(m => ({
                        ...m,
                        codeDiffs: m.codeDiffs?.map(d =>
                          d.id === diffId ? { ...d, status: 'applied' as const } : d
                        ),
                      })),
                    };
                  }));
                }}
                onRejectCodeDiff={(diffId) => {
                  setSessions(prev => prev.map(s => {
                    if (s.id !== activeSessionId) return s;
                    return {
                      ...s,
                      messages: s.messages.map(m => ({
                        ...m,
                        codeDiffs: m.codeDiffs?.map(d =>
                          d.id === diffId ? { ...d, status: 'rejected' as const } : d
                        ),
                      })),
                    };
                  }));
                }}
              />
            )}
            {activeView === 'accounts' && <AccountsPanel />}
            {activeView === 'settings' && (
              <SettingsPanel
                fontSize={settings.fontSize} setFontSize={settings.setFontSize}
                tabSize={settings.tabSize} setTabSize={settings.setTabSize}
                wordWrap={settings.wordWrap} setWordWrap={settings.setWordWrap}
                activeModel={settings.activeModel} setActiveModel={settings.setActiveModel}
                models={settings.models} trustLevel={midnight.trustLevel}
                setTrustLevel={midnight.setTrustLevel} midnightActive={midnight.midnightActive}
              />
            )}
          </div>
        )}

        {/* CENTER: Editor + Terminal */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <EditorArea
            tabs={tabs} activeTab={activeTab} fileContents={fileContents}
            setFileContents={setFileContents} setTabs={setTabs}
            cursorPosition={cursorPosition} setCursorPosition={setCursorPosition}
            setEditorInstance={setEditorInstance} setMonacoInstance={setMonacoInstance}
            fontSize={settings.fontSize} tabSize={settings.tabSize} wordWrap={settings.wordWrap}
            isLoadingFiles={fileSystem.isLoadingFiles} loadingMessage={fileSystem.loadingMessage}
            onOpenFolder={fileSystem.openFolder} onOpenCloneDialog={() => setShowCloneDialog(true)}
            onNewFile={() => executeCommand('newFile')}
          />
          {showTerminal && (
            <div style={{ height: 240, borderTop: '1px solid #313244', flexShrink: 0, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 10 }}>
                <button onClick={() => setShowTerminal(false)} style={{ background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer', padding: '4px 8px', fontSize: 14 }} title="Close Panel">×</button>
              </div>
              <IDETerminal />
            </div>
          )}
        </div>

        {/* RIGHT PANEL - File Explorer */}
        {showRightPanel && (
          <div className="w-[280px] bg-[#1e1e1e] border-l border-[#3c3c3c] flex flex-col shrink-0 overflow-hidden">
            <IDEFileExplorer />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <StatusBar
        midnightActive={midnight.midnightActive} onMidnightToggle={midnight.startMidnight}
        confidenceScore={midnight.confidenceScore} confidenceStatus={midnight.confidenceStatus}
        gitBranch={gitBranch} unsavedCount={tabs.filter(t => t.modified).length}
        currentLanguage={currentFileLanguage} cursorLine={cursorPosition.line} cursorColumn={cursorPosition.column}
        activeModelLabel={settings.activeModelLabel}
        onGitClick={() => setActiveView('git')} onSettingsClick={() => setActiveView('settings')}
      />

      {/* Factory View */}
      <FactoryView
        isOpen={midnight.showFactoryView}
        onClose={() => midnight.setShowFactoryView(false)}
        onStop={midnight.stopMidnight}
        trustLevel={midnight.trustLevel}
      />
    </div>
    </ErrorBoundary>
  );
}

/* ═══ SUB-COMPONENTS (kept inline for icons and small panels) ═══ */

function ActivityIcon({ children, active, onClick, title }: { children: React.ReactNode; active?: boolean; onClick?: () => void; title: string }) {
  return (
    <button title={title} onClick={onClick} className={`w-[48px] h-[48px] flex items-center justify-center transition-colors relative ${active ? 'text-white' : 'text-[#6e6e6e] hover:text-[#cccccc]'}`}>
      {active && <div className="absolute left-0 top-[12px] bottom-[12px] w-[2px] bg-[#007acc] rounded-r" />}
      {children}
    </button>
  );
}

import { Session } from '@/types/ide';

function TitanAgentPanel({ sessions, activeSessionId, setActiveSessionId, currentSession, chatInput, setChatInput, isThinking, isStreaming, activeModel, onNewAgent, onSend, onStop, onKeyDown, onApply, chatEndRef, hasPendingDiff, onRejectDiff, onRenameSession, onDeleteSession, onRetry, onApplyCode, onApplyDiff, onRejectCodeDiff }: {
  sessions: Session[]; activeSessionId: string; setActiveSessionId: (id: string) => void; currentSession: Session;
  chatInput: string; setChatInput: (v: string) => void; isThinking: boolean; isStreaming: boolean; activeModel: string;
  onNewAgent: () => void; onSend: () => void; onStop: () => void; onKeyDown: (e: React.KeyboardEvent) => void; onApply: () => void; chatEndRef: React.MutableRefObject<HTMLDivElement | null>;
  hasPendingDiff?: boolean; onRejectDiff?: () => void;
  onRenameSession?: (id: string, name: string) => void; onDeleteSession?: (id: string) => void;
  onRetry?: (message: string) => void;
  onApplyCode?: (code: string, filename?: string) => void;
  onApplyDiff?: (diffId: string) => void;
  onRejectCodeDiff?: (diffId: string) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [showFiles, setShowFiles] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px';
    }
  }, [chatInput]);

  return (
    <div className="flex flex-col h-full bg-[#181818] overflow-hidden min-h-0">
      {/* ── Header: Mode + Model + New Thread + History ── */}
      <div className="shrink-0 flex items-center justify-between px-3 h-[36px] border-b border-[#252525]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[#569cd6] uppercase tracking-wide">Agent</span>
          <span className="text-[10px] text-[#444]">|</span>
          <span className="text-[11px] text-[#6e6e6e] truncate max-w-[140px]">{activeModel}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setShowHistory(!showHistory)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#ffffff08] text-[#6e6e6e] hover:text-[#aaa] transition-colors" title="History">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </button>
          <button onClick={onNewAgent} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#ffffff08] text-[#6e6e6e] hover:text-[#aaa] transition-colors" title="New Thread">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a.75.75 0 01.75.75v5.5h5.5a.75.75 0 010 1.5h-5.5v5.5a.75.75 0 01-1.5 0v-5.5h-5.5a.75.75 0 010-1.5h5.5v-5.5A.75.75 0 018 1z"/></svg>
          </button>
        </div>
      </div>

      {/* ── Thread history dropdown ── */}
      {showHistory && (
        <div className="shrink-0 max-h-[180px] overflow-y-auto border-b border-[#252525] bg-[#141414]">
          {sessions.map(s => (
            <div key={s.id} className={`group relative ${activeSessionId === s.id ? 'bg-[#1e1e1e]' : 'hover:bg-[#1a1a1a]'}`}>
              <button onClick={() => { setActiveSessionId(s.id); setShowHistory(false); }} className="w-full text-left px-3 py-1.5 pr-8">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeSessionId === s.id ? 'bg-[#569cd6]' : 'bg-[#333]'}`} />
                  <span className="text-[11px] text-[#9d9d9d] truncate">{s.name}</span>
                </div>
              </button>
              <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                <button onClick={(e) => { e.stopPropagation(); const n = prompt('Rename:', s.name); if (n?.trim()) onRenameSession?.(s.id, n.trim()); }} className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#333] text-[#6e6e6e] text-[10px]" title="Rename">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61z"/></svg>
                </button>
                {sessions.length > 1 && (
                  <button onClick={(e) => { e.stopPropagation(); onDeleteSession?.(s.id); }} className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#333] text-[#6e6e6e] hover:text-[#f85149] text-[10px]" title="Delete">
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Messages area ── */}
      <div className="flex-1 overflow-y-auto min-h-0 titan-chat-scroll">
        <div className="px-3 pt-3 pb-6">
          {currentSession.messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
              <p className="mt-3 text-[12px] text-[#444]">What do you want to build?</p>
            </div>
          )}
          {currentSession.messages.map((msg, i) => (
            <ChatMessage
              key={msg.id || i}
              role={msg.role as 'user' | 'assistant'}
              content={msg.content}
              thinking={msg.thinking}
              thinkingTime={msg.thinkingTime}
              streaming={msg.streaming}
              streamingModel={msg.streamingModel}
              streamingProvider={msg.streamingProvider}
              streamingProviderModel={msg.streamingProviderModel}
              isError={msg.isError}
              retryMessage={msg.retryMessage}
              activeModel={activeModel}
              toolCalls={msg.toolCalls}
              codeDiffs={msg.codeDiffs}
              onRetry={onRetry}
              onApplyCode={onApplyCode}
              onApplyDiff={onApplyDiff}
              onRejectDiff={onRejectCodeDiff}
            />
          ))}
          {isThinking && !currentSession.messages.some(m => m.streaming) && (
            <div className="flex items-center gap-2 py-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#569cd6" strokeWidth="2.5" className="animate-spin">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              <span className="text-[11px] text-[#6e6e6e]">Working...</span>
            </div>
          )}
          <div ref={(node) => { chatEndRef.current = node; }} />
        </div>
      </div>

      {/* ── Bottom: pending diffs + changed files + input ── */}
      <div className="shrink-0 border-t border-[#252525]">
        {hasPendingDiff && (
          <div className="px-3 py-1.5 bg-[#0d1f12] border-b border-[#252525]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#3fb950] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#3fb950] rounded-full animate-pulse" />
                Changes ready
              </span>
              <div className="flex items-center gap-1">
                <button onClick={onRejectDiff} className="h-[20px] px-2 text-[10px] text-[#f85149] hover:bg-[#f85149]/10 rounded transition-colors">Reject</button>
                <button onClick={onApply} className="h-[20px] px-2 bg-[#238636] hover:bg-[#2ea043] text-white text-[10px] rounded transition-colors">Accept</button>
              </div>
            </div>
          </div>
        )}

        {currentSession.changedFiles.length > 0 && !hasPendingDiff && (
          <div className="border-b border-[#252525]">
            <button onClick={() => setShowFiles(!showFiles)} className="w-full flex items-center justify-between px-3 py-1 text-[11px] text-[#6e6e6e] hover:text-[#9d9d9d]">
              <div className="flex items-center gap-1.5">
                <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor" className={`transition-transform ${showFiles ? 'rotate-90' : ''}`}><path d="M6 4l4 4-4 4z"/></svg>
                <span>{currentSession.changedFiles.length} file{currentSession.changedFiles.length !== 1 ? 's' : ''} changed</span>
              </div>
            </button>
            {showFiles && (
              <div className="px-3 pb-1.5">
                {currentSession.changedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 py-[2px] text-[10px] font-mono">
                    <span className="text-[#6e6e6e] truncate flex-1">{f.name}</span>
                    <span className="text-[#3fb950] tabular-nums">+{f.additions}</span>
                    <span className="text-[#f85149] tabular-nums">-{f.deletions}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Input area ── */}
        <div className="p-2">
          <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg focus-within:border-[#569cd6]/50 transition-colors">
            <textarea
              ref={textareaRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Plan, search, build, or fix..."
              rows={1}
              className="w-full bg-transparent px-3 py-2 text-[12.5px] text-[#d4d4d4] placeholder-[#444] focus:outline-none resize-none leading-[1.5] max-h-[140px]"
            />
            <div className="flex items-center justify-between px-2 pb-1.5">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${isThinking || isStreaming ? 'bg-[#569cd6] animate-pulse' : 'bg-[#333]'}`} />
                <span className="text-[10px] text-[#444]">
                  {isThinking || isStreaming ? 'Working...' : 'Ready'}
                </span>
              </div>
              {isThinking || isStreaming ? (
                <button onClick={onStop} className="w-[24px] h-[24px] flex items-center justify-center rounded bg-[#f85149] hover:bg-[#da3633] text-white transition-colors" title="Stop (Esc)">
                  <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1"/></svg>
                </button>
              ) : (
                <button onClick={onSend} disabled={!chatInput.trim()} className={`w-[24px] h-[24px] flex items-center justify-center rounded transition-colors ${chatInput.trim() ? 'bg-[#569cd6] hover:bg-[#6eb0e6] text-white' : 'bg-[#222] text-[#444]'}`} title="Send (Enter)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExtensionsPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 shrink-0">
        <input placeholder="Search Extensions" className="w-full bg-[#2d2d2d] border border-[#3c3c3c] rounded-md px-3 py-1.5 text-[12px] text-[#cccccc] placeholder-[#666] focus:outline-none focus:border-[#007acc]" />
      </div>
      <div className="px-2 text-[11px]">
        <div className="font-semibold text-[#808080] uppercase px-2 py-1.5">Installed</div>
        {[{ name: 'TypeScript', author: 'Microsoft', color: '#007acc' }, { name: 'ESLint', author: 'Microsoft', color: '#764abc' }, { name: 'Prettier', author: 'Prettier', color: '#c596c7' }].map(ext => (
          <div key={ext.name} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#2a2a2a] rounded cursor-pointer">
            <span className="w-8 h-8 rounded flex items-center justify-center text-white text-[10px] font-bold" style={{ background: ext.color }}>{ext.name.slice(0, 2)}</span>
            <div><div className="text-[#e0e0e0] text-[12px]">{ext.name}</div><div className="text-[#808080]">{ext.author}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountsPanel() {
  const [apiKeys, setApiKeys] = useState({ openai: { connected: true, key: 'sk-...4a2f' }, anthropic: { connected: true, key: 'sk-ant-...b3d1' }, google: { connected: false, key: '' }, openrouter: { connected: true, key: 'sk-or-...9e1c' }, deepseek: { connected: false, key: '' }, mistral: { connected: false, key: '' } });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const handleAddKey = (provider: string) => { if (keyInput.trim()) { setApiKeys(prev => ({ ...prev, [provider]: { connected: true, key: keyInput.slice(0, 6) + '...' + keyInput.slice(-4) } })); setEditingKey(null); setKeyInput(''); } };
  const providers = [{ id: 'openai', name: 'OpenAI', icon: '⚪' }, { id: 'anthropic', name: 'Anthropic', icon: '🟠' }, { id: 'google', name: 'Google AI', icon: '🔵' }, { id: 'openrouter', name: 'OpenRouter', icon: '🟣' }, { id: 'deepseek', name: 'DeepSeek', icon: '🔴' }, { id: 'mistral', name: 'Mistral', icon: '🟡' }];
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-3 p-3 bg-[#2a2a2a] rounded-lg">
          <div className="w-12 h-12 rounded-full bg-[#007acc] flex items-center justify-center text-white text-[18px] font-bold">T</div>
          <div><div className="text-[14px] text-[#e0e0e0] font-medium">Titan User</div><div className="text-[12px] text-[#808080]">titan@example.com</div></div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        <div className="text-[11px] font-semibold text-[#808080] uppercase px-2 py-1.5 flex items-center justify-between"><span>API Keys (BYOK)</span><span className="text-[10px] text-[#007acc] font-normal">Bring Your Own Key</span></div>
        {providers.map(p => { const data = apiKeys[p.id as keyof typeof apiKeys]; return (
            <div key={p.id} className="px-2 py-2 hover:bg-[#2a2a2a] rounded">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span>{p.icon}</span><span className="text-[12px] text-[#cccccc]">{p.name}</span></div>
            {data.connected ? <span className="text-[11px] text-[#3fb950]">✓ Connected</span> : <button onClick={() => setEditingKey(p.id)} className="text-[11px] text-[#007acc] hover:text-[#0098ff]">+ Add Key</button>}</div>
            {data.connected && <div className="text-[10px] text-[#555] mt-0.5 ml-6">{data.key}</div>}
            {editingKey === p.id && (<div className="mt-2 flex gap-1"><input type="password" placeholder={`Enter ${p.name} API key...`} value={keyInput} onChange={(e) => setKeyInput(e.target.value)} className="flex-1 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-[#cccccc] focus:outline-none focus:border-[#007acc]" /><button onClick={() => handleAddKey(p.id)} className="px-2 py-1 bg-[#007acc] hover:bg-[#0098ff] text-white text-[10px] rounded">Save</button><button onClick={() => { setEditingKey(null); setKeyInput(''); }} className="px-2 py-1 bg-[#3c3c3c] hover:bg-[#4c4c4c] text-white text-[10px] rounded">✕</button></div>)}
          </div>); })}
      </div>
    </div>
  );
}

function SettingsPanel({ fontSize, setFontSize, tabSize, setTabSize, wordWrap, setWordWrap, activeModel, setActiveModel, models, trustLevel, setTrustLevel, midnightActive }: {
  fontSize: number; setFontSize: (v: number) => void; tabSize: number; setTabSize: (v: number) => void; wordWrap: boolean; setWordWrap: (v: boolean) => void; activeModel: string; setActiveModel: (v: string) => void; models: string[]; trustLevel: 1 | 2 | 3; setTrustLevel: (v: 1 | 2 | 3) => void; midnightActive: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 shrink-0"><input placeholder="Search settings" className="w-full bg-[#2d2d2d] border border-[#3c3c3c] rounded-md px-3 py-1.5 text-[12px] text-[#cccccc] placeholder-[#666] focus:outline-none" /></div>
      <div className="flex-1 overflow-y-auto px-2">
        <div className="text-[11px] font-semibold text-[#808080] uppercase px-2 py-1.5">Editor</div>
        <div className="flex items-center justify-between px-2 py-1.5"><span className="text-[12px] text-[#cccccc]">Font Size</span><input type="number" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-16 bg-[#2d2d2d] border border-[#3c3c3c] rounded px-2 py-0.5 text-[12px] text-[#cccccc] text-right" /></div>
        <div className="flex items-center justify-between px-2 py-1.5"><span className="text-[12px] text-[#cccccc]">Tab Size</span><input type="number" value={tabSize} onChange={(e) => setTabSize(Number(e.target.value))} className="w-16 bg-[#2d2d2d] border border-[#3c3c3c] rounded px-2 py-0.5 text-[12px] text-[#cccccc] text-right" /></div>
        <div className="flex items-center justify-between px-2 py-1.5"><span className="text-[12px] text-[#cccccc]">Word Wrap</span><button onClick={() => setWordWrap(!wordWrap)} className={`w-10 h-5 rounded-full ${wordWrap ? 'bg-[#007acc]' : 'bg-[#3c3c3c]'} relative`}><span className={`absolute top-0.5 ${wordWrap ? 'right-0.5' : 'left-0.5'} w-4 h-4 bg-white rounded-full transition-all`}></span></button></div>
        <div className="text-[11px] font-semibold text-[#808080] uppercase px-2 py-1.5 mt-3">Titan AI</div>
        <div className="flex items-center justify-between px-2 py-1.5"><span className="text-[12px] text-[#cccccc]">Default Model</span><select value={activeModel} onChange={(e) => setActiveModel(e.target.value)} className="bg-[#2d2d2d] border border-[#3c3c3c] rounded px-2 py-0.5 text-[12px] text-[#cccccc]">{models.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
        <div className="text-[11px] font-semibold text-purple-400 uppercase px-2 py-1.5 mt-3 flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-purple-400"><path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" stroke="currentColor" strokeWidth="1.5" fill={midnightActive ? 'currentColor' : 'none'}/></svg>
          Project Midnight
        </div>
        <div className="px-2 py-2"><TrustSlider value={trustLevel} onChange={setTrustLevel} disabled={midnightActive} /></div>
      </div>
    </div>
  );
}

/* ─── ICONS ─── */
function ExplorerIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>; }
function SearchIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>; }
function GitIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>; }
function DebugIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="5 3 19 12 5 21 5 3"/></svg>; }
function ExtensionsIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function TitanAgentIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>; }
function AccountIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function SettingsGearIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
