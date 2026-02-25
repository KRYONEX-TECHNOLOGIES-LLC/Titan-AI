'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type * as Monaco from 'monaco-editor';

// Types
import type { FileTab, PendingDiff, Session, FileAttachment } from '@/types/ide';

// Hooks
import { useChat } from '@/hooks/useChat';
import { useSessions } from '@/hooks/useSessions';
import { useSettings } from '@/hooks/useSettings';
import { useMidnight } from '@/hooks/useMidnight';
import { useFileSystem } from '@/hooks/useFileSystem';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useSession } from '@/providers/session-provider';
import GitHubAuthProvider from '@/providers/github-auth-provider';

// Utils
import { getFileInfo, getLanguageFromFilename } from '@/utils/file-helpers';
import { isElectron, electronAPI } from '@/lib/electron';

// Components
import { ToolsStatus } from '@/components/ide/ToolsStatus';
import { getCapabilities } from '@/lib/agent-capabilities';

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
const LanePanel = dynamic(() => import('@/components/ide/LanePanel'), { ssr: false });
const SupremePanel = dynamic(() => import('@/components/ide/SupremePanel'), { ssr: false });
const IDECloneRepoDialog = dynamic(() => import('@/components/ide/CloneRepoDialog'), { ssr: false });
const EditorArea = dynamic(() => import('@/components/ide/EditorArea'), { ssr: false });
const TitleBar = dynamic(() => import('@/components/ide/TitleBar'), { ssr: false });
const StatusBar = dynamic(() => import('@/components/ide/StatusBar'), { ssr: false });
const ChatMessage = dynamic(() => import('@/components/ide/ChatMessage'), { ssr: false });
const ForgeDashboard = dynamic(() => import('@/components/ide/ForgeDashboard').then(m => ({ default: m.ForgeDashboard })), { ssr: false });
const MidnightPanel = dynamic(() => import('@/components/ide/MidnightPanel'), { ssr: false });
const TrainingLabPanel = dynamic(() => import('@/components/ide/TrainingLabPanel'), { ssr: false });
const BrainObservatoryPanel = dynamic(() => import('@/components/ide/BrainObservatoryPanel'), { ssr: false });

// Zustand stores
import { useLayoutStore } from '@/stores/layout-store';
import { useEditorStore } from '@/stores/editor-store';
import { useFileStore } from '@/stores/file-store';
import { useTerminalStore } from '@/stores/terminal-store';
import { useDebugStore } from '@/stores/debug-store';
import { usePlanStore } from '@/stores/plan-store';
import { useTitanVoice } from '@/stores/titan-voice.store';
import { getThoughtEngine } from '@/lib/voice/thought-engine';
import { startKnowledgeIngestion } from '@/lib/voice/knowledge-ingest';
import type { ProactiveThought } from '@/lib/voice/thought-engine';
import { initCommandRegistry } from '@/lib/ide/command-registry';

const PlanModePanel = dynamic(() => import('@/components/ide/PlanModePanel').then(m => ({ default: m.PlanModePanel })), { ssr: false });
const TitanVoicePopup = dynamic(() => import('@/components/ide/TitanVoicePopup'), { ssr: false });

/* ═══ MAIN IDE COMPONENT ═══ */
export default function TitanIDE() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const titanSession = useSession();

  // Initialize command registry once — use getState directly so we don't
  // subscribe TitanIDE to the entire store (which would re-render on any
  // store change across all five stores).
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
  // Perf: avoid copying a huge file map on every keystroke.
  // Keep file contents in a stable ref, and let the editor manage its own local value.
  const fileContentsRef = useRef<Record<string, string>>({});
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [pendingDiff, setPendingDiff] = useState<PendingDiff | null>(null);
  const pendingDiffRef = useRef<PendingDiff | null>(null);
  useEffect(() => { pendingDiffRef.current = pendingDiff; }, [pendingDiff]);

  const applyFiles = useCallback((files: Record<string, string>, opts?: { replace?: boolean }) => {
    if (opts?.replace) {
      for (const k of Object.keys(fileContentsRef.current)) {
        delete fileContentsRef.current[k];
      }
    }
    Object.assign(fileContentsRef.current, files);
  }, []);

  const getFileContent = useCallback((filePath: string) => {
    return fileContentsRef.current[filePath] ?? '';
  }, []);

  const onFileContentChange = useCallback((filePath: string, content: string) => {
    fileContentsRef.current[filePath] = content;
  }, []);

  // Explorer file-open callback (same proven pattern as handleAgentFileEdited)
  const handleExplorerFileOpen = useCallback((name: string, filePath: string, content: string, language: string) => {
    applyFiles({ [name]: content, [filePath]: content });
    useEditorStore.getState().loadFileContents({ [name]: content, [filePath]: content });

    setTabs(prev => {
      if (prev.some(t => t.name === name)) return prev;
      const info = getFileInfo(name);
      return [...prev, { name, icon: info.icon, color: info.color, modified: false }];
    });
    setActiveTab(name);

    if (activeTab === name && editorInstance) {
      const model = editorInstance.getModel();
      if (model && model.getValue() !== content) {
        model.setValue(content);
      }
    }
  }, [activeTab, editorInstance, applyFiles]);

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
  const fileSystem = useFileSystem(setTabs, setActiveTab, applyFiles, setActiveView, activeView);
  const setWorkspacePath = fileSystem.setWorkspacePath;
  const storeWorkspacePath = useFileStore(s => s.workspacePath);
  const resolvedWorkspacePath = fileSystem.workspacePath || storeWorkspacePath || undefined;
  const { sessions, setSessions, activeSessionId, setActiveSessionId, currentSession, handleNewAgent, handleRenameSession, handleDeleteSession } = useSessions(mounted, resolvedWorkspacePath);

  // Terminal history for agent context
  const [terminalHistory, setTerminalHistory] = useState<Array<{ command: string; output?: string; exitCode: number }>>([]);

  const normalizeFilePath = useCallback((path: string) => path.replace(/\\/g, '/').replace(/^\.\//, ''), []);
  const isLikelyWorkspacePath = useCallback((path: string) => (
    /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/') || path.startsWith('\\\\')
  ), []);
  const deriveWorkspaceRoot = useCallback((relativePath: string, absolutePath: string) => {
    if (!absolutePath) return '';
    const normalizedRel = normalizeFilePath(relativePath);
    const normalizedAbs = absolutePath.replace(/\\/g, '/');
    if (!normalizedRel) return absolutePath;
    const relLower = normalizedRel.toLowerCase();
    const absLower = normalizedAbs.toLowerCase();
    if (!absLower.endsWith(relLower)) {
      return absolutePath;
    }
    const root = normalizedAbs.slice(0, normalizedAbs.length - normalizedRel.length).replace(/[/\\]+$/, '');
    return root || absolutePath;
  }, [normalizeFilePath]);

  // Recover persisted workspace and clear stale state left by older path mapping bug
  useEffect(() => {
    if (!mounted) return;
    const fileState = useFileStore.getState();
    if (!fileState.workspaceOpen || !fileState.workspacePath) return;
    if (!isLikelyWorkspacePath(fileState.workspacePath)) {
      fileState.closeFolder();
      return;
    }
    setWorkspacePath(fileState.workspacePath);
    fileState.refreshFileTree();
  }, [mounted, isLikelyWorkspacePath, setWorkspacePath]);

  // Sync persistent memory store to current workspace
  useEffect(() => {
    if (!mounted) return;
    const { useTitanMemory } = require('@/stores/titan-memory');
    useTitanMemory.getState().setWorkspace(resolvedWorkspacePath);
  }, [mounted, resolvedWorkspacePath]);

  // Auto-create C:\TitanWorkspace if no folder is loaded (Electron only)
  useEffect(() => {
    if (!mounted) return;
    if (fileSystem.workspacePath) return;
    const fileState = useFileStore.getState();
    if (fileState.workspaceOpen && fileState.workspacePath) return;
    if (isElectron && electronAPI) {
      void fileSystem.ensureDefaultWorkspace();
    }
  }, [mounted, fileSystem]);

  // Debounced file tree refresh
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefreshTree = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      useFileStore.getState().refreshFileTree();
      refreshTimerRef.current = null;
    }, 100);
  }, []);

  // Agent callback: file edited on disk -> update editor + file tree (pathResolved = absolute path from IPC for matching)
  const handleAgentFileEdited = useCallback((path: string, newContent: string, pathResolved?: string) => {
    const normalizedPath = normalizeFilePath(path);
    const wsPath = fileSystem.workspacePath || useFileStore.getState().workspacePath || '';
    const base = wsPath.replace(/[/\\]+$/, '');
    const relativeFromResolved = pathResolved && base && pathResolved.startsWith(base)
      ? normalizeFilePath(pathResolved.slice(base.length).replace(/^[/\\]+/, ''))
      : '';
    const matchPaths = [normalizedPath, path, relativeFromResolved].filter(Boolean);
    applyFiles({ [normalizedPath]: newContent, [path]: newContent });
    useEditorStore.getState().loadFileContents({ [normalizedPath]: newContent, [path]: newContent });

    const tabMatches = matchPaths.some(p => activeTab === p || activeTab === normalizeFilePath(p));
    if (tabMatches && editorInstance) {
      const model = editorInstance.getModel();
      if (model && model.getValue() !== newContent) {
        model.setValue(newContent);
      }
    }

    setTabs(prev => {
      const exists = prev.some(t => matchPaths.some(p => t.name === p || t.name === normalizeFilePath(p)));
      if (!exists) {
        const info = getFileInfo(normalizedPath);
        return [...prev, { name: normalizedPath, icon: info.icon, color: info.color, modified: false }];
      }
      return prev.map(t => (
        matchPaths.some(p => t.name === p || t.name === normalizeFilePath(p)) ? { ...t, modified: false } : t
      ));
    });
    setActiveTab(normalizedPath);

    debouncedRefreshTree();
  }, [activeTab, editorInstance, debouncedRefreshTree, fileSystem.workspacePath, normalizeFilePath, applyFiles]);

  // Agent callback: file created on disk -> update tree + optionally open
  const handleAgentFileCreated = useCallback((path: string, content: string, absolutePath?: string) => {
    const normalizedPath = normalizeFilePath(path);
    applyFiles({ [normalizedPath]: content, [path]: content });
    useEditorStore.getState().loadFileContents({ [normalizedPath]: content, [path]: content });

    const activeWorkspacePath = fileSystem.workspacePath || useFileStore.getState().workspacePath;
    if (!activeWorkspacePath && absolutePath) {
      const derivedWorkspacePath = deriveWorkspaceRoot(normalizedPath, absolutePath);
      if (derivedWorkspacePath && isLikelyWorkspacePath(derivedWorkspacePath)) {
        const workspaceName = derivedWorkspacePath.split(/[\\/]/).filter(Boolean).pop() || 'Workspace';
        useFileStore.getState().openFolder(derivedWorkspacePath, workspaceName, useFileStore.getState().fileTree);
        setWorkspacePath(derivedWorkspacePath);
      }
    }

    const parentSegments = normalizedPath.split('/').slice(0, -1);
    let currentPath = '';
    for (const segment of parentSegments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      useFileStore.getState().expandPath(currentPath);
    }

    setTabs(prev => {
      if (prev.some(t => t.name === normalizedPath)) {
        return prev;
      }
      const info = getFileInfo(normalizedPath);
      return [...prev, { name: normalizedPath, icon: info.icon, color: info.color, modified: false }];
    });
    setActiveTab(normalizedPath);
    debouncedRefreshTree();
  }, [debouncedRefreshTree, deriveWorkspaceRoot, fileSystem.workspacePath, isLikelyWorkspacePath, normalizeFilePath, setWorkspacePath, applyFiles]);

  // Agent callback: file deleted on disk -> close tab + update tree
  const handleAgentFileDeleted = useCallback((path: string) => {
    const fileName = path.includes('/') ? path : path;
    setTabs(prev => {
      const filtered = prev.filter(t => t.name !== path && t.name !== fileName);
      if ((activeTab === path || activeTab === fileName) && filtered.length > 0) {
        setActiveTab(filtered[filtered.length - 1].name);
      } else if (filtered.length === 0) {
        setActiveTab('');
      }
      return filtered;
    });
    delete fileContentsRef.current[path];
    delete fileContentsRef.current[fileName];
    debouncedRefreshTree();
  }, [activeTab, debouncedRefreshTree]);

  // Agent callback: terminal command ran -> track history + refresh tree
  const handleAgentTerminalCommand = useCallback((command: string, output: string, exitCode: number) => {
    setTerminalHistory(prev => [...prev.slice(-19), { command, output: output.slice(0, 2000), exitCode }]);
    debouncedRefreshTree();
  }, [debouncedRefreshTree]);

  // OS platform (cached)
  const [osPlatform, setOsPlatform] = useState('');
  useEffect(() => {
    if (isElectron && electronAPI) {
      electronAPI.app.getPlatform().then(p => setOsPlatform(p));
    }
  }, []);

  // Diff decorations
  const applyDiffDecorations = useCallback((oldContent: string, newContent: string) => {
    if (!editorInstance || !monacoInstance) return;
    const model = editorInstance.getModel();
    if (!model) return;
    const currentDiff = pendingDiffRef.current;
    if (currentDiff?.decorationIds?.length) {
      editorInstance.deltaDecorations(currentDiff.decorationIds, []);
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
  }, [editorInstance, monacoInstance, activeTab]);

  // No-tools callback: block send and show CTA (open folder or use desktop)
  const handleNoToolsAvailable = useCallback((reason: import('@/lib/agent-capabilities').ToolsDisabledReason) => {
    if (reason === 'NO_WORKSPACE') {
      fileSystem.openFolder();
    } else if (reason === 'WEB_RUNTIME') {
      alert('File editing and terminal tools require the Titan Desktop app. Open this project in the desktop app to use the agent.');
    } else {
      alert('Tools are not available. Open a folder (File > Open Folder) to enable file editing.');
    }
  }, [fileSystem]);

  // Memoized stable references — prevent handleSend and useChat internals from
  // re-running on every render caused by new array/object literals.
  const openTabNames = useMemo(() => tabs.map(t => t.name), [tabs]);
  const cursorPos = useMemo(
    () => ({ line: cursorPosition.line, column: cursorPosition.column, file: activeTab }),
    [cursorPosition.line, cursorPosition.column, activeTab],
  );

  // Chat -- wired up with all callbacks and context
  const chat = useChat({
    sessions, setSessions, activeSessionId,
    activeModel: settings.activeModel, activeTab, fileContents: fileContentsRef.current, editorInstance,
    onFileEdited: handleAgentFileEdited,
    onFileCreated: handleAgentFileCreated,
    onFileDeleted: handleAgentFileDeleted,
    onTerminalCommand: handleAgentTerminalCommand,
    workspacePath: fileSystem.workspacePath || useFileStore.getState().workspacePath,
    openTabs: openTabNames,
    terminalHistory,
    cursorPosition: cursorPos,
    isDesktop: isElectron,
    osPlatform,
    onNoToolsAvailable: handleNoToolsAvailable,
  });

  // Apply changes
  const handleApplyChanges = useCallback(() => {
    const currentDiff = pendingDiffRef.current;
    if (currentDiff && editorInstance && monacoInstance) {
      const model = editorInstance.getModel();
      if (model) {
        if (currentDiff.decorationIds.length > 0) editorInstance.deltaDecorations(currentDiff.decorationIds, []);
        model.setValue(currentDiff.newContent);
        applyFiles({ [currentDiff.file]: currentDiff.newContent });
        setTabs(prev => prev.map(t => t.name === currentDiff.file ? { ...t, modified: true } : t));
        setPendingDiff(null);
      }
    }
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, changedFiles: [] } : s));
  }, [editorInstance, monacoInstance, activeSessionId, setSessions, applyFiles]);

  // Editor commands
  const executeCommand = useCallback((command: string) => {
    switch (command) {
      case 'newFile': {
        const newFileName = `untitled-${Date.now()}.ts`;
        applyFiles({ [newFileName]: '// New file\n' });
        useEditorStore.getState().loadFileContents({ [newFileName]: '// New file\n' });
        const info = getFileInfo(newFileName);
        setTabs(prev => [...prev, { name: newFileName, icon: info.icon, color: info.color }]);
        setActiveTab(newFileName);
        return;
      }
      case 'file.openFolder': return fileSystem.openFolder();
      case 'file.openFile': return fileSystem.openFile();
      case 'save': {
        setTabs(prev => prev.map(t => t.name === activeTab ? { ...t, modified: false } : t));
        if (fileSystem.directoryHandle && activeTab) {
          const latest = fileContentsRef.current[activeTab] ?? editorInstance?.getValue() ?? '';
          fileSystem.writeFile(activeTab, latest);
        }
        return;
      }
      case 'saveAll': { setTabs(prev => prev.map(t => ({ ...t, modified: false }))); return; }
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
  }, [editorInstance, monacoInstance, activeTab, fileSystem, applyFiles]);

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

  // File system watcher -- auto-refresh tree + editor when files change on disk
  useEffect(() => {
    if (!isElectron || !electronAPI || !fileSystem.workspacePath) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingChanges = new Set<string>();

    const cleanup = electronAPI.fs.watchFolder(fileSystem.workspacePath, (event: string, filePath: string) => {
      if (event === 'change') {
        pendingChanges.add(filePath);
      }

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        useFileStore.getState().refreshFileTree();

        for (const changedPath of pendingChanges) {
          const relPath = changedPath.replace(fileSystem.workspacePath + '/', '').replace(fileSystem.workspacePath + '\\', '');
          const fileName = relPath.replace(/\\/g, '/');
          const isOpen = tabs.some(t => t.name === fileName || t.name === relPath);
          if (isOpen && electronAPI) {
            try {
              const content = await electronAPI.fs.readFile(changedPath);
              applyFiles({ [fileName]: content, [relPath]: content });
              useEditorStore.getState().loadFileContents({ [fileName]: content, [relPath]: content });
              if ((activeTab === fileName || activeTab === relPath) && editorInstance) {
                const model = editorInstance.getModel();
                if (model && model.getValue() !== content) {
                  model.setValue(content);
                }
              }
            } catch { /* file may have been deleted */ }
          }
        }
        pendingChanges.clear();
      }, 300);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      cleanup();
    };
  }, [fileSystem.workspacePath, tabs, activeTab, editorInstance, applyFiles]);

  // Close dropdowns
  useEffect(() => {
    const handleClick = () => { setShowPlusDropdown(false); settings.setShowModelDropdown(false); };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [settings]);

  // Chat scroll logic is in TitanAgentPanel where the DOM container lives.

  // Persist tabs/editor state — debounced so JSON.stringify doesn't block typing
  const persistTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!mounted) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem('titan-ide-state', JSON.stringify({
          tabs: tabs.map(t => ({ name: t.name, icon: t.icon, color: t.color, modified: t.modified })),
          activeTab, gitBranch,
        }));
      } catch { /* ignore */ }
    }, 500);
    return () => { if (persistTimerRef.current) clearTimeout(persistTimerRef.current); };
  }, [mounted, tabs, activeTab, gitBranch]);

  useEffect(() => {
    if (!mounted) return;
    try {
      const saved = localStorage.getItem('titan-ide-state');
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
    <GitHubAuthProvider>
    <div suppressHydrationWarning className="h-screen w-screen flex flex-col bg-[#1e1e1e] text-[#cccccc] overflow-hidden" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
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
          <ActivityIcon active={activeView === 'forge'} onClick={() => handleActivityClick('forge')} title="Forge Dashboard"><ForgeIcon /></ActivityIcon>
          <ActivityIcon active={activeView === 'midnight'} onClick={() => handleActivityClick('midnight')} title="Project Midnight"><MoonIcon /></ActivityIcon>
          <ActivityIcon active={activeView === 'alfred'} onClick={() => handleActivityClick('alfred')} title="Alfred — AI Companion"><AlfredIcon /></ActivityIcon>
          <ActivityIcon active={activeView === 'training-lab'} onClick={() => handleActivityClick('training-lab')} title="LLM Training Lab"><FlaskIcon /></ActivityIcon>
          <ActivityIcon active={activeView === 'brain'} onClick={() => handleActivityClick('brain')} title="Titan Brain Observatory"><BrainIcon /></ActivityIcon>
          <div className="flex-1" />
          <ActivityIcon active={activeView === 'accounts'} onClick={() => handleActivityClick('accounts')} title="Accounts"><AccountIcon /></ActivityIcon>
          <ActivityIcon active={activeView === 'settings'} onClick={() => handleActivityClick('settings')} title="Settings"><SettingsGearIcon /></ActivityIcon>
        </div>

        {/* LEFT PANEL */}
        {activeView && activeView !== 'explorer' && (
          <div className={`${activeView === 'midnight' || activeView === 'alfred' ? 'w-[600px]' : 'w-[420px]'} bg-[#1e1e1e] border-r border-[#3c3c3c] flex flex-col shrink-0 overflow-hidden transition-all duration-300`}>
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
                attachments={chat.attachments} onAddAttachments={chat.addAttachments} onRemoveAttachment={chat.removeAttachment}
                capabilities={chat.capabilities} lastToolResult={chat.lastToolResult} onOpenFolder={fileSystem.openFolder}
                onRenameSession={handleRenameSession} onDeleteSession={handleDeleteSession}
                hasPendingDiff={pendingDiff !== null}
                onRejectDiff={() => {
                  const currentDiff = pendingDiffRef.current;
                  if (currentDiff && editorInstance) {
                    const model = editorInstance.getModel();
                    if (model) {
                      if (currentDiff.decorationIds.length > 0) editorInstance.deltaDecorations(currentDiff.decorationIds, []);
                      model.setValue(currentDiff.oldContent);
                    }
                  }
                  setPendingDiff(null);
                }}
                onRetry={(message) => {
                  setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: (s.messages || []).filter(m => !m.isError) } : s));
                  chat.setChatInput(message);
                  setTimeout(() => chat.handleSend(), 100);
                }}
                onApplyCode={(code, filename) => {
                  const targetFile = filename || activeTab;
                  if (targetFile) {
                    applyFiles({ [targetFile]: code });
                    useEditorStore.getState().loadFileContents({ [targetFile]: code });
                    if (targetFile === activeTab && editorInstance) {
                      const model = editorInstance.getModel();
                      if (model) model.setValue(code);
                    }
                    if (fileSystem.directoryHandle) fileSystem.writeFile(targetFile, code);
                  }
                }}
              />
            )}
            {activeView === 'forge' && <ForgeDashboard />}
            {activeView === 'midnight' && (
              <MidnightPanel
                midnightActive={midnight.midnightActive}
                trustLevel={midnight.trustLevel}
                protocolMode={midnight.protocolMode}
                setTrustLevel={midnight.setTrustLevel}
                setProtocolMode={midnight.setProtocolMode}
                startMidnight={midnight.startMidnight}
                stopMidnight={midnight.stopMidnight}
                activeModel={settings.activeModel}
                startError={midnight.startError}
                isStarting={midnight.isStarting}
                onBackToIDE={() => setActiveView('explorer')}
              />
            )}
            {activeView === 'alfred' && <AlfredPanel onBackToIDE={() => setActiveView('explorer')} />}
            {activeView === 'training-lab' && <TrainingLabPanel />}
            {activeView === 'brain' && <BrainObservatoryPanel />}
            {activeView === 'accounts' && <AccountsPanel />}
            {activeView === 'settings' && (
              <SettingsPanel
                fontSize={settings.fontSize} setFontSize={settings.setFontSize}
                tabSize={settings.tabSize} setTabSize={settings.setTabSize}
                wordWrap={settings.wordWrap} setWordWrap={settings.setWordWrap}
                activeModel={settings.activeModel} setActiveModel={settings.setActiveModel}
                models={settings.models} trustLevel={midnight.trustLevel}
                setTrustLevel={midnight.setTrustLevel} midnightActive={midnight.midnightActive}
                protocolMode={midnight.protocolMode} setProtocolMode={midnight.setProtocolMode}
              />
            )}
          </div>
        )}

        {/* CENTER: Editor + Terminal */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <EditorArea
            tabs={tabs} activeTab={activeTab}
            getFileContent={getFileContent}
            onFileContentChange={onFileContentChange}
            setTabs={setTabs}
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

        {/* RIGHT PANEL - File Explorer + Lane Panel */}
        {showRightPanel && (
          <div className="w-[280px] bg-[#1e1e1e] border-l border-[#3c3c3c] flex flex-col shrink-0 overflow-hidden">
            {settings.activeModel === 'titan-protocol-v2' ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ flex: '0 0 auto', maxHeight: '50%', overflow: 'auto', borderBottom: '1px solid #3c3c3c' }}>
                  <LanePanel />
                </div>
                <div style={{ flex: 1, overflow: 'auto' }}>
                  <IDEFileExplorer onFileOpen={handleExplorerFileOpen} />
                </div>
              </div>
            ) : settings.activeModel === 'titan-supreme-protocol' ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ flex: '0 0 auto', maxHeight: '55%', overflow: 'auto', borderBottom: '1px solid #3c3c3c' }}>
                  <SupremePanel />
                </div>
                <div style={{ flex: 1, overflow: 'auto' }}>
                  <IDEFileExplorer onFileOpen={handleExplorerFileOpen} />
                </div>
              </div>
            ) : (
              <IDEFileExplorer onFileOpen={handleExplorerFileOpen} />
            )}
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
        creatorModeActive={titanSession?.user?.creatorModeOn === true}
      />

      {/* Factory View — only mount while open so its polling/SSE are inactive otherwise */}
      {midnight.showFactoryView && (
        <FactoryView
          isOpen={midnight.showFactoryView}
          onClose={() => midnight.setShowFactoryView(false)}
          onStop={midnight.stopMidnight}
          trustLevel={midnight.trustLevel}
        />
      )}
    </div>
    </GitHubAuthProvider>
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

function TitanAgentPanel({ sessions, activeSessionId, setActiveSessionId, currentSession, chatInput, setChatInput, isThinking, isStreaming, activeModel, onNewAgent, onSend, onStop, onKeyDown, onApply, chatEndRef, hasPendingDiff, onRejectDiff, onRenameSession, onDeleteSession, onRetry, onApplyCode, attachments, onAddAttachments, onRemoveAttachment, capabilities, lastToolResult, onOpenFolder }: {
  sessions: Session[]; activeSessionId: string; setActiveSessionId: (id: string) => void; currentSession: Session;
  chatInput: string; setChatInput: (v: string) => void; isThinking: boolean; isStreaming: boolean; activeModel: string;
  onNewAgent: () => void; onSend: () => void; onStop: () => void; onKeyDown: (e: React.KeyboardEvent) => void; onApply: () => void; chatEndRef: React.MutableRefObject<HTMLDivElement | null>;
  hasPendingDiff?: boolean; onRejectDiff?: () => void;
  onRenameSession?: (id: string, name: string) => void; onDeleteSession?: (id: string) => void;
  onRetry?: (message: string) => void;
  onApplyCode?: (code: string, filename?: string) => void;
  attachments?: FileAttachment[];
  onAddAttachments?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  capabilities?: import('@/lib/agent-capabilities').AgentCapabilities;
  lastToolResult?: import('@/hooks/useAgentTools').ToolResult | null;
  onOpenFolder?: () => void;
}) {
  const [showFiles, setShowFiles] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef(chatInput);
  chatInputRef.current = chatInput;

  const chatMode = usePlanStore((s) => s.chatMode);
  const setChatMode = usePlanStore((s) => s.setChatMode);

  const voiceAutoSend = useCallback(() => {
    if (chatInputRef.current.trim()) {
      const chatModeNow = usePlanStore.getState().chatMode;
      if (chatModeNow === 'plan') {
        // handlePlanSend is not in scope here, but effectiveSend will be
      } else {
        onSend();
      }
    }
  }, [onSend]);

  const voice = useVoiceInput(
    useCallback((text: string) => {
      setChatInput(chatInputRef.current + text);
    }, [setChatInput]),
    { onAutoSend: voiceAutoSend, autoSendDelayMs: 2500 },
  );

  // ═══ Chat Scroll — respects user scroll position ═══
  const userScrolledUpRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  const checkIfNearBottom = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  }, []);

  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const onScroll = () => { userScrolledUpRef.current = !checkIfNearBottom(); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [checkIfNearBottom]);

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentSession?.messages, chatEndRef]);

  useEffect(() => {
    if (!isThinking && !isStreaming) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const scroll = () => {
      if (!userScrolledUpRef.current) {
        chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }
      timeoutId = setTimeout(scroll, 300);
    };
    scroll();
    return () => clearTimeout(timeoutId);
  }, [isThinking, isStreaming, chatEndRef]);

  // ═══ Titan Voice (TTS + Proactive Thoughts) ═══
  const titanVoice = useTitanVoice();
  const [activeThought, setActiveThought] = useState<ProactiveThought | null>(null);

  useEffect(() => {
    if (!titanVoice.voiceEnabled) return;
    const engine = getThoughtEngine();
    engine.start(
      (thought) => setActiveThought(thought),
      () => {
        const plan = usePlanStore.getState();
        const tasks = Object.values(plan.tasks);
        return tasks.length > 0 ? `Working on "${plan.planName}" — ${tasks.filter(t => t.status === 'completed').length}/${tasks.length} done` : 'General session';
      },
    );
    startKnowledgeIngestion();
    return () => { engine.stop(); };
  }, [titanVoice.voiceEnabled]);

  const handleDismissThought = useCallback(() => setActiveThought(null), []);
  const handleTellMoreThought = useCallback((thought: ProactiveThought) => {
    setChatInput(`Tell me more about: ${thought.text.slice(0, 100)}`);
  }, [setChatInput]);
  const handleSnoozeThoughts = useCallback((durationMs: number) => {
    titanVoice.snoozeThoughts(durationMs);
    setActiveThought(null);
  }, [titanVoice]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [chatInput]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      onAddAttachments?.(imageFiles);
    }
  }, [onAddAttachments]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) onAddAttachments?.(files);
  }, [onAddAttachments]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleFilePickerChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) onAddAttachments?.(files);
    e.target.value = '';
  }, [onAddAttachments]);

  const [planGenerating, setPlanGenerating] = useState(false);

  const handlePlanSend = useCallback(async () => {
    const input = chatInput.trim();
    if (!input || planGenerating) return;
    setChatInput('');
    setPlanGenerating(true);

    const planStore = usePlanStore.getState();
    planStore.addMemory({ type: 'reminder', title: 'Plan Goal', content: `User request: ${input}`, linkedTaskIds: [], pinned: true, expiresAt: null });

    try {
      const res = await fetch('/api/plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input }),
      });

      const data = await res.json();

      if (data.error) {
        planStore.addReport({ type: 'error', severity: 'critical', title: 'Plan Generation Failed', details: data.error, taskId: null, resolved: false });
        return;
      }

      const tasks = data.tasks as Array<{ title: string; description: string; phase: number; priority: 'critical' | 'high' | 'medium' | 'low'; tags: string[] }>;

      if (Array.isArray(tasks) && tasks.length > 0) {
        planStore.bulkAddTasks(tasks.map(t => ({
          title: t.title || 'Untitled task',
          description: t.description || '',
          phase: t.phase || 1,
          priority: t.priority || 'medium',
          tags: Array.isArray(t.tags) ? t.tags : [],
        })));
        planStore.addReport({ type: 'progress', severity: 'info', title: 'Plan Generated', details: `Created ${tasks.length} tasks from: "${input}"`, taskId: null, resolved: false });
      } else {
        planStore.addReport({ type: 'error', severity: 'warning', title: 'Plan Generation Failed', details: 'Could not parse tasks from AI response. Try being more specific.', taskId: null, resolved: false });
      }
    } catch (err) {
      usePlanStore.getState().addReport({ type: 'error', severity: 'critical', title: 'Plan Generation Error', details: (err as Error).message, taskId: null, resolved: false });
    } finally {
      setPlanGenerating(false);
    }
  }, [chatInput, setChatInput, planGenerating]);

  const handlePlanKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handlePlanSend();
    }
  }, [handlePlanSend]);

  const effectiveSend = chatMode === 'plan' ? handlePlanSend : onSend;
  const effectiveKeyDown = chatMode === 'plan' ? handlePlanKeyDown : onKeyDown;
  const effectiveThinking = chatMode === 'plan' ? planGenerating : isThinking;
  const effectiveStreaming = chatMode === 'plan' ? planGenerating : isStreaming;

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      <div className="px-3 pt-3 pb-2 shrink-0 border-b border-[#2d2d2d]">
        <button onClick={onNewAgent} className="w-full h-[32px] bg-[#2d2d2d] hover:bg-[#3c3c3c] text-[#e0e0e0] text-[12px] font-medium rounded-md flex items-center justify-center gap-1.5 border border-[#3c3c3c] transition-colors">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a.75.75 0 01.75.75v5.5h5.5a.75.75 0 010 1.5h-5.5v5.5a.75.75 0 01-1.5 0v-5.5h-5.5a.75.75 0 010-1.5h5.5v-5.5A.75.75 0 018 1z"/></svg>
          New Thread
        </button>
      </div>
      {capabilities && (
        <div className="px-3 py-2 shrink-0 border-b border-[#2d2d2d]">
          <ToolsStatus capabilities={capabilities} lastResult={lastToolResult ?? null} onOpenFolder={onOpenFolder} showTelemetry={false} />
        </div>
      )}
      <div className="px-1 pt-1 shrink-0 max-h-[160px] overflow-y-auto">
        {sessions.map(s => (
          <div key={s.id} className={`group relative rounded mb-px ${activeSessionId === s.id ? 'bg-[#37373d]' : 'hover:bg-[#2a2a2a]'}`}>
            <button onClick={() => setActiveSessionId(s.id)} className="w-full text-left px-3 py-1.5 pr-8">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeSessionId === s.id ? 'bg-[#569cd6]' : 'bg-[#555]'}`} />
                <span className="text-[12px] text-[#cccccc] truncate">{s.name}</span>
              </div>
            </button>
            <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100">
              <button onClick={(e) => { e.stopPropagation(); document.getElementById(`session-menu-${s.id}`)?.classList.toggle('hidden'); }} className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#3c3c3c] text-[#808080] text-[10px]">···</button>
              <div id={`session-menu-${s.id}`} className="hidden absolute right-0 top-6 z-50 bg-[#252526] border border-[#3c3c3c] rounded shadow-lg min-w-[120px]">
                <button onClick={(e) => { e.stopPropagation(); const n = prompt('Rename:', s.name); if (n?.trim()) onRenameSession?.(s.id, n.trim()); document.getElementById(`session-menu-${s.id}`)?.classList.add('hidden'); }} className="w-full text-left px-3 py-1.5 text-[12px] text-[#cccccc] hover:bg-[#2a2d2e]">Rename</button>
                <button onClick={(e) => { e.stopPropagation(); document.getElementById(`session-menu-${s.id}`)?.classList.add('hidden'); if (sessions.length > 1) onDeleteSession?.(s.id); }} className="w-full text-left px-3 py-1.5 text-[12px] text-[#f48771] hover:bg-[#2a2d2e]">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {chatMode === 'plan' ? (
        <div className="flex-1 overflow-hidden min-h-0">
          {planGenerating && (
            <div className="px-4 py-3 flex items-center gap-2 text-[12px] text-[#a78bfa] border-b border-[#2d2d2d] bg-[#1a1a2e]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83"/></svg>
              Generating plan tasks...
            </div>
          )}
          <PlanModePanel />
        </div>
      ) : (
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 titan-chat-scroll">
          <div className="px-3 py-3 max-w-full">
            {(currentSession?.messages || []).map((msg, i) => (
              <ChatMessage key={i} role={msg.role as 'user' | 'assistant'} content={msg.content} attachments={msg.attachments} thinking={msg.thinking} thinkingTime={msg.thinkingTime} streaming={msg.streaming} streamingModel={msg.streamingModel} streamingProvider={msg.streamingProvider} streamingProviderModel={msg.streamingProviderModel} isError={msg.isError} retryMessage={msg.retryMessage} activeModel={activeModel} toolCalls={msg.toolCalls} codeDiffs={msg.codeDiffs} generatedImages={msg.generatedImages} onRetry={onRetry} onApplyCode={onApplyCode} />
            ))}
            {isThinking && !(currentSession?.messages || []).some(m => m.streaming) && (
              <div className="mb-4 flex items-center gap-2 px-1">
                <div className="flex items-center gap-2 text-[12px] text-[#808080]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#569cd6" strokeWidth="2" className="animate-spin"><path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83"/></svg>
                  <span>Thinking...</span>
                </div>
              </div>
            )}
            <div ref={(node) => { chatEndRef.current = node; }} />
          </div>
        </div>
      )}
      <div className="shrink-0 border-t border-[#2d2d2d]">
        {hasPendingDiff && (
          <div className="px-3 py-2 bg-[#1a2332] border-b border-[#2d2d2d]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-[#3fb950] rounded-full animate-pulse" />
                <span className="text-[11px] text-[#e0e0e0]">Changes ready to apply</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={onRejectDiff} className="h-[22px] px-2 bg-[#da3633] hover:bg-[#f85149] text-white text-[11px] rounded">Reject</button>
                <button onClick={onApply} className="h-[22px] px-2 bg-[#238636] hover:bg-[#2ea043] text-white text-[11px] rounded">Accept</button>
              </div>
            </div>
          </div>
        )}
        {(currentSession?.changedFiles?.length || 0) > 0 && !hasPendingDiff && (
          <div className="border-b border-[#2d2d2d]">
            <button onClick={() => setShowFiles(!showFiles)} className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[#808080] hover:text-[#cccccc]">
              <div className="flex items-center gap-1.5">
                <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor" className={`transition-transform ${showFiles ? 'rotate-90' : ''}`}><path d="M6 4l4 4-4 4z"/></svg>
                <span>{currentSession.changedFiles?.length || 0} file{(currentSession.changedFiles?.length || 0) !== 1 ? 's' : ''} changed</span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onApply(); }} className="h-[20px] px-2 bg-[#238636] hover:bg-[#2ea043] text-white text-[10px] rounded">Apply All</button>
            </button>
            {showFiles && (
              <div className="px-3 pb-1.5">
                {(currentSession?.changedFiles || []).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 py-0.5 text-[11px]">
                    <span style={{ color: f.color }} className="text-[9px]">{f.icon}</span>
                    <span className="text-[#cccccc] truncate flex-1">{f.name}</span>
                    <span className="text-[#3fb950]">+{f.additions}</span>
                    <span className="text-[#f85149]">-{f.deletions}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="p-2" onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFilePickerChange} />
            <div className={`bg-[#252526] border rounded-lg transition-colors ${isDragOver ? 'border-[#569cd6] bg-[#569cd6]/10' : chatMode === 'plan' ? 'plan-mode-input' : chatMode === 'chat' ? 'chat-mode-input' : 'border-[#3c3c3c] focus-within:border-[#569cd6]'}`}>
            {isDragOver && (
              <div className="px-3 py-2 text-center text-[12px] text-[#569cd6]">Drop images here</div>
            )}
            {attachments && attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-3 pt-2">
                {attachments.map(att => (
                  <div key={att.id} className="relative group w-14 h-14 rounded-md overflow-hidden border border-[#3c3c3c] bg-[#2d2d2d]">
                    <img src={att.previewUrl} alt="" className="w-full h-full object-cover" />
                    {att.status === 'pending' && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    <button
                      onClick={() => onRemoveAttachment?.(att.id)}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-[#f85149] rounded-full flex items-center justify-center text-white text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea ref={textareaRef} value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={effectiveKeyDown} onPaste={handlePaste} placeholder={voice.isListening ? 'Listening...' : chatMode === 'chat' ? 'Chat with Titan...' : chatMode === 'plan' ? 'Describe what you want to build...' : 'Ask Titan to edit code, fix bugs, run commands...'} rows={1} className="w-full bg-transparent px-3 py-2 text-[13px] text-[#e0e0e0] placeholder-[#555] focus:outline-none resize-none leading-5 max-h-[120px]" />
            {voice.interimText && (
              <div className="px-3 pb-1 text-[12px] text-[#666] italic">{voice.interimText}</div>
            )}
            {voice.errorMessage && (
              <div className="mx-3 mb-1 px-2 py-1 text-[11px] rounded bg-[#f851491a] text-[#f85149] flex items-center justify-between">
                <span>{voice.errorMessage}</span>
                <button onClick={voice.clearError} className="ml-2 opacity-60 hover:opacity-100">&times;</button>
              </div>
            )}
            <div className="flex items-center justify-between px-2 pb-1.5">
              <div className="flex items-center gap-2">
                <div className="mode-toggle">
                  <button onClick={() => setChatMode('agent')} className={`mode-toggle-btn ${chatMode === 'agent' ? 'active-agent' : ''}`}>Agent</button>
                  <button onClick={() => setChatMode('chat')} className={`mode-toggle-btn ${chatMode === 'chat' ? 'active-chat' : ''}`}>Chat</button>
                  <button onClick={() => setChatMode('plan')} className={`mode-toggle-btn ${chatMode === 'plan' ? 'active-plan' : ''}`}>Plan</button>
                </div>
                <span className="text-[10px] text-[#555] flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${effectiveThinking || effectiveStreaming ? 'bg-[#f9826c] animate-pulse' : chatMode === 'chat' ? 'bg-[#22c55e]' : chatMode === 'plan' ? 'bg-[#a855f7]' : 'bg-[#3fb950]'}`} />
                  {activeModel}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => fileInputRef.current?.click()} className="w-[26px] h-[26px] flex items-center justify-center rounded-md hover:bg-[#3c3c3c] text-[#808080] hover:text-[#cccccc] transition-colors" title="Attach image">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </button>
                {voice.isSupported && (
                  <button onClick={voice.toggleListening} className={`w-[26px] h-[26px] flex items-center justify-center rounded-md transition-colors ${voice.isListening ? 'bg-[#f85149] text-white animate-pulse' : 'hover:bg-[#3c3c3c] text-[#808080] hover:text-[#cccccc]'}`} title={voice.isListening ? 'Stop recording' : 'Voice input'}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                  </button>
                )}
                <button onClick={() => { titanVoice.voiceEnabled ? (titanVoice.isSpeaking ? titanVoice.stopSpeaking() : titanVoice.toggleAutoSpeak()) : titanVoice.toggleVoice(); }} className={`w-[26px] h-[26px] flex items-center justify-center rounded-md transition-colors ${titanVoice.isSpeaking ? 'bg-[#3b82f6] text-white animate-pulse' : titanVoice.voiceEnabled ? (titanVoice.autoSpeak ? 'bg-[#3b82f620] text-[#3b82f6]' : 'text-[#3b82f6] hover:bg-[#3c3c3c]') : 'hover:bg-[#3c3c3c] text-[#808080] hover:text-[#cccccc]'}`} title={titanVoice.isSpeaking ? 'Stop speaking' : titanVoice.voiceEnabled ? (titanVoice.autoSpeak ? 'Auto-speak ON (click to toggle)' : 'Auto-speak OFF (click to toggle)') : 'Enable Titan Voice'}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>{titanVoice.voiceEnabled && <><line x1="15.54" y1="8.46" x2="19.07" y2="12"/><line x1="15.54" y1="15.54" x2="19.07" y2="12"/></>}</svg>
                </button>
                {effectiveThinking || effectiveStreaming ? (
                  <button onClick={onStop} className="w-[26px] h-[26px] flex items-center justify-center rounded-md bg-[#f85149] hover:bg-[#da3633] text-white transition-colors" title="Stop">
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1.5"/></svg>
                  </button>
                ) : (
                  <button onClick={effectiveSend} disabled={!chatInput.trim() && (!attachments || attachments.length === 0)} className={`w-[26px] h-[26px] flex items-center justify-center rounded-md transition-colors ${chatInput.trim() || (attachments && attachments.length > 0) ? 'bg-[#569cd6] hover:bg-[#6eb0e6] text-white' : 'bg-[#2d2d2d] text-[#555]'}`} title="Send (Enter)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Titan Voice Proactive Thought Popup */}
      <TitanVoicePopup
        thought={activeThought}
        onDismiss={handleDismissThought}
        onTellMore={handleTellMoreThought}
        onSnooze={handleSnoozeThoughts}
      />
      {/* TTS Speaking Indicator */}
      {titanVoice.isSpeaking && (
        <div className="fixed bottom-[72px] right-5 z-[9998] flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#3b82f620] border border-[#3b82f640]">
          <div className="flex items-center gap-0.5">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="w-[3px] bg-[#3b82f6] rounded-full animate-pulse" style={{ height: `${8 + Math.random() * 10}px`, animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
          <span className="text-[11px] text-[#3b82f6]">Speaking...</span>
          <button onClick={() => titanVoice.stopSpeaking()} className="text-[#3b82f6] opacity-60 hover:opacity-100 text-sm">✕</button>
        </div>
      )}
    </div>
  );
}

function ExtensionsPanel() {
  const installed = [
    { name: 'Titan Chat', version: '1.0.0', desc: 'Core conversational AI protocol', tone: 'cyan' },
    { name: 'Phoenix Protocol', version: '1.0.0', desc: 'Multi-agent orchestration with parallel workers', tone: 'amber' },
    { name: 'Supreme Protocol', version: '1.0.0', desc: 'Specialized 3-worker pipeline with oversight', tone: 'purple' },
    { name: 'Omega Protocol', version: '1.0.0', desc: 'Deep-research multi-specialist engine', tone: 'green' },
    { name: 'Project Midnight', version: '1.0.0', desc: 'Autonomous build engine with trust levels', tone: 'red' },
    { name: 'Alfred (Titan Voice)', version: '1.0.0', desc: 'AI companion with TTS, proactive thoughts, and system control', tone: 'cyan' },
    { name: 'Plan Sniper', version: '1.0.0', desc: '7-role model orchestra for ultimate plan execution', tone: 'amber' },
  ];
  const upcoming = [
    { name: 'Theme Studio', desc: 'Custom UI themes and color schemes' },
    { name: 'Language Packs', desc: 'Additional language support and grammars' },
    { name: 'Custom Protocols', desc: 'Create and share your own AI protocols' },
    { name: 'Plugin Marketplace', desc: 'Community extensions and integrations' },
  ];
  const toneColors: Record<string, string> = {
    cyan: 'border-cyan-500/40 text-cyan-300',
    amber: 'border-amber-500/40 text-amber-300',
    purple: 'border-violet-500/40 text-violet-300',
    green: 'border-emerald-500/40 text-emerald-300',
    red: 'border-red-500/40 text-red-300',
  };
  return (
    <div className="h-full overflow-y-auto p-3 space-y-3 bg-[#090f1b] text-slate-100">
      <div className="relative rounded-xl border border-cyan-500/30 bg-[linear-gradient(135deg,#0b1222_0%,#101a32_55%,#1a1232_100%)] shadow-[0_0_30px_rgba(34,211,238,0.15)] p-4 overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none [background-image:linear-gradient(rgba(34,211,238,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.2)_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="relative z-10">
          <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/90">Titan Interface</div>
          <h2 className="mt-1 text-[18px] font-semibold text-white">EXTENSIONS</h2>
          <p className="mt-1 text-[12px] text-slate-300">Installed protocols, tools, and upcoming add-ons.</p>
        </div>
      </div>

      <div className="rounded-xl border border-cyan-500/40 bg-[#0d1322]/85 backdrop-blur-sm shadow-[0_0_24px_rgba(34,211,238,0.12)]">
        <div className="border-b border-white/10 px-3 py-2"><h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Active Protocols</h3></div>
        <div className="p-3 space-y-2">
          {installed.map((ext) => (
            <div key={ext.name} className={`flex items-center gap-3 rounded-lg border ${toneColors[ext.tone] || 'border-white/10 text-slate-200'} bg-[#0b1120]/70 p-2.5`}>
              <div className="w-9 h-9 rounded-lg border border-white/10 bg-[#0a1224] flex items-center justify-center text-[14px] font-bold flex-shrink-0">{ext.name[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium truncate">{ext.name} <span className="text-slate-500 font-normal">v{ext.version}</span></div>
                <div className="text-[11px] text-slate-400 truncate">{ext.desc}</div>
              </div>
              <span className="text-[10px] text-emerald-400 flex-shrink-0">Active</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-violet-500/40 bg-[#0d1322]/85 backdrop-blur-sm shadow-[0_0_24px_rgba(139,92,246,0.12)]">
        <div className="border-b border-white/10 px-3 py-2"><h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">Coming Soon</h3></div>
        <div className="p-3 space-y-2">
          {upcoming.map((ext) => (
            <div key={ext.name} className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#0b1120]/50 p-2.5 opacity-70">
              <div className="w-9 h-9 rounded-lg border border-white/10 bg-[#0a1224] flex items-center justify-center text-[14px] font-bold text-slate-500 flex-shrink-0">{ext.name[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-slate-300 truncate">{ext.name}</div>
                <div className="text-[11px] text-slate-500 truncate">{ext.desc}</div>
              </div>
              <span className="text-[10px] text-slate-500 flex-shrink-0">Soon</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AccountsPanel() {
  const { user } = useSession();
  const [apiKeys, setApiKeys] = useState<Record<string, { connected: boolean; key: string }>>({
    openai: { connected: false, key: '' },
    anthropic: { connected: false, key: '' },
    google: { connected: false, key: '' },
    openrouter: { connected: false, key: '' },
    deepseek: { connected: false, key: '' },
    mistral: { connected: false, key: '' },
  });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const handleAddKey = (provider: string) => {
    if (keyInput.trim()) {
      setApiKeys(prev => ({ ...prev, [provider]: { connected: true, key: keyInput.slice(0, 6) + '...' + keyInput.slice(-4) } }));
      setEditingKey(null);
      setKeyInput('');
    }
  };
  const providers = [
    { id: 'openai', name: 'OpenAI', letter: 'O', color: 'text-emerald-300' },
    { id: 'anthropic', name: 'Anthropic', letter: 'A', color: 'text-amber-300' },
    { id: 'google', name: 'Google AI', letter: 'G', color: 'text-cyan-300' },
    { id: 'openrouter', name: 'OpenRouter', letter: 'R', color: 'text-violet-300' },
    { id: 'deepseek', name: 'DeepSeek', letter: 'D', color: 'text-red-300' },
    { id: 'mistral', name: 'Mistral', letter: 'M', color: 'text-yellow-300' },
  ];
  return (
    <div className="h-full overflow-y-auto p-3 space-y-3 bg-[#090f1b] text-slate-100">
      <div className="relative rounded-xl border border-cyan-500/30 bg-[linear-gradient(135deg,#0b1222_0%,#101a32_55%,#1a1232_100%)] shadow-[0_0_30px_rgba(34,211,238,0.15)] p-4 overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none [background-image:linear-gradient(rgba(34,211,238,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.2)_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="relative z-10">
          <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/90">Titan Interface</div>
          <h2 className="mt-1 text-[18px] font-semibold text-white">ACCOUNTS</h2>
          <p className="mt-1 text-[12px] text-slate-300">User profile, connections, and API key management.</p>
        </div>
      </div>

      <div className="rounded-xl border border-emerald-500/40 bg-[#0d1322]/85 backdrop-blur-sm shadow-[0_0_24px_rgba(16,185,129,0.12)]">
        <div className="border-b border-white/10 px-3 py-2"><h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Profile</h3></div>
        <div className="p-3">
          <div className="flex items-center gap-3">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-12 h-12 rounded-full border-2 border-emerald-500/40" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center text-white text-[18px] font-bold border-2 border-emerald-500/40">
                {(user?.username || 'T')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-white font-medium truncate">{user?.name || user?.username || 'Not signed in'}</div>
              <div className="text-[12px] text-slate-400 truncate">{user?.email || 'No email'}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${user?.id ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-red-500/40 text-red-300 bg-red-500/10'}`}>
                  {user?.id ? 'Authenticated' : 'Not signed in'}
                </span>
                {user?.isCreator && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-300 bg-amber-500/10">Creator</span>
                )}
                {user?.role && user.role !== 'user' && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-violet-500/40 text-violet-300 bg-violet-500/10">{user.role}</span>
                )}
              </div>
            </div>
          </div>
          {user?.provider && (
            <div className="mt-3 text-[11px] text-slate-400">Signed in via <span className="text-cyan-300">{user.provider}</span></div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-violet-500/40 bg-[#0d1322]/85 backdrop-blur-sm shadow-[0_0_24px_rgba(139,92,246,0.12)]">
        <div className="border-b border-white/10 px-3 py-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">API Keys (BYOK)</h3>
            <span className="text-[10px] text-violet-400">Bring Your Own Key</span>
          </div>
        </div>
        <div className="p-3 space-y-2">
          {providers.map(p => {
            const data = apiKeys[p.id];
            return (
              <div key={p.id} className="rounded-lg border border-white/10 bg-[#0b1120]/70 p-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-7 h-7 rounded-lg border border-white/10 bg-[#0a1224] flex items-center justify-center text-[13px] font-bold ${p.color}`}>{p.letter}</span>
                    <span className="text-[12px] text-slate-200">{p.name}</span>
                  </div>
                  {data?.connected ? (
                    <span className="text-[11px] text-emerald-400">Connected</span>
                  ) : (
                    <button onClick={() => setEditingKey(p.id)} className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors">+ Add Key</button>
                  )}
                </div>
                {data?.connected && <div className="text-[10px] text-slate-500 mt-1 ml-9">{data.key}</div>}
                {editingKey === p.id && (
                  <div className="mt-2 flex gap-1">
                    <input
                      type="password"
                      placeholder={`Enter ${p.name} API key...`}
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      className="flex-1 bg-[#0a1224] border border-white/15 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-cyan-400/60"
                    />
                    <button onClick={() => handleAddKey(p.id)} className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] rounded transition-colors">Save</button>
                    <button onClick={() => { setEditingKey(null); setKeyInput(''); }} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white text-[10px] rounded transition-colors">Cancel</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ fontSize, setFontSize, tabSize, setTabSize, wordWrap, setWordWrap, activeModel, setActiveModel, models, trustLevel, setTrustLevel, midnightActive, protocolMode, setProtocolMode }: {
  fontSize: number; setFontSize: (v: number) => void; tabSize: number; setTabSize: (v: number) => void; wordWrap: boolean; setWordWrap: (v: boolean) => void; activeModel: string; setActiveModel: (v: string) => void; models: string[]; trustLevel: 1 | 2 | 3; setTrustLevel: (v: 1 | 2 | 3) => void; midnightActive: boolean; protocolMode: boolean; setProtocolMode: (v: boolean) => void;
}) {
  const { user, refreshUser } = useSession();
  const isCreator = user?.isCreator === true;
  const [creatorModeOn, setCreatorModeOn] = useState(user?.creatorModeOn ?? false);
  const [togglingCreatorMode, setTogglingCreatorMode] = useState(false);

  useEffect(() => {
    if (user?.creatorModeOn !== undefined) setCreatorModeOn(user.creatorModeOn);
  }, [user?.creatorModeOn]);

  const handleToggleCreatorMode = async () => {
    setTogglingCreatorMode(true);
    try {
      const newState = !creatorModeOn;
      const res = await fetch('/api/creator-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newState }),
      });
      if (res.ok) {
        setCreatorModeOn(newState);
        refreshUser();
      }
    } catch { /* ignore */ } finally {
      setTogglingCreatorMode(false);
    }
  };

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
        {isCreator && (
          <>
            <div className="text-[11px] font-semibold text-amber-400 uppercase px-2 py-1.5 mt-3 flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-amber-400"><path d="M12 15l-2 5l9-11h-5l2-5L7 15h5z" stroke="currentColor" strokeWidth="1.5" fill={creatorModeOn ? 'currentColor' : 'none'}/></svg>
              Creator Mode
            </div>
            <div className="flex items-center justify-between px-2 py-1.5">
              <div>
                <span className="text-[12px] text-[#cccccc]">Dev Mode</span>
                <div className="text-[10px] text-[#666] mt-0.5">Open internal architecture discussion</div>
              </div>
              <button
                onClick={handleToggleCreatorMode}
                disabled={togglingCreatorMode}
                className={`w-10 h-5 rounded-full ${creatorModeOn ? 'bg-amber-500' : 'bg-[#3c3c3c]'} relative transition-colors`}
              >
                <span className={`absolute top-0.5 ${creatorModeOn ? 'right-0.5' : 'left-0.5'} w-4 h-4 bg-white rounded-full transition-all`} />
              </button>
            </div>
          </>
        )}
        <div className="text-[11px] font-semibold text-purple-400 uppercase px-2 py-1.5 mt-3 flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-purple-400"><path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" stroke="currentColor" strokeWidth="1.5" fill={midnightActive ? 'currentColor' : 'none'}/></svg>
          Project Midnight
        </div>
        <div className="px-2 py-2"><TrustSlider value={trustLevel} onChange={setTrustLevel} disabled={midnightActive} /></div>
        <div className="flex items-center justify-between px-2 py-1.5">
          <div>
            <span className="text-[12px] text-[#cccccc]">Protocol Team</span>
            <div className="text-[10px] text-[#666] mt-0.5">
              {protocolMode
                ? '8-model team: Foreman, Nerd Squad, Cleanup Crew, Sentinel Council'
                : 'Legacy single-model mode'}
            </div>
          </div>
          <button
            onClick={() => setProtocolMode(!protocolMode)}
            disabled={midnightActive}
            className={`w-10 h-5 rounded-full ${protocolMode ? 'bg-purple-500' : 'bg-[#3c3c3c]'} relative transition-colors ${midnightActive ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className={`absolute top-0.5 ${protocolMode ? 'right-0.5' : 'left-0.5'} w-4 h-4 bg-white rounded-full transition-all`} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── WAVEFORM VISUALIZER ─── */
function WaveformVisualizer({ active, speaking }: { active: boolean; speaking: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    let cleanup = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cleanup) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        src.connect(analyser);
        analyserRef.current = analyser;

        const draw = () => {
          if (cleanup) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const c = canvas.getContext('2d');
          if (!c) return;
          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          const w = canvas.width;
          const h = canvas.height;
          c.clearRect(0, 0, w, h);
          const barW = Math.max(2, (w / data.length) - 1);
          for (let i = 0; i < data.length; i++) {
            const v = data[i]! / 255;
            const barH = Math.max(2, v * h * 0.9);
            const x = i * (barW + 1);
            const gradient = c.createLinearGradient(x, h, x, h - barH);
            gradient.addColorStop(0, speaking ? '#3b82f6' : '#06b6d4');
            gradient.addColorStop(1, speaking ? '#8b5cf6' : '#22d3ee');
            c.fillStyle = gradient;
            c.fillRect(x, h - barH, barW, barH);
          }
          animFrameRef.current = requestAnimationFrame(draw);
        };
        draw();
      } catch { /* mic access denied */ }
    })();

    return () => {
      cleanup = true;
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      analyserRef.current = null;
    };
  }, [active, speaking]);

  if (!active) return null;

  return (
    <div className="rounded-lg bg-[#1a1a2e] border border-cyan-900/40 p-2">
      <canvas
        ref={canvasRef}
        width={280}
        height={40}
        className="w-full rounded"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="text-center text-[10px] text-cyan-400/70 mt-1">
        {speaking ? '🔊 Alfred Speaking...' : '🎤 Listening...'}
      </div>
    </div>
  );
}

/* ─── ALFRED GREETINGS ─── */
const ALFRED_GREETINGS = [
  "Good to see you, sir. Systems are online and ready. What shall we build today?",
  "Welcome back, sir. I've been keeping watch. All systems nominal — let's make something great.",
  "Ah, there you are. I was just reviewing our project status. Ready when you are, sir.",
  "Sir, good to have you. I've got a few ideas brewing — say the word and I'll share them.",
  "All systems green, sir. The forge is warm, the codebase is clean. Let's get to work.",
];

function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "Burning the midnight oil, sir? I'm right here with you. Let's make it count.";
  if (hour < 12) return "Good morning, sir. Fresh start, fresh opportunities. What's on the agenda?";
  if (hour < 17) return "Good afternoon, sir. We're making solid progress. What's next?";
  if (hour < 21) return "Good evening, sir. Still going strong. I'm here whenever you need me.";
  return "Late session, sir? I never sleep — let's keep pushing.";
}

/* ─── ALFRED PANEL ─── */
function AlfredPanel({ onBackToIDE }: { onBackToIDE: () => void }) {
  const titanVoice = useTitanVoice();
  const [alfredListening, setAlfredListening] = useState(true);
  const [greetingText, setGreetingText] = useState('');
  const [hasGreeted, setHasGreeted] = useState(false);

  const voice = useVoiceInput(
    useCallback((text: string) => {
      try {
        const { parseVoiceCommand } = require('@/lib/voice/voice-commands');
        const { executeVoiceAction } = require('@/lib/voice/system-control');
        const result = parseVoiceCommand(text);
        if (result.matched) {
          executeVoiceAction(result.action, result.params);
          titanVoice.speak(`Executing: ${result.description}`, 8);
        } else if (text.trim().length > 5) {
          titanVoice.speak(`I heard: ${text.slice(0, 80)}`, 3);
        }
      } catch { /* voice commands module may not be loaded */ }
    }, [titanVoice]),
    { onAutoSend: undefined, autoSendDelayMs: 3000 },
  );

  // Auto-start listening
  useEffect(() => {
    if (alfredListening && voice.isSupported && !voice.isListening) {
      voice.toggleListening();
    }
  }, [alfredListening]); // eslint-disable-line react-hooks/exhaustive-deps

  // Alfred greeting on first open
  useEffect(() => {
    if (hasGreeted) return;
    setHasGreeted(true);

    const isReturning = localStorage.getItem('alfred-last-visit');
    localStorage.setItem('alfred-last-visit', new Date().toISOString());

    const greeting = isReturning
      ? getTimeBasedGreeting()
      : "Sir, I'm Alfred — your AI companion. I'll be watching over everything: code quality, project health, new ideas. Just speak or type, and I'm on it. Welcome to Titan.";

    setGreetingText(greeting);

    const timer = setTimeout(() => {
      titanVoice.speak(greeting, 9);
    }, 800);

    return () => clearTimeout(timer);
  }, [hasGreeted, titanVoice]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#3c3c3c]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">A</span>
          </div>
          <div>
            <span className="text-[13px] font-semibold text-white">Alfred</span>
            <span className="text-[10px] text-[#808080] ml-2">AI Companion</span>
          </div>
        </div>
        <button onClick={onBackToIDE} className="text-[11px] text-[#808080] hover:text-white px-2 py-1 rounded hover:bg-[#3c3c3c] transition-colors">
          Back to IDE
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Greeting Bubble */}
        {greetingText && (
          <div className="rounded-lg bg-gradient-to-r from-cyan-900/30 to-blue-900/30 border border-cyan-700/40 p-3">
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-cyan-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-[10px] font-bold">A</span>
              </div>
              <p className="text-[12px] text-cyan-100 leading-relaxed">{greetingText}</p>
            </div>
          </div>
        )}

        {/* Waveform Visualizer */}
        <WaveformVisualizer active={alfredListening && voice.isListening} speaking={titanVoice.isSpeaking} />

        {/* Interim transcript display */}
        {voice.interimText && (
          <div className="rounded-lg bg-[#252526] border border-cyan-800/40 p-2">
            <div className="text-[10px] text-cyan-400 mb-1">Hearing...</div>
            <div className="text-[12px] text-white/80 italic">&ldquo;{voice.interimText}&rdquo;</div>
          </div>
        )}

        {/* Status Section */}
        <div className="rounded-lg bg-[#252526] border border-[#3c3c3c] p-3">
          <div className="text-[11px] text-[#808080] uppercase tracking-wider mb-2">Status</div>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${titanVoice.voiceEnabled ? 'bg-green-500' : 'bg-[#555]'}`} />
            <span className="text-[12px] text-[#ccc]">Voice {titanVoice.voiceEnabled ? 'Active' : 'Inactive'}</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${alfredListening && voice.isListening ? 'bg-cyan-400 animate-pulse' : 'bg-[#555]'}`} />
            <span className="text-[12px] text-[#ccc]">Listening {alfredListening && voice.isListening ? 'ON' : 'OFF'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${titanVoice.isSpeaking ? 'bg-blue-500 animate-pulse' : 'bg-[#555]'}`} />
            <span className="text-[12px] text-[#ccc]">Speaking {titanVoice.isSpeaking ? 'Active' : 'Idle'}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="rounded-lg bg-[#252526] border border-[#3c3c3c] p-3">
          <div className="text-[11px] text-[#808080] uppercase tracking-wider mb-3">Controls</div>

          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] text-[#ccc]">Always Listening</span>
            <button
              onClick={() => {
                const next = !alfredListening;
                setAlfredListening(next);
                if (!next && voice.isListening) voice.stopListening();
                if (next && !voice.isListening) voice.startListening();
              }}
              className={`w-9 h-5 rounded-full relative transition-colors ${alfredListening ? 'bg-cyan-600' : 'bg-[#555]'}`}
            >
              <span className={`absolute top-0.5 ${alfredListening ? 'right-0.5' : 'left-0.5'} w-4 h-4 bg-white rounded-full transition-all`} />
            </button>
          </div>

          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] text-[#ccc]">Voice Output (TTS)</span>
            <button
              onClick={() => titanVoice.toggleVoice()}
              className={`w-9 h-5 rounded-full relative transition-colors ${titanVoice.voiceEnabled ? 'bg-blue-600' : 'bg-[#555]'}`}
            >
              <span className={`absolute top-0.5 ${titanVoice.voiceEnabled ? 'right-0.5' : 'left-0.5'} w-4 h-4 bg-white rounded-full transition-all`} />
            </button>
          </div>

          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] text-[#ccc]">Auto-Speak Responses</span>
            <button
              onClick={() => titanVoice.toggleAutoSpeak()}
              className={`w-9 h-5 rounded-full relative transition-colors ${titanVoice.autoSpeak ? 'bg-blue-600' : 'bg-[#555]'}`}
            >
              <span className={`absolute top-0.5 ${titanVoice.autoSpeak ? 'right-0.5' : 'left-0.5'} w-4 h-4 bg-white rounded-full transition-all`} />
            </button>
          </div>

          {titanVoice.isSpeaking && (
            <button
              onClick={() => titanVoice.stopSpeaking()}
              className="w-full py-1.5 rounded bg-red-600/20 text-red-400 text-[12px] hover:bg-red-600/30 transition-colors"
            >
              Stop Speaking
            </button>
          )}
        </div>

        {/* Voice Settings */}
        <div className="rounded-lg bg-[#252526] border border-[#3c3c3c] p-3">
          <div className="text-[11px] text-[#808080] uppercase tracking-wider mb-3">Voice Settings</div>
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-[11px] text-[#808080] mb-1">
                <span>Speed</span><span>{titanVoice.rate.toFixed(1)}x</span>
              </div>
              <input type="range" min="0.5" max="2" step="0.1" value={titanVoice.rate} onChange={e => titanVoice.setRate(parseFloat(e.target.value))} className="w-full h-1 bg-[#3c3c3c] rounded appearance-none cursor-pointer accent-cyan-500" />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-[#808080] mb-1">
                <span>Pitch</span><span>{titanVoice.pitch.toFixed(2)}</span>
              </div>
              <input type="range" min="0.5" max="1.5" step="0.05" value={titanVoice.pitch} onChange={e => titanVoice.setPitch(parseFloat(e.target.value))} className="w-full h-1 bg-[#3c3c3c] rounded appearance-none cursor-pointer accent-cyan-500" />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-[#808080] mb-1">
                <span>Volume</span><span>{Math.round(titanVoice.volume * 100)}%</span>
              </div>
              <input type="range" min="0" max="1" step="0.05" value={titanVoice.volume} onChange={e => titanVoice.setVolume(parseFloat(e.target.value))} className="w-full h-1 bg-[#3c3c3c] rounded appearance-none cursor-pointer accent-cyan-500" />
            </div>
          </div>
        </div>

        {/* Voice Commands Reference */}
        <div className="rounded-lg bg-[#252526] border border-[#3c3c3c] p-3">
          <div className="text-[11px] text-[#808080] uppercase tracking-wider mb-2">Voice Commands</div>
          <div className="space-y-1 text-[11px]">
            {[
              { cmd: '"Alfred, start midnight mode"', desc: 'Start autonomous build' },
              { cmd: '"Alfred, scan the project"', desc: 'Scan codebase' },
              { cmd: '"Alfred, status"', desc: 'Check plan progress' },
              { cmd: '"Alfred, start harvester"', desc: 'Start Forge scraping' },
              { cmd: '"Alfred, take a screenshot"', desc: 'Capture viewport' },
              { cmd: '"Alfred, be quiet"', desc: 'Mute voice' },
              { cmd: '"Alfred, show ideas"', desc: 'Show latest ideas' },
            ].map(({ cmd, desc }) => (
              <div key={cmd} className="flex justify-between">
                <span className="text-cyan-400 font-mono">{cmd}</span>
                <span className="text-[#808080]">{desc}</span>
              </div>
            ))}
          </div>
        </div>
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
function ForgeIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>; }
function MoonIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>; }
function AlfredIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="5"/><path d="M3 21v-2a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7v2"/><circle cx="12" cy="8" r="2" fill="currentColor" opacity="0.4"/></svg>; }
function FlaskIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 2v7l-5 8a3 3 0 0 0 2.56 4.5h8.88A3 3 0 0 0 19 17l-5-8V2"/><path d="M8 2h8"/><path d="M7 16h10"/></svg>; }
function BrainIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 3a3 3 0 0 0-3 3v1a3 3 0 0 0-2 2.83V11a3 3 0 0 0 2 2.83V15a3 3 0 0 0 3 3"/><path d="M15 3a3 3 0 0 1 3 3v1a3 3 0 0 1 2 2.83V11a3 3 0 0 1-2 2.83V15a3 3 0 0 1-3 3"/><path d="M9 18a3 3 0 0 0 3 3 3 3 0 0 0 3-3"/><path d="M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z"/></svg>; }
function AccountIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function SettingsGearIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
