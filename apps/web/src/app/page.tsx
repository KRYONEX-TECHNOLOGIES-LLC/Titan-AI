'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type * as Monaco from 'monaco-editor';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="flex-1 bg-[#1e1e1e]" />,
});

import ChatMessage from '@/components/ide/ChatMessage';

// Project Midnight Components
const MidnightToggle = dynamic(() => import('@/components/midnight/MidnightToggle'), { ssr: false });
const FactoryView = dynamic(() => import('@/components/midnight/FactoryView'), { ssr: false });
const TrustSlider = dynamic(() => import('@/components/midnight/TrustSlider'), { ssr: false });
const ConfidenceIndicator = dynamic(
  () => import('@/components/midnight/ConfidenceMeter').then(mod => ({ default: mod.ConfidenceIndicator })),
  { ssr: false }
);

// ── New IDE components (all dynamically imported to avoid SSR issues) ──────────
const IDEMenuBar = dynamic(() => import('@/components/ide/MenuBar'), { ssr: false });
const IDECommandPalette = dynamic(() => import('@/components/ide/CommandPalette'), { ssr: false });
const IDEKeybindingService = dynamic(() => import('@/components/ide/KeybindingService'), { ssr: false });
const IDETerminal = dynamic(() => import('@/components/ide/IDETerminal'), { ssr: false });
const IDEFileExplorer = dynamic(() => import('@/components/ide/FileExplorer'), { ssr: false });
const IDESemanticSearch = dynamic(() => import('@/components/ide/SemanticSearch'), { ssr: false });
const IDEDebugPanel = dynamic(() => import('@/components/ide/DebugPanel'), { ssr: false });

// ── Zustand stores ─────────────────────────────────────────────────────────────
import { useLayoutStore } from '@/stores/layout-store';
import { useEditorStore } from '@/stores/editor-store';
import { useFileStore } from '@/stores/file-store';
import { useTerminalStore } from '@/stores/terminal-store';
import { useDebugStore } from '@/stores/debug-store';
import { initCommandRegistry } from '@/lib/ide/command-registry';

// GitHub / Git Integration
const IDEUserMenu = dynamic(() => import('@/components/ide/UserMenu'), { ssr: false });
const IDEGitPanel = dynamic(() => import('@/components/ide/GitPanel'), { ssr: false });
const IDECloneRepoDialog = dynamic(() => import('@/components/ide/CloneRepoDialog'), { ssr: false });

/* ═══ LANGUAGE DETECTION ═══ */
function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp', h: 'c',
    cs: 'csharp', rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
    html: 'html', css: 'css', scss: 'scss', less: 'less', 
    md: 'markdown', sql: 'sql', sh: 'shell', bash: 'shell', zsh: 'shell',
    dockerfile: 'dockerfile', makefile: 'makefile', graphql: 'graphql',
    env: 'plaintext', txt: 'plaintext', log: 'plaintext',
  };
  return langMap[ext] || 'plaintext';
}

/* ═══ TYPES ═══ */
interface Session {
  id: string;
  name: string;
  time: string;
  messages: ChatMessage[];
  changedFiles: ChangedFile[];
}

interface FileTab {
  name: string;
  icon: string;
  color: string;
  modified?: boolean;
}

interface ChangedFile {
  name: string;
  additions: number;
  deletions: number;
  icon: string;
  color: string;
}

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  time?: string;
  streaming?: boolean;
  streamingModel?: string;
  streamingProviderModel?: string;
  streamingProvider?: string;
  thinking?: string;
  thinkingTime?: number;
  isError?: boolean;
  retryMessage?: string;
}

interface SearchResult {
  file: string;
  line: number;
  content: string;
  match: string;
}

/* ═══ UTILITY FUNCTIONS ═══ */

interface ParsedResponse {
  thinking: string;
  content: string;
}

function parseThinkingTags(rawContent: string): ParsedResponse {
  const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/gi;
  let thinking = '';
  let content = rawContent;
  
  const matches = rawContent.matchAll(thinkingRegex);
  for (const match of matches) {
    thinking += (thinking ? '\n' : '') + match[1].trim();
  }
  
  content = rawContent.replace(thinkingRegex, '').trim();
  
  return { thinking, content };
}

function extractFileBlocks(content: string): Array<{ filename: string; content: string; language: string }> {
  const fileBlockRegex = /```(\w+)?(?::([^\n]+))?\n([\s\S]*?)```/g;
  const blocks: Array<{ filename: string; content: string; language: string }> = [];
  
  let match;
  while ((match = fileBlockRegex.exec(content)) !== null) {
    const language = match[1] || 'text';
    const filename = match[2] || '';
    const code = match[3] || '';
    
    if (code.split('\n').length > 15 || filename) {
      blocks.push({
        filename: filename || `untitled.${language}`,
        content: code,
        language,
      });
    }
  }
  
  return blocks;
}

/* ═══ MAIN IDE COMPONENT ═══ */
export default function TitanIDE() {
  // HYDRATION FIX: Prevent SSR mismatch from browser extensions
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // ── Zustand stores (read-only getters for command registry init) ────────────
  const layoutStoreState = useLayoutStore();
  const editorStoreState = useEditorStore();
  const fileStoreState = useFileStore();
  const terminalStoreState = useTerminalStore();
  const debugStoreState = useDebugStore();

  // ── Init command registry once on mount ────────────────────────────────────
  useEffect(() => {
    initCommandRegistry({
      layout: useLayoutStore.getState,
      editor: useEditorStore.getState,
      file: useFileStore.getState,
      terminal: useTerminalStore.getState,
      debug: useDebugStore.getState,
    });
  }, []);

  // Panel visibility (declared before effects that reference them)
  const [activeView, setActiveView] = useState<string>('titan-agent');
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string[]>(['$ Welcome to Titan AI Terminal', '$ Type commands here...']);
  const [terminalInput, setTerminalInput] = useState('');

  // ── Sync Zustand layout store → local state for legacy compat ──────────────
  useEffect(() => {
    if (!mounted) return;
    const unsub = useLayoutStore.subscribe((state) => {
      setActiveView(state.sidebarView || '');
      setShowTerminal(state.panelVisible && state.panelView === 'terminal');
      setShowRightPanel(state.rightPanelVisible);
    });
    return unsub;
  }, [mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mirror local state → Zustand on changes (bridge) ─────────────────────
  useEffect(() => {
    if (!mounted) return;
    useLayoutStore.setState({ sidebarView: activeView as import('@/stores/layout-store').SidebarView, sidebarVisible: !!activeView });
  }, [activeView, mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (showTerminal) useLayoutStore.setState({ panelVisible: true, panelView: 'terminal' });
    else useLayoutStore.setState({ panelVisible: false });
  }, [showTerminal, mounted]);

  // Editor state
  const [editorInstance, setEditorInstance] = useState<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [monacoInstance, setMonacoInstance] = useState<typeof Monaco | null>(null);
  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [activeTab, setActiveTab] = useState('');
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });

  // AI Chat state
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const thinkingStartRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Session state
  const [sessions, setSessions] = useState<Session[]>([
    {
      id: '1',
      name: 'Titan AI Assistant',
      time: 'Now',
      messages: [{ role: 'assistant', content: "Welcome to Titan AI. I'm ready to help you build, debug, and refactor your code. What would you like to work on?" }],
      changedFiles: [],
    },
  ]);
  const [activeSessionId, setActiveSessionId] = useState('1');

  // Model state
  const [activeModel, setActiveModel] = useState('claude-sonnet-4.6');
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Menu state
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showPlusDropdown, setShowPlusDropdown] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  // Git state
  const [commitMessage, setCommitMessage] = useState('');
  const [stagedFiles, setStagedFiles] = useState<string[]>([]);
  const [gitBranch, setGitBranch] = useState('main');
  const [workspacePath, setWorkspacePath] = useState<string>('');
  const [showCloneDialog, setShowCloneDialog] = useState(false);

  // Settings state
  const [fontSize, setFontSize] = useState(13);
  const [tabSize, setTabSize] = useState(2);
  const [wordWrap, setWordWrap] = useState(true);

  // Project Midnight state
  const [midnightActive, setMidnightActive] = useState(false);
  const [showFactoryView, setShowFactoryView] = useState(false);
  const [trustLevel, setTrustLevel] = useState<1 | 2 | 3>(1);
  const [confidenceScore, setConfidenceScore] = useState(100);
  const [confidenceStatus, setConfidenceStatus] = useState<'healthy' | 'warning' | 'error'>('healthy');

  // Diff decorations state (for AI edits shown as red/green in editor)
  const [pendingDiff, setPendingDiff] = useState<{
    file: string;
    oldContent: string;
    newContent: string;
    decorationIds: string[];
  } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const modelSearchInputRef = useRef<HTMLInputElement>(null);
  
  // Full model registry (30+ models)
  const [modelRegistry, setModelRegistry] = useState<ModelInfo[]>([]);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [highlightedModelIndex, setHighlightedModelIndex] = useState(0);
  const models = ['claude-4.6-opus', 'claude-4.6-sonnet', 'gpt-5.3', 'gpt-4o', 'gemini-2.0-pro']; // Fallback IDs

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  tier: 'frontier' | 'standard' | 'economy' | 'local';
  contextWindow: number;
  supportsThinking: boolean;
  supportsVision: boolean;
  costPer1MInput: number;
  costPer1MOutput: number;
}

  const cappedModelRegistry = useMemo(() => modelRegistry.slice(0, 32), [modelRegistry]);
  const activeModelInfo = useMemo(() => {
    return cappedModelRegistry.find(m => m.id === activeModel || m.name === activeModel) || null;
  }, [cappedModelRegistry, activeModel]);
  const activeModelLabel = activeModelInfo?.name || activeModel;
  const filteredModels = useMemo(
    () =>
      cappedModelRegistry.filter(
        m =>
          modelSearchQuery.trim() === '' ||
          m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
          m.provider.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
          m.id.toLowerCase().includes(modelSearchQuery.toLowerCase())
      ),
    [cappedModelRegistry, modelSearchQuery]
  );

  // Get current session
  const currentSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  // Keep chat pinned while the assistant is actively thinking/streaming
  useEffect(() => {
    if (!isThinking && !isStreaming) return;
    const timer = window.setInterval(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }, 100);
    return () => window.clearInterval(timer);
  }, [isThinking, isStreaming]);

  // Fetch model registry on mount
  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        if (data.models) {
          const incoming = (data.models as ModelInfo[]).slice(0, 32);
          setModelRegistry(incoming);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (cappedModelRegistry.length === 0) return;
    const exists = cappedModelRegistry.some(m => m.id === activeModel || m.name === activeModel);
    if (!exists) {
      setActiveModel(cappedModelRegistry[0].id);
    }
  }, [activeModel, cappedModelRegistry]);

  // ═══ PERSISTENCE: Save state to localStorage ═══
  const STORAGE_VERSION = 3; // Bump this to reset state for all users
  const MAX_PERSISTED_MESSAGES = 50;
  const MAX_MESSAGE_LENGTH = 2000;
  useEffect(() => {
    if (!mounted) return;
    const state = {
      version: STORAGE_VERSION,
      tabs: tabs.map(t => ({ name: t.name, icon: t.icon, color: t.color, modified: t.modified })),
      activeTab,
      sessions: sessions.map(s => ({
        id: s.id,
        name: s.name,
        time: s.time,
        messages: s.messages.slice(-MAX_PERSISTED_MESSAGES).map(m => ({
          ...m,
          content: m.content.length > MAX_MESSAGE_LENGTH ? m.content.slice(0, MAX_MESSAGE_LENGTH) + '\n\n…(truncated)' : m.content,
          thinking: undefined,
          streaming: false,
        })),
        changedFiles: [],
      })),
      activeSessionId,
      activeModel,
      trustLevel,
      midnightActive,
      gitBranch,
      fontSize,
      tabSize,
      wordWrap,
    };
    try {
      localStorage.setItem('titan-ai-state', JSON.stringify(state));
    } catch {
      // Quota exceeded — trim sessions and retry
      try {
        state.sessions = state.sessions.map(s => ({
          ...s,
          messages: s.messages.slice(-10),
        }));
        localStorage.setItem('titan-ai-state', JSON.stringify(state));
      } catch {
        // Still failing — clear and save minimal state
        localStorage.removeItem('titan-ai-state');
      }
    }
  }, [mounted, tabs, activeTab, sessions, activeSessionId, activeModel, trustLevel, midnightActive, gitBranch, fontSize, tabSize, wordWrap]);

  // ═══ PERSISTENCE: Restore state from localStorage (FULL) ═══
  useEffect(() => {
    if (!mounted) return;
    try {
      const saved = localStorage.getItem('titan-ai-state');
      if (saved) {
        const state = JSON.parse(saved);
        // Skip old state versions (clears mock data)
        if (!state.version || state.version < STORAGE_VERSION) {
          localStorage.removeItem('titan-ai-state');
          return;
        }
        // Restore tabs
        if (state.tabs && Array.isArray(state.tabs) && state.tabs.length > 0) {
          setTabs(state.tabs);
        }
        if (state.activeTab) setActiveTab(state.activeTab);
        // Restore sessions
        if (state.sessions && Array.isArray(state.sessions) && state.sessions.length > 0) {
          setSessions(state.sessions);
        }
        if (state.activeSessionId) setActiveSessionId(state.activeSessionId);
        // Restore model and settings
        if (state.activeModel) setActiveModel(state.activeModel);
        if (state.trustLevel) setTrustLevel(state.trustLevel);
        if (state.midnightActive !== undefined) setMidnightActive(state.midnightActive);
        // Restore git branch
        if (state.gitBranch) setGitBranch(state.gitBranch);
        // Restore editor settings
        if (state.fontSize) setFontSize(state.fontSize);
        if (state.tabSize) setTabSize(state.tabSize);
        if (state.wordWrap !== undefined) setWordWrap(state.wordWrap);
      }
    } catch (e) {
      console.error('Failed to restore state:', e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClick = () => {
      setOpenMenu(null);
      setShowPlusDropdown(false);
      setShowModelDropdown(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Get file icon and color
  const getFileInfo = (fileName: string): { icon: string; color: string } => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return { icon: 'TS', color: '#3178c6' };
      case 'js':
      case 'jsx':
        return { icon: 'JS', color: '#f7df1e' };
      case 'css':
        return { icon: 'CSS', color: '#563d7c' };
      case 'json':
        return { icon: '{ }', color: '#f1e05a' };
      case 'md':
        return { icon: 'MD', color: '#083fa1' };
      case 'py':
        return { icon: 'PY', color: '#3572A5' };
      case 'html':
        return { icon: 'HTML', color: '#e34c26' };
      case 'scss':
      case 'less':
        return { icon: 'CSS', color: '#c6538c' };
      case 'yaml':
      case 'yml':
        return { icon: 'YML', color: '#cb171e' };
      case 'env':
        return { icon: 'ENV', color: '#ecd53f' };
      case 'sh':
      case 'bash':
        return { icon: 'SH', color: '#89e051' };
      case 'rs':
        return { icon: 'RS', color: '#dea584' };
      case 'go':
        return { icon: 'GO', color: '#00ADD8' };
      default:
        return { icon: 'TXT', color: '#808080' };
    }
  };

  /* ═══ LOADING STATE FOR FILE OPS ═══ */
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  /* ═══ OPEN FOLDER — File System Access API ═══ */
  const openFolder = useCallback(async () => {
    // Check browser support
    if (!('showDirectoryPicker' in window)) {
      alert('Your browser does not support opening folders.\n\nPlease use Chrome, Edge, or another Chromium-based browser.');
      return;
    }

    try {
      // Show folder picker dialog
      const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
      
      setIsLoadingFiles(true);
      setLoadingMessage('Reading folder contents...');
      
      const newFiles: Record<string, string> = {};
      let fileCount = 0;
      const MAX_FILES = 500;
      const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.next', 'dist', 'build', '.cache', 'coverage', '.vscode', '.idea']);
      const SKIP_EXTENSIONS = new Set(['exe', 'dll', 'so', 'dylib', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg', 'woff', 'woff2', 'ttf', 'eot', 'mp3', 'mp4', 'wav', 'avi', 'mov', 'pdf', 'zip', 'tar', 'gz', 'rar', '7z']);

      async function readDir(handle: FileSystemDirectoryHandle, prefix = ''): Promise<void> {
        if (fileCount >= MAX_FILES) return;
        
        try {
          for await (const [name, entry] of (handle as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
            if (fileCount >= MAX_FILES) break;
            if (name.startsWith('.') && name !== '.env' && name !== '.gitignore') continue;
            if (SKIP_DIRS.has(name)) continue;
            
            const path = prefix ? `${prefix}/${name}` : name;
            
            if (entry.kind === 'file') {
              const ext = name.split('.').pop()?.toLowerCase() || '';
              if (SKIP_EXTENSIONS.has(ext)) continue;
              
              try {
                const file = await (entry as FileSystemFileHandle).getFile();
                if (file.size > 500_000) continue;
                const text = await file.text();
                newFiles[path] = text;
                fileCount++;
                if (fileCount % 20 === 0) {
                  setLoadingMessage(`Reading files... (${fileCount} files)`);
                }
              } catch { /* skip unreadable */ }
            } else if (entry.kind === 'directory') {
              await readDir(entry as FileSystemDirectoryHandle, path);
            }
          }
        } catch (err) {
          console.warn(`Could not read directory ${prefix}:`, err);
        }
      }

      await readDir(dirHandle);

      const folderName = dirHandle.name;

      // Open the folder in the file store (even if empty)
      const { openFolder: openFolderStore } = useFileStore.getState();
      openFolderStore(folderName, folderName, []);

      // Switch to explorer view so files show on LEFT
      setActiveView('explorer');
      
      if (Object.keys(newFiles).length === 0) {
        setIsLoadingFiles(false);
        setLoadingMessage('');
        return;
      }
      
      setLoadingMessage('Loading editor...');
      setFileContents(newFiles);
      
      const sortedFiles = Object.keys(newFiles).sort((a, b) => {
        const aDepth = a.split('/').length;
        const bDepth = b.split('/').length;
        if (aDepth !== bDepth) return aDepth - bDepth;
        return a.localeCompare(b);
      });
      
      const firstFile = sortedFiles[0] || '';
      if (firstFile) {
        const info = getFileInfo(firstFile);
        setTabs([{ name: firstFile, icon: info.icon, color: info.color }]);
        setActiveTab(firstFile);
      }
      
      setIsLoadingFiles(false);
      setLoadingMessage('');
      
    } catch (e: unknown) {
      setIsLoadingFiles(false);
      setLoadingMessage('');
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.error('Open folder failed:', e);
      alert(`Failed to open folder: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ═══ OPEN FILE — File System Access API ═══ */
  const openFile = useCallback(async () => {
    if (!('showOpenFilePicker' in window)) {
      alert('Your browser does not support opening files.\n\nPlease use Chrome, Edge, or another Chromium-based browser.');
      return;
    }

    try {
      const [fileHandle] = await (window as unknown as { showOpenFilePicker: () => Promise<FileSystemFileHandle[]> }).showOpenFilePicker();
      const file = await fileHandle.getFile();
      const text = await file.text();
      const fileName = file.name;
      
      setFileContents(prev => ({ ...prev, [fileName]: text }));
      const info = getFileInfo(fileName);
      setTabs(prev => {
        if (prev.find(t => t.name === fileName)) return prev;
        return [...prev, { name: fileName, icon: info.icon, color: info.color }];
      });
      setActiveTab(fileName);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.error('Open file failed:', e);
      alert(`Failed to open file: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      
      if (ctrl && e.key === 'b') {
        e.preventDefault();
        setActiveView(prev => prev ? '' : 'titan-agent');
      } else if (ctrl && e.key === 's') {
        e.preventDefault();
        executeCommand('save');
      } else if (ctrl && e.key === 'n') {
        e.preventDefault();
        executeCommand('newFile');
      } else if (ctrl && e.key === 'o' && !e.shiftKey) {
        e.preventDefault();
        openFolder();
      } else if (ctrl && e.key === '`') {
        e.preventDefault();
        setShowTerminal(prev => !prev);
      } else if (ctrl && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        setActiveView('explorer');
      } else if (ctrl && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setActiveView('search');
      } else if (ctrl && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        setActiveView('git');
      } else if (ctrl && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        executeCommand('commandPalette');
      } else if (e.key === 'Escape') {
        setShowModelDropdown(false);
        setShowPlusDropdown(false);
        setOpenMenu(null);
        if (showFactoryView) setShowFactoryView(false);
      }
    };
    
    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  }, [executeCommand, openFolder, showFactoryView]);

  /* ═══ EDITOR COMMANDS ═══ */

  function executeCommand(command: string) {
    // Commands that work WITHOUT the editor loaded
    switch (command) {
      case 'newFile': {
        const newFileName = `untitled-${Date.now()}.ts`;
        setFileContents(prev => ({ ...prev, [newFileName]: '// New file\n' }));
        const info = getFileInfo(newFileName);
        setTabs(prev => [...prev, { name: newFileName, icon: info.icon, color: info.color }]);
        setActiveTab(newFileName);
        return;
      }
      case 'file.openFolder': {
        openFolder();
        return;
      }
      case 'file.openFile': {
        openFile();
        return;
      }
      case 'save': {
        setTabs(prev => prev.map(t => t.name === activeTab ? { ...t, modified: false } : t));
        setTerminalOutput(prev => [...prev, `$ File saved: ${activeTab}`]);
        return;
      }
      case 'saveAll': {
        setTabs(prev => prev.map(t => ({ ...t, modified: false })));
        setTerminalOutput(prev => [...prev, '$ All files saved']);
        return;
      }
      case 'toggleSidebar': {
        setActiveView(prev => prev ? '' : 'titan-agent');
        return;
      }
      case 'togglePanel': {
        setShowTerminal(prev => !prev);
        return;
      }
      case 'newTerminal': {
        setShowTerminal(true);
        setTerminalOutput(prev => [...prev, '$ New terminal session started']);
        setTimeout(() => terminalInputRef.current?.focus(), 100);
        return;
      }
      case 'splitTerminal': {
        setShowTerminal(true);
        setTerminalOutput(prev => [...prev, '$ Terminal split']);
        return;
      }
      case 'startDebug': {
        setShowTerminal(true);
        setTerminalOutput(prev => [...prev, '$ Starting debugger...', '$ Debugger attached to process', '$ Listening on port 9229']);
        return;
      }
      case 'stopDebug': {
        setTerminalOutput(prev => [...prev, '$ Debugger disconnected']);
        return;
      }
    }

    // Commands that REQUIRE the Monaco editor
    if (!editorInstance || !monacoInstance) return;

    switch (command) {
      case 'undo':
        editorInstance.trigger('keyboard', 'undo', null);
        break;
      case 'redo':
        editorInstance.trigger('keyboard', 'redo', null);
        break;
      case 'cut':
        editorInstance.trigger('keyboard', 'editor.action.clipboardCutAction', null);
        break;
      case 'copy':
        editorInstance.trigger('keyboard', 'editor.action.clipboardCopyAction', null);
        break;
      case 'paste':
        editorInstance.trigger('keyboard', 'editor.action.clipboardPasteAction', null);
        break;
      case 'find':
        editorInstance.trigger('keyboard', 'actions.find', null);
        break;
      case 'replace':
        editorInstance.trigger('keyboard', 'editor.action.startFindReplaceAction', null);
        break;
      case 'selectAll':
        editorInstance.trigger('keyboard', 'editor.action.selectAll', null);
        break;
      case 'expandSelection':
        editorInstance.trigger('keyboard', 'editor.action.smartSelect.expand', null);
        break;
      case 'commandPalette':
        editorInstance.trigger('keyboard', 'editor.action.quickCommand', null);
        break;
      case 'goToFile':
        editorInstance.trigger('keyboard', 'workbench.action.quickOpen', null);
        break;
      case 'goToSymbol':
        editorInstance.trigger('keyboard', 'editor.action.quickOutline', null);
        break;
      case 'goToLine':
        editorInstance.trigger('keyboard', 'editor.action.gotoLine', null);
        break;
    }
  }

  /* ═══ HANDLERS ═══ */

  // Handle sending message with code context - WIRED TO API
  const handleSend = useCallback(async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput('');
    const sessionId = activeSessionId;
    const streamMessageId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Get code context from Monaco (LIVE VISION)
    const currentCode = editorInstance?.getValue() || fileContents[activeTab] || '';
    const selection = editorInstance?.getSelection();
    const selectedText = selection ? editorInstance?.getModel()?.getValueInRange(selection) : '';
    const currentLanguage = getLanguageFromFilename(activeTab);

    // Add user message with context indicator
    const userMessage: ChatMessage = {
      role: 'user',
      content: selectedText ? `[Selected Code]\n\`\`\`${currentLanguage}\n${selectedText}\n\`\`\`\n\n${msg}` : msg,
      time: 'just now',
    };
    const placeholderAssistantMessage: ChatMessage = {
      id: streamMessageId,
      role: 'assistant',
      content: '',
      time: 'just now',
      streaming: true,
      streamingModel: activeModel,
    };

    setSessions(prev => prev.map(s =>
      s.id === sessionId
        ? { ...s, messages: [...s.messages, userMessage, placeholderAssistantMessage] }
        : s
    ));
    setIsThinking(true);
    thinkingStartRef.current = Date.now();

    const updateStreamingAssistant = (
      rawContent: string,
      done = false,
      metadata?: { model?: string; providerModel?: string; provider?: string }
    ) => {
      const { thinking, content } = parseThinkingTags(rawContent);
      const thinkingTime = thinkingStartRef.current > 0 
        ? Math.round((Date.now() - thinkingStartRef.current) / 1000) 
        : 0;
      
      setSessions(prev =>
        prev.map(s => {
          if (s.id !== sessionId) return s;
          return {
            ...s,
            messages: s.messages.map(m =>
              m.id === streamMessageId
                ? {
                    ...m,
                    content: content || rawContent,
                    thinking: thinking || undefined,
                    thinkingTime: thinking ? thinkingTime : undefined,
                    streaming: !done,
                    time: 'just now',
                    streamingModel: metadata?.model ?? m.streamingModel,
                    streamingProviderModel: metadata?.providerModel ?? m.streamingProviderModel,
                    streamingProvider: metadata?.provider ?? m.streamingProvider,
                  }
                : m
            ),
          };
        })
      );
    };

    const handleSuggestedEdits = (data: { content?: string; suggestedEdits?: Array<{ file: string; content?: string }> }) => {
      let suggestedEdits = data.suggestedEdits || [];
      
      // Extract file blocks from content if no explicit suggested edits
      if (suggestedEdits.length === 0 && data.content) {
        const extractedBlocks = extractFileBlocks(data.content);
        if (extractedBlocks.length > 0) {
          suggestedEdits = extractedBlocks.map(block => ({
            file: block.filename,
            content: block.content,
          }));
        }
      }
      
      const newChangedFiles = suggestedEdits.map((edit: { file: string; content?: string }) => {
        const info = getFileInfo(edit.file);
        const lines = (edit.content || '').split('\n').length;
        return { name: edit.file, additions: lines, deletions: 0, icon: info.icon, color: info.color };
      });

      if (suggestedEdits.length > 0) {
        const edit = suggestedEdits[0];
        if (edit.content && edit.file === activeTab) {
          applyDiffDecorations(currentCode, edit.content);
        }
      } else if (data.content?.includes('```')) {
        const codeMatch = data.content.match(/```(?:\w+)?\n([\s\S]*?)```/);
        if (codeMatch && codeMatch[1]) {
          const suggestedCode = codeMatch[1].trim();
          if (suggestedCode.length > 50) {
            applyDiffDecorations(currentCode, suggestedCode);
          }
        }
      }

      setSessions(prev => prev.map(s =>
        s.id === sessionId
          ? {
            ...s,
            changedFiles: newChangedFiles.length > 0
              ? newChangedFiles
              : (s.changedFiles.length === 0 && data.content?.includes('```')
                ? [{ name: activeTab, additions: 15, deletions: 3, ...getFileInfo(activeTab) }]
                : s.changedFiles),
          }
          : s
      ));
    };

    // Build cross-session memory context (last 2 messages from each other session)
    const crossSessionMemory = sessions
      .filter(s => s.id !== sessionId && s.messages.length > 1)
      .map(s => {
        const lastMsgs = s.messages.slice(-4).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 200)}`).join('\n');
        return `[Session: ${s.name}]\n${lastMsgs}`;
      })
      .join('\n\n');

    let streamed = '';
    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId,
          message: msg,
          model: activeModel,
          stream: true,
          codeContext: {
            file: activeTab,
            content: currentCode,
            selection: selectedText || undefined,
            language: currentLanguage,
          },
          crossSessionMemory: crossSessionMemory || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat request failed (${response.status})`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalPayload: { content?: string; suggestedEdits?: Array<{ file: string; content?: string }> } | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const evt of events) {
            const lines = evt.split('\n');
            let eventType = 'message';
            let data = '';

            for (const line of lines) {
              if (line.startsWith('event:')) eventType = line.slice(6).trim();
              if (line.startsWith('data:')) data += line.slice(5).trim();
            }

            if (!data) continue;
            const payload = JSON.parse(data) as {
              content?: string;
              suggestedEdits?: Array<{ file: string; content?: string }>;
              message?: string;
              model?: string;
              providerModel?: string;
              provider?: string;
            };

            if (eventType === 'token' && payload.content) {
              streamed += payload.content;
              setIsStreaming(true);
              updateStreamingAssistant(streamed, false);
            } else if (eventType === 'start') {
              setIsStreaming(true);
              setIsThinking(false);
              updateStreamingAssistant(streamed, false, {
                model: payload.model,
                providerModel: payload.providerModel,
                provider: payload.provider,
              });
            } else if (eventType === 'done') {
              finalPayload = payload;
              if (payload.content !== undefined) {
                streamed = payload.content;
              }
              setIsStreaming(false);
              updateStreamingAssistant(streamed || 'Done.', true, {
                model: payload.model,
                providerModel: payload.providerModel,
                provider: payload.provider,
              });
            } else if (eventType === 'error') {
              setIsStreaming(false);
              throw new Error(payload.message || 'Streaming error');
            }
          }
        }

        setIsThinking(false);
        setIsStreaming(false);
        const normalized = finalPayload || { content: streamed };
        updateStreamingAssistant(normalized.content || 'I apologize, but I encountered an error processing your request.', true);
        handleSuggestedEdits(normalized);
      } else {
        const data = await response.json();
        setIsThinking(false);
        setIsStreaming(false);
        updateStreamingAssistant(
          data.content || 'I apologize, but I encountered an error processing your request.',
          true
        );
        handleSuggestedEdits(data);
      }
    } catch (error) {
      setIsThinking(false);
      setIsStreaming(false);
      abortControllerRef.current = null;

      if (error instanceof DOMException && error.name === 'AbortError') {
        updateStreamingAssistant(
          streamed || 'Generation stopped.',
          true
        );
        return;
      }

      console.error('Chat error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const is401 = errorMessage.includes('401') || errorMessage.toLowerCase().includes('user not found');
      const troubleshooting = is401
        ? `- Your OpenRouter API key is invalid or expired\n- Go to https://openrouter.ai/keys and create a new key\n- Update OPENROUTER_API_KEY in your Railway environment variables\n- Make sure your OpenRouter account has credits`
        : `- Check your internet connection\n- Verify API keys are configured in your environment\n- Try a different model from the model selector`;
      const errorContent = `⚠️ **Connection Error**\n\n${errorMessage}\n\n**Troubleshooting:**\n${troubleshooting}\n\n_Click the retry button below to try again._`;
      
      setSessions(prev => prev.map(s =>
        s.id === sessionId
          ? {
            ...s,
            messages: s.messages.map(m => m.id === streamMessageId 
              ? { 
                  ...m, 
                  content: errorContent, 
                  streaming: false, 
                  time: 'just now',
                  isError: true,
                  retryMessage: msg,
                } 
              : m
            ),
          }
          : s
      ));
    } finally {
      abortControllerRef.current = null;
    }
  }, [chatInput, editorInstance, activeTab, fileContents, activeSessionId, activeModel, applyDiffDecorations]);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsThinking(false);
    setIsStreaming(false);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle New Agent - Creates UUID session via API
  const handleNewAgent = useCallback(async () => {
    try {
      // Create session via API with UUID
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Session',
          model: activeModel,
        }),
      });

      const data = await response.json();
      
      if (data.success && data.session) {
        const newSession: Session = {
          id: data.session.id,
          name: data.session.name,
          time: 'Now',
          messages: data.session.messages.map((m: { role: string; content: string }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          changedFiles: [],
        };
        setSessions(prev => [newSession, ...prev]);
        setActiveSessionId(data.session.id);
      }
    } catch (error) {
      // Fallback to local session creation
      const newId = `agent-${Date.now()}-${crypto.randomUUID?.()?.slice(0, 8) || Math.random().toString(36).slice(2, 10)}`;
      const newSession: Session = {
        id: newId,
        name: 'New Session',
        time: 'Now',
        messages: [{ role: 'assistant', content: 'New session started. Your changes will be isolated until you click Apply. How can I help you?' }],
        changedFiles: [],
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newId);
    }
  }, [activeModel]);

  // Keep Midnight worker model synchronized with global active model
  useEffect(() => {
    if (!mounted) return;
    fetch('/api/midnight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setModel', model: activeModel }),
    }).catch(() => {
      // Best effort sync for local dev mode
    });
  }, [activeModel, mounted]);

  useEffect(() => {
    if (!showModelDropdown) return;
    setHighlightedModelIndex(0);
    // Focus after paint so keyboard navigation works immediately
    requestAnimationFrame(() => {
      modelSearchInputRef.current?.focus();
      modelSearchInputRef.current?.select();
    });
  }, [showModelDropdown]);

  function selectActiveModel(modelId: string) {
    setActiveModel(modelId);
    setShowModelDropdown(false);
    setModelSearchQuery('');
    setHighlightedModelIndex(0);
  }

  function handleModelSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedModelIndex(prev => Math.min(prev + 1, Math.max(filteredModels.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedModelIndex(prev => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredModels[highlightedModelIndex];
      if (target) {
        selectActiveModel(target.id);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowModelDropdown(false);
    }
  }

  // Handle file click in explorer
  const handleFileClick = useCallback((fileName: string) => {
    const info = getFileInfo(fileName);
    if (!tabs.find(t => t.name === fileName)) {
      setTabs(prev => [...prev, { name: fileName, icon: info.icon, color: info.color }]);
    }
    setActiveTab(fileName);
  }, [tabs]);

  // Handle tab close
  const handleTabClose = useCallback((fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = tabs.filter(t => t.name !== fileName);
    setTabs(newTabs);
    if (activeTab === fileName && newTabs.length > 0) {
      setActiveTab(newTabs[newTabs.length - 1].name);
    }
  }, [tabs, activeTab]);

  // Handle activity bar click
  const handleActivityClick = useCallback((view: string) => {
    setActiveView(prev => prev === view ? '' : view);
  }, []);

  // Handle search
  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const results: SearchResult[] = [];
    Object.entries(fileContents).forEach(([fileName, content]) => {
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(searchQuery.toLowerCase())) {
          results.push({
            file: fileName,
            line: index + 1,
            content: line.trim(),
            match: searchQuery,
          });
        }
      });
    });
    setSearchResults(results);
  }, [searchQuery, fileContents]);

  // Handle replace
  const handleReplace = useCallback(() => {
    if (!searchQuery.trim() || !replaceQuery) return;
    const content = fileContents[activeTab];
    if (content) {
      const newContent = content.replaceAll(searchQuery, replaceQuery);
      setFileContents(prev => ({ ...prev, [activeTab]: newContent }));
      setTabs(prev => prev.map(t => t.name === activeTab ? { ...t, modified: true } : t));
      handleSearch();
    }
  }, [searchQuery, replaceQuery, activeTab, fileContents, handleSearch]);

  // Handle replace all
  const handleReplaceAll = useCallback(() => {
    if (!searchQuery.trim() || !replaceQuery) return;
    const newContents = { ...fileContents };
    Object.keys(newContents).forEach(fileName => {
      newContents[fileName] = newContents[fileName].replaceAll(searchQuery, replaceQuery);
    });
    setFileContents(newContents);
    setTabs(prev => prev.map(t => ({ ...t, modified: true })));
    handleSearch();
  }, [searchQuery, replaceQuery, fileContents, handleSearch]);

  // Handle git commit
  const handleCommit = useCallback(() => {
    if (!commitMessage.trim()) return;
    setTerminalOutput(prev => [
      ...prev,
      `$ git add .`,
      `$ git commit -m "${commitMessage}"`,
      `[${gitBranch}] ${commitMessage}`,
      ` ${stagedFiles.length || tabs.filter(t => t.modified).length} files changed`,
      `$ Commit successful!`,
    ]);
    setCommitMessage('');
    setStagedFiles([]);
    setTabs(prev => prev.map(t => ({ ...t, modified: false })));
  }, [commitMessage, gitBranch, stagedFiles, tabs]);

  // Handle terminal command
  const handleTerminalCommand = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && terminalInput.trim()) {
      const cmd = terminalInput.trim();
      setTerminalInput('');
      setTerminalOutput(prev => [...prev, `$ ${cmd}`]);

      // Simulate command responses
      setTimeout(() => {
        if (cmd === 'ls' || cmd === 'dir') {
          setTerminalOutput(prev => [...prev, 'apps/  packages/  node_modules/  package.json  tsconfig.json']);
        } else if (cmd === 'pwd') {
          setTerminalOutput(prev => [...prev, '/Users/dev/titan-ai']);
        } else if (cmd.startsWith('cd ')) {
          setTerminalOutput(prev => [...prev, `Changed directory to ${cmd.slice(3)}`]);
        } else if (cmd === 'npm run dev') {
          setTerminalOutput(prev => [...prev, '> next dev', '', '▲ Next.js 15.1.0', '- Local: http://localhost:3000', '✓ Ready in 2.1s']);
        } else if (cmd === 'npm run build') {
          setTerminalOutput(prev => [...prev, '> next build', '', 'Creating optimized production build...', '✓ Compiled successfully', '✓ Build completed in 12.3s']);
        } else if (cmd === 'npm test') {
          setTerminalOutput(prev => [...prev, 'Running tests...', '', 'No test files found.', 'Open a folder to run tests.']);
        } else if (cmd === 'git status') {
          setTerminalOutput(prev => [...prev, `On branch ${gitBranch}`, '', 'Changes not staged for commit:', ...tabs.filter(t => t.modified).map(t => `  modified: ${t.name}`)]);
        } else if (cmd === 'clear' || cmd === 'cls') {
          setTerminalOutput(['$ Terminal cleared']);
        } else if (cmd === 'help') {
          setTerminalOutput(prev => [...prev, 'Available commands: ls, pwd, cd, npm run dev, npm run build, npm test, git status, clear, help']);
        } else {
          setTerminalOutput(prev => [...prev, `Command executed: ${cmd}`]);
        }
      }, 300);
    }
  }, [terminalInput, gitBranch, tabs]);

  // Handle apply changes - ACTUALLY APPLIES DIFFS TO EDITOR
  const handleApplyChanges = useCallback(() => {
    if (pendingDiff && editorInstance && monacoInstance) {
      // Apply the new content to the editor
      const model = editorInstance.getModel();
      if (model) {
        // Clear decorations first
        if (pendingDiff.decorationIds.length > 0) {
          editorInstance.deltaDecorations(pendingDiff.decorationIds, []);
        }
        
        // Apply the new content
        model.setValue(pendingDiff.newContent);
        
        // Update file contents state
        setFileContents(prev => ({ ...prev, [pendingDiff.file]: pendingDiff.newContent }));
        
        // Mark tab as modified
        setTabs(prev => prev.map(t => t.name === pendingDiff.file ? { ...t, modified: true } : t));
        
        // Clear pending diff
        setPendingDiff(null);
      }
    }
    
    setTerminalOutput(prev => [
      ...prev,
      '$ Applying AI changes...',
      '$ Changes merged successfully!',
      `$ ${currentSession.changedFiles.length} file(s) updated`,
    ]);
    
    setSessions(prev => prev.map(s =>
      s.id === activeSessionId ? { ...s, changedFiles: [] } : s
    ));
  }, [currentSession, activeSessionId, pendingDiff, editorInstance, monacoInstance]);

  // Apply diff decorations to Monaco (red/green highlighting)
  function applyDiffDecorations(oldContent: string, newContent: string) {
    if (!editorInstance || !monacoInstance) return;
    
    const model = editorInstance.getModel();
    if (!model) return;

    // Clear any existing decorations
    if (pendingDiff?.decorationIds) {
      editorInstance.deltaDecorations(pendingDiff.decorationIds, []);
    }

    // Compute simple line-based diff
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

    // Find added/removed lines (simplified diff)
    const maxLines = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      
      if (oldLine !== newLine) {
        if (oldLine !== undefined) {
          // Existing line changed/removed - mark red
          decorations.push({
            range: new monacoInstance.Range(i + 1, 1, i + 1, 1),
            options: {
              isWholeLine: true,
              className: 'diff-line-removed',
              glyphMarginClassName: 'diff-glyph-removed',
              linesDecorationsClassName: 'diff-line-decoration-removed',
              overviewRuler: {
                color: '#f85149',
                position: monacoInstance.editor.OverviewRulerLane.Full,
              },
            },
          });
        }
        if (newLine !== undefined) {
          // New/updated line - mark green
          decorations.push({
            range: new monacoInstance.Range(i + 1, 1, i + 1, 1),
            options: {
              isWholeLine: true,
              className: 'diff-line-added',
              glyphMarginClassName: 'diff-glyph-added',
              linesDecorationsClassName: 'diff-line-decoration-added',
              overviewRuler: {
                color: '#3fb950',
                position: monacoInstance.editor.OverviewRulerLane.Full,
              },
            },
          });
        }
      }
    }

    // Apply decorations
    const decorationIds = editorInstance.deltaDecorations([], decorations);
    
    // Store pending diff
    setPendingDiff({
      file: activeTab,
      oldContent,
      newContent,
      decorationIds,
    });

    // Keep current editor content intact until user clicks Accept
  }

  // Handle editor content change
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setFileContents(prev => ({ ...prev, [activeTab]: value }));
      setTabs(prev => prev.map(t => t.name === activeTab ? { ...t, modified: true } : t));
    }
  }, [activeTab]);

  // Get current file content and language
  const currentFileContent = fileContents[activeTab] || '';
  const currentFileLanguage = getLanguageFromFilename(activeTab);

  // HYDRATION FIX: Return loading state until client-side mount
  if (!mounted) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#1e1e1e]">
        <div className="text-[#808080] text-sm">Loading Titan AI...</div>
      </div>
    );
  }

  return (
    <div 
      suppressHydrationWarning
      className="h-screen w-screen flex flex-col bg-[#1e1e1e] text-[#cccccc] overflow-hidden select-none"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>

      {/* ═══ NEW MENU BAR (replaces old title bar menus) ═══ */}
      {mounted && <IDEMenuBar />}
      {mounted && <IDECommandPalette />}
      {mounted && <IDEKeybindingService />}

      {/* ═══ TITLE BAR (logo + model selector, kept for branding) ═══ */}
      <div className="h-[35px] bg-[#2b2b2b] flex items-center text-[13px] border-b border-[#3c3c3c] shrink-0">
        {/* Hamburger */}
        <button
          onClick={(e) => { e.stopPropagation(); setActiveView(activeView ? '' : 'titan-agent'); }}
          className="w-[46px] h-full flex items-center justify-center text-[#999] hover:text-white hover:bg-[#3c3c3c] transition-colors"
          title="Toggle Sidebar (Ctrl+B)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 3h14v1.5H1V3zm0 4.25h14v1.5H1v-1.5zm0 4.25h14V13H1v-1.5z"/>
          </svg>
        </button>

        {/* Logo */}
        <span className="text-[#e0e0e0] font-semibold text-[13px] mr-2 tracking-wide">Titan AI</span>

        {/* Menu Items (old inline menus kept as fallback, hidden visually) */}
        <div className="flex items-center text-[#b0b0b0] text-[13px]" style={{ display: 'none' }}>
          <MenuDropdown
            label="File"
            isOpen={openMenu === 'file'}
            onToggle={(e) => { e.stopPropagation(); setOpenMenu(openMenu === 'file' ? null : 'file'); }}
            items={[
              { label: 'New File', shortcut: 'Ctrl+N', action: () => executeCommand('newFile') },
              { label: 'New Window', shortcut: 'Ctrl+Shift+N' },
              { type: 'separator' },
              { label: 'Open File...', shortcut: 'Ctrl+O', action: () => openFile() },
              { label: 'Open Folder...', shortcut: 'Ctrl+K O', action: () => openFolder() },
              { label: 'Clone Repository...', shortcut: 'Ctrl+Shift+G C', action: () => setShowCloneDialog(true) },
              { type: 'separator' },
              { label: 'Save', shortcut: 'Ctrl+S', action: () => executeCommand('save') },
              { label: 'Save All', shortcut: 'Ctrl+K S', action: () => executeCommand('saveAll') },
            ]}
          />
          <MenuDropdown
            label="Edit"
            isOpen={openMenu === 'edit'}
            onToggle={(e) => { e.stopPropagation(); setOpenMenu(openMenu === 'edit' ? null : 'edit'); }}
            items={[
              { label: 'Undo', shortcut: 'Ctrl+Z', action: () => executeCommand('undo') },
              { label: 'Redo', shortcut: 'Ctrl+Y', action: () => executeCommand('redo') },
              { type: 'separator' },
              { label: 'Cut', shortcut: 'Ctrl+X', action: () => executeCommand('cut') },
              { label: 'Copy', shortcut: 'Ctrl+C', action: () => executeCommand('copy') },
              { label: 'Paste', shortcut: 'Ctrl+V', action: () => executeCommand('paste') },
              { type: 'separator' },
              { label: 'Find', shortcut: 'Ctrl+F', action: () => executeCommand('find') },
              { label: 'Replace', shortcut: 'Ctrl+H', action: () => executeCommand('replace') },
            ]}
          />
          <MenuDropdown
            label="Selection"
            isOpen={openMenu === 'selection'}
            onToggle={(e) => { e.stopPropagation(); setOpenMenu(openMenu === 'selection' ? null : 'selection'); }}
            items={[
              { label: 'Select All', shortcut: 'Ctrl+A', action: () => executeCommand('selectAll') },
              { label: 'Expand Selection', shortcut: 'Shift+Alt+→', action: () => executeCommand('expandSelection') },
            ]}
          />
          <MenuDropdown
            label="View"
            isOpen={openMenu === 'view'}
            onToggle={(e) => { e.stopPropagation(); setOpenMenu(openMenu === 'view' ? null : 'view'); }}
            items={[
              { label: 'Command Palette...', shortcut: 'Ctrl+Shift+P', action: () => executeCommand('commandPalette') },
              { type: 'separator' },
              { label: 'Explorer', shortcut: 'Ctrl+Shift+E', action: () => setActiveView('explorer') },
              { label: 'Search', shortcut: 'Ctrl+Shift+F', action: () => setActiveView('search') },
              { label: 'Source Control', shortcut: 'Ctrl+Shift+G', action: () => setActiveView('git') },
              { label: 'Run and Debug', shortcut: 'Ctrl+Shift+D', action: () => setActiveView('debug') },
              { type: 'separator' },
              { label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: () => executeCommand('toggleSidebar') },
              { label: 'Toggle Terminal', shortcut: 'Ctrl+`', action: () => executeCommand('togglePanel') },
            ]}
          />
          <MenuDropdown
            label="Go"
            isOpen={openMenu === 'go'}
            onToggle={(e) => { e.stopPropagation(); setOpenMenu(openMenu === 'go' ? null : 'go'); }}
            items={[
              { label: 'Go to File...', shortcut: 'Ctrl+P', action: () => executeCommand('goToFile') },
              { label: 'Go to Symbol...', shortcut: 'Ctrl+Shift+O', action: () => executeCommand('goToSymbol') },
              { label: 'Go to Line...', shortcut: 'Ctrl+G', action: () => executeCommand('goToLine') },
            ]}
          />
          <MenuDropdown
            label="Run"
            isOpen={openMenu === 'run'}
            onToggle={(e) => { e.stopPropagation(); setOpenMenu(openMenu === 'run' ? null : 'run'); }}
            items={[
              { label: 'Start Debugging', shortcut: 'F5', action: () => executeCommand('startDebug') },
              { label: 'Run Without Debugging', shortcut: 'Ctrl+F5', action: () => executeCommand('startDebug') },
              { label: 'Stop Debugging', shortcut: 'Shift+F5', action: () => executeCommand('stopDebug') },
            ]}
          />
          <MenuDropdown
            label="Terminal"
            isOpen={openMenu === 'terminal'}
            onToggle={(e) => { e.stopPropagation(); setOpenMenu(openMenu === 'terminal' ? null : 'terminal'); }}
            items={[
              { label: 'New Terminal', shortcut: 'Ctrl+`', action: () => executeCommand('newTerminal') },
              { label: 'Split Terminal', shortcut: 'Ctrl+Shift+5', action: () => executeCommand('splitTerminal') },
            ]}
          />
          <MenuDropdown
            label="Help"
            isOpen={openMenu === 'help'}
            onToggle={(e) => { e.stopPropagation(); setOpenMenu(openMenu === 'help' ? null : 'help'); }}
            items={[
              { label: 'Documentation', action: () => window.open('https://docs.titan-ai.dev', '_blank') },
              { label: 'Report Issue', action: () => window.open('https://github.com/titan-ai/issues', '_blank') },
              { type: 'separator' },
              { label: 'About Titan AI', action: () => alert('Titan AI v0.1.0\nAI-Native IDE') },
            ]}
          />
        </div>

        {/* Tab Bar with + Dropdown */}
        <div className="flex-1 flex items-center h-full ml-2 overflow-hidden">
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowPlusDropdown(!showPlusDropdown); }}
              className="w-[28px] h-[28px] flex items-center justify-center text-[#808080] hover:text-white hover:bg-[#3c3c3c] rounded-[3px] mx-0.5 shrink-0 transition-colors"
              title="New..."
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1v6H2v1.5h6V15h1.5V8.5H16V7H9.5V1z"/></svg>
            </button>
            {showPlusDropdown && (
              <div className="absolute top-full left-0 mt-1 w-[200px] bg-[#2d2d2d] border border-[#3c3c3c] rounded-md shadow-lg py-1 z-50">
                <DropdownItem icon="📄" label="New File" shortcut="Ctrl+N" onClick={() => { executeCommand('newFile'); setShowPlusDropdown(false); }} />
                <DropdownItem icon="⬛" label="New Terminal" shortcut="Ctrl+`" onClick={() => { executeCommand('newTerminal'); setShowPlusDropdown(false); }} />
                <DropdownItem icon="✨" label="New Agent Session" onClick={() => { handleNewAgent(); setShowPlusDropdown(false); }} />
              </div>
            )}
          </div>

          {/* Tabs */}
          {tabs.map(tab => (
            <button
              key={tab.name}
              onClick={() => setActiveTab(tab.name)}
              className={`group h-[28px] flex items-center gap-1.5 px-3 text-[12px] rounded-[3px] mx-0.5 shrink-0 transition-colors ${
                activeTab === tab.name ? 'bg-[#1e1e1e] text-white' : 'text-[#808080] hover:text-[#cccccc] hover:bg-[#3c3c3c]'
              }`}
            >
              <span className="text-[10px] font-bold" style={{ color: tab.color }}>{tab.icon}</span>
              {tab.name}
              {tab.modified && <span className="text-[#007acc] ml-0.5">●</span>}
              <span
                onClick={(e) => handleTabClose(tab.name, e)}
                className="ml-1 w-[16px] h-[16px] flex items-center justify-center text-[14px] text-[#808080] hover:text-white hover:bg-[#525252] rounded-[3px] opacity-0 group-hover:opacity-100"
              >×</span>
            </button>
          ))}
        </div>

        {/* Model Pill - 30+ Models */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowModelDropdown(!showModelDropdown); }}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#2d2d2d] hover:bg-[#3c3c3c] rounded-full text-[12px] text-[#cccccc] transition-colors mr-2"
          >
            <span className="w-2 h-2 bg-[#3fb950] rounded-full"></span>
            {activeModelLabel}
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4z"/></svg>
          </button>
          {showModelDropdown && (
            <div className="absolute top-full right-0 mt-1 w-[320px] bg-[#2d2d2d] border border-[#3c3c3c] rounded-lg shadow-xl z-50 overflow-hidden">
              {/* Search */}
              <div className="p-2 border-b border-[#3c3c3c]">
                <input
                  ref={modelSearchInputRef}
                  type="text"
                  placeholder="Search models..."
                  value={modelSearchQuery}
                  onChange={(e) => {
                    setModelSearchQuery(e.target.value);
                    setHighlightedModelIndex(0);
                  }}
                  onKeyDown={handleModelSearchKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-[12px] text-[#cccccc] placeholder-[#666] focus:outline-none focus:border-[#007acc]"
                />
              </div>
              {/* Model List */}
              <div className="max-h-[400px] overflow-y-auto">
                {cappedModelRegistry.length > 0 ? (
                  <>
                    {['frontier', 'standard', 'economy', 'local'].map(tier => {
                      const tierModels = cappedModelRegistry.filter(m => 
                        m.tier === tier && 
                        (modelSearchQuery === '' || 
                         m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
                         m.provider.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
                         m.id.toLowerCase().includes(modelSearchQuery.toLowerCase()))
                      );
                      if (tierModels.length === 0) return null;
                      return (
                        <div key={tier}>
                          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase text-[#808080] bg-[#252525]">
                            {tier === 'frontier' ? '🚀 Frontier' : tier === 'standard' ? '⚡ Standard' : tier === 'economy' ? '💰 Economy' : '🏠 Local'}
                          </div>
                          {tierModels.map(model => (
                            <button
                              key={model.id}
                              onClick={() => selectActiveModel(model.id)}
                              className={`w-full text-left px-3 py-2 hover:bg-[#3c3c3c] transition-colors border-b border-[#333] ${activeModel === model.id ? 'bg-[#37373d]' : ''} ${filteredModels[highlightedModelIndex]?.id === model.id ? 'ring-1 ring-inset ring-[#007acc]' : ''}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className={`text-[12px] ${activeModel === model.id ? 'text-[#007acc]' : 'text-[#cccccc]'}`}>{model.name}</span>
                                <span className="text-[10px] text-[#666]">{model.provider}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] text-[#555]">{(model.contextWindow / 1000).toFixed(0)}K ctx</span>
                                {model.supportsThinking && <span className="text-[9px] text-purple-400">🧠</span>}
                                {model.supportsVision && <span className="text-[9px] text-blue-400">👁️</span>}
                                {model.costPer1MInput === 0 ? (
                                  <span className="text-[9px] text-green-400">Free</span>
                                ) : (
                                  <span className="text-[9px] text-[#555]">${model.costPer1MInput}/1M</span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </>
                ) : (
                  /* Fallback to simple list */
                  models.map(model => (
                    <button
                      key={model}
                      onClick={() => selectActiveModel(model)}
                      className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#3c3c3c] transition-colors ${activeModel === model ? 'text-[#007acc]' : 'text-[#cccccc]'}`}
                    >
                      {model}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="flex items-center pr-2">
          {mounted && <IDEUserMenu />}
        </div>
      </div>

      {/* Clone Dialog */}
      {mounted && (
        <IDECloneRepoDialog
          isOpen={showCloneDialog}
          onClose={() => setShowCloneDialog(false)}
          onCloneComplete={(path, name) => {
            setWorkspacePath(path);
            setShowCloneDialog(false);
          }}
        />
      )}

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Activity Bar */}
        <div className="w-[48px] bg-[#2b2b2b] flex flex-col items-center py-1 shrink-0 border-r border-[#3c3c3c]">
          <ActivityIcon active={activeView === 'explorer'} onClick={() => handleActivityClick('explorer')} title="Explorer"><ExplorerIcon /></ActivityIcon>
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
        {activeView && (
          <div className="w-[320px] bg-[#1e1e1e] border-r border-[#3c3c3c] flex flex-col shrink-0 overflow-hidden">
            {/* EXPLORER */}
            {activeView === 'explorer' && (
              <IDEFileExplorer />
            )}

            {/* SEARCH */}
            {activeView === 'search' && (
              <IDESemanticSearch />
            )}

            {/* GIT */}
            {activeView === 'git' && (
              <IDEGitPanel workspacePath={workspacePath} />
            )}

            {/* DEBUG */}
            {activeView === 'debug' && (
              <IDEDebugPanel />
            )}

            {/* EXTENSIONS */}
            {activeView === 'extensions' && <ExtensionsPanel />}

            {/* TITAN AGENT */}
            {activeView === 'titan-agent' && (
              <TitanAgentPanel
                sessions={sessions}
                activeSessionId={activeSessionId}
                setActiveSessionId={setActiveSessionId}
                currentSession={currentSession}
                chatInput={chatInput}
                setChatInput={setChatInput}
                isThinking={isThinking}
                isStreaming={isStreaming}
                activeModel={activeModelLabel}
                onNewAgent={handleNewAgent}
                onSend={handleSend}
                onStop={handleStop}
                onKeyDown={handleKeyDown}
                onApply={handleApplyChanges}
                chatEndRef={chatEndRef}
                onRenameSession={(id, name) => setSessions(prev => prev.map(s => s.id === id ? { ...s, name } : s))}
                onDeleteSession={(id) => {
                  const remaining = sessions.filter(s => s.id !== id);
                  setSessions(remaining);
                  if (activeSessionId === id && remaining.length > 0) setActiveSessionId(remaining[0].id);
                }}
                hasPendingDiff={pendingDiff !== null}
                onRejectDiff={() => {
                  // Reject diff - revert to original content
                  if (pendingDiff && editorInstance) {
                    const model = editorInstance.getModel();
                    if (model) {
                      // Clear decorations
                      if (pendingDiff.decorationIds.length > 0) {
                        editorInstance.deltaDecorations(pendingDiff.decorationIds, []);
                      }
                      // Restore original content
                      model.setValue(pendingDiff.oldContent);
                    }
                  }
                  setPendingDiff(null);
                }}
                onRetry={(message) => {
                  setSessions(prev => prev.map(s => 
                    s.id === activeSessionId 
                      ? { ...s, messages: s.messages.filter(m => !m.isError) }
                      : s
                  ));
                  setChatInput(message);
                  setTimeout(() => handleSend(), 100);
                }}
                onApplyCode={(code, filename) => {
                  const targetFile = filename || activeTab;
                  if (targetFile) {
                    setFileContents(prev => ({ ...prev, [targetFile]: code }));
                    if (targetFile === activeTab && editorInstance) {
                      const model = editorInstance.getModel();
                      if (model) model.setValue(code);
                    }
                  }
                }}
              />
            )}

            {/* ACCOUNTS */}
            {activeView === 'accounts' && <AccountsPanel />}

            {/* SETTINGS */}
            {activeView === 'settings' && (
              <SettingsPanel
                fontSize={fontSize}
                setFontSize={setFontSize}
                tabSize={tabSize}
                setTabSize={setTabSize}
                wordWrap={wordWrap}
                setWordWrap={setWordWrap}
                activeModel={activeModel}
                setActiveModel={setActiveModel}
                models={models}
                trustLevel={trustLevel}
                setTrustLevel={setTrustLevel}
                midnightActive={midnightActive}
              />
            )}
          </div>
        )}

        {/* CENTER: Editor + Terminal */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Breadcrumb - only show when file is open */}
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

          {/* Editor */}
          <div className="flex-1 min-h-0">
            {tabs.length === 0 ? (
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
                      <button
                        onClick={openFolder}
                        className="px-5 py-2.5 bg-[#007acc] hover:bg-[#005a99] text-white rounded text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H7.707l-1-1A1.5 1.5 0 0 0 5.586 3H1.5z"/>
                        </svg>
                        Open Folder
                      </button>
                      <button
                        onClick={() => setShowCloneDialog(true)}
                        className="px-5 py-2.5 bg-[#3c3c3c] hover:bg-[#4a4a4a] text-[#cccccc] rounded text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z"/>
                        </svg>
                        Clone Repository
                      </button>
                      <button
                        onClick={() => executeCommand('newFile')}
                        className="px-5 py-2.5 bg-[#3c3c3c] hover:bg-[#4a4a4a] text-[#cccccc] rounded text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 1v6H2v2h6v6h2V9h6V7H10V1z"/>
                        </svg>
                        New File
                      </button>
                    </div>
                    <div className="mt-8 text-xs text-[#444]">
                      <span className="text-[#555]">Ctrl+O</span> Open Folder • <span className="text-[#555]">Ctrl+N</span> New File
                    </div>
                  </>
                )}
              </div>
            ) : (
            <MonacoEditor
              height="100%"
              language={currentFileLanguage}
              theme="vs-dark"
              value={currentFileContent}
              onChange={handleEditorChange}
              options={{
                fontSize,
                tabSize,
                wordWrap: wordWrap ? 'on' : 'off',
                fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                cursorBlinking: 'smooth',
                // DISABLE ALL ERROR INDICATORS
                renderValidationDecorations: 'off',
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
                // TITAN DARK THEME - ALL ERROR INDICATORS HIDDEN
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
                    // HIDE ALL ERROR/WARNING INDICATORS
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
                    // HIDE OVERVIEW RULER (RIGHT MARGIN) DECORATIONS
                    'editorOverviewRuler.errorForeground': '#00000000',
                    'editorOverviewRuler.warningForeground': '#00000000',
                    'editorOverviewRuler.infoForeground': '#00000000',
                    'editorOverviewRuler.border': '#00000000',
                    'editorOverviewRuler.background': '#1e1e1e',
                    'editorOverviewRuler.currentContentForeground': '#00000000',
                    'editorOverviewRuler.incomingContentForeground': '#00000000',
                    'editorOverviewRuler.commonContentForeground': '#00000000',
                    // HIDE MINIMAP ERROR DECORATIONS
                    'minimap.errorHighlight': '#00000000',
                    'minimap.warningHighlight': '#00000000',
                    'minimap.background': '#1e1e1e',
                    // HIDE SQUIGGLY UNDERLINES
                    'editorUnnecessaryCode.border': '#00000000',
                    'editorUnnecessaryCode.opacity': '#00000000',
                  },
                });
                monaco.editor.setTheme('titan-dark');
                
                // Disable TypeScript diagnostics to prevent red squiggles
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

                // Add CSS for diff decorations
                const style = document.createElement('style');
                style.textContent = `
                  .diff-line-added {
                    background-color: rgba(63, 185, 80, 0.2) !important;
                  }
                  .diff-line-removed {
                    background-color: rgba(248, 81, 73, 0.2) !important;
                  }
                  .diff-glyph-added {
                    background-color: #3fb950;
                    width: 4px !important;
                    margin-left: 3px;
                  }
                  .diff-glyph-removed {
                    background-color: #f85149;
                    width: 4px !important;
                    margin-left: 3px;
                  }
                  .diff-line-decoration-added {
                    background-color: #3fb950;
                    width: 3px !important;
                  }
                  .diff-line-decoration-removed {
                    background-color: #f85149;
                    width: 3px !important;
                  }
                `;
                document.head.appendChild(style);
              }}
            />
            )}
          </div>

          {/* Terminal — real xterm.js */}
          {showTerminal && (
            <div style={{ height: 240, borderTop: '1px solid #313244', flexShrink: 0, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 10 }}>
                <button
                  onClick={() => setShowTerminal(false)}
                  style={{ background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer', padding: '4px 8px', fontSize: 14 }}
                  title="Close Panel"
                >
                  ×
                </button>
              </div>
              <IDETerminal />
            </div>
          )}
        </div>

        {/* RIGHT PANEL REMOVED - files always in left explorer like VS Code */}
      </div>

      {/* STATUS BAR */}
      <div className={`h-[22px] ${midnightActive ? 'bg-purple-600' : 'bg-[#007acc]'} flex items-center justify-between px-3 text-[11px] text-white shrink-0 transition-colors`}>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 cursor-pointer hover:bg-[#0098ff] px-1 rounded" onClick={() => setActiveView('git')}>
            <GitIcon size={12} /> {gitBranch}
          </span>
          <span>{tabs.filter(t => t.modified).length > 0 ? `${tabs.filter(t => t.modified).length} unsaved` : '✓'}</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Project Midnight Toggle */}
          <MidnightToggle
            isActive={midnightActive}
            onToggle={async () => {
              if (midnightActive) {
                // Just show the factory view if already active
                setShowFactoryView(true);
              } else {
                // Start Project Midnight via API
                try {
                  const res = await fetch('/api/midnight', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'start', trustLevel, model: activeModel }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setMidnightActive(true);
                    setShowFactoryView(true);
                    setTerminalOutput(prev => [
                      ...prev,
                      '$ Project Midnight initialized',
                      '$ Trust Level: ' + trustLevel,
                      '$ Actor agent starting...',
                      '$ Sentinel Elite verification enabled',
                    ]);
                  }
                } catch (e) {
                  console.error('Failed to start Midnight:', e);
                  // Fallback to local state
                  setMidnightActive(true);
                  setShowFactoryView(true);
                }
              }
            }}
          />
          {/* Confidence indicator when Midnight is active */}
          {midnightActive && (
            <ConfidenceIndicator score={confidenceScore} status={confidenceStatus} />
          )}
          <span className="cursor-pointer hover:bg-[#0098ff] px-1 rounded" onClick={() => setActiveView('settings')}>{currentFileLanguage}</span>
          <span>Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-[#3fb950] rounded-full"></span>
            {activeModelLabel}
          </span>
        </div>
      </div>

      {/* Project Midnight Factory View */}
      <FactoryView
        isOpen={showFactoryView}
        onClose={() => setShowFactoryView(false)}
        onStop={() => {
          setMidnightActive(false);
          setTerminalOutput(prev => [...prev, '$ Project Midnight stopped']);
        }}
        trustLevel={trustLevel}
      />
    </div>
  );
}

/* ═══ SUB-COMPONENTS ═══ */

function ActivityIcon({ children, active, onClick, title }: { children: React.ReactNode; active?: boolean; onClick?: () => void; title: string }) {
  return (
    <button title={title} onClick={onClick} className={`w-[48px] h-[48px] flex items-center justify-center transition-colors relative ${active ? 'text-white' : 'text-[#6e6e6e] hover:text-[#cccccc]'}`}>
      {active && <div className="absolute left-0 top-[12px] bottom-[12px] w-[2px] bg-[#007acc] rounded-r" />}
      {children}
    </button>
  );
}

interface MenuItem { label?: string; shortcut?: string; type?: 'separator'; action?: () => void; }

function MenuDropdown({ label, isOpen, onToggle, items }: { label: string; isOpen: boolean; onToggle: (e: React.MouseEvent) => void; items: MenuItem[] }) {
  return (
    <div className="relative">
      <button onClick={onToggle} className={`px-2 py-1 rounded-[3px] transition-colors text-[13px] ${isOpen ? 'bg-[#3c3c3c] text-white' : 'hover:text-white hover:bg-[#3c3c3c]'}`}>{label}</button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-0.5 w-[220px] bg-[#2d2d2d] border border-[#3c3c3c] rounded-md shadow-lg py-1 z-50">
          {items.map((item, i) => item.type === 'separator' ? (
            <div key={i} className="h-px bg-[#3c3c3c] my-1" />
          ) : (
            <button key={i} onClick={item.action} className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] text-[#cccccc] hover:bg-[#3c3c3c] transition-colors">
              <span>{item.label}</span>
              {item.shortcut && <span className="text-[#808080] text-[11px]">{item.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DropdownItem({ icon, label, shortcut, onClick }: { icon: string; label: string; shortcut?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[#cccccc] hover:bg-[#3c3c3c] transition-colors">
      <span>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <span className="text-[#808080] text-[11px]">{shortcut}</span>}
    </button>
  );
}

/* ─── PANEL COMPONENTS ─── */

function ExplorerPanel({ activeTab, onFileClick, fileContents, isRight, onAddToContext, openTabs, onCloseTab }: { 
  activeTab: string; 
  onFileClick: (name: string) => void; 
  fileContents: Record<string, string>; 
  isRight?: boolean;
  onAddToContext?: (fileName: string) => void;
  openTabs?: Array<{ name: string; icon: string; color: string; modified?: boolean }>;
  onCloseTab?: (name: string) => void;
}) {
  const files = Object.keys(fileContents);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: string } | null>(null);
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  const [showOpenEditors, setShowOpenEditors] = useState(true);
  const [showFolderTree, setShowFolderTree] = useState(true);

  const handleContextMenu = (e: React.MouseEvent, file: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const handleAddToContext = (file: string) => {
    if (!contextFiles.includes(file)) {
      setContextFiles(prev => [...prev, file]);
      onAddToContext?.(file);
    }
    setContextMenu(null);
  };

  const handleRemoveFromContext = (file: string) => {
    setContextFiles(prev => prev.filter(f => f !== file));
    setContextMenu(null);
  };

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <>
      <div className="h-[28px] flex items-center px-3 text-[11px] font-semibold text-[#808080] uppercase tracking-wider shrink-0">Explorer</div>
      <div className="flex-1 overflow-y-auto text-[13px] px-1">
        
        {/* OPEN EDITORS Section */}
        {openTabs && openTabs.length > 0 && (
          <div className="mb-2">
            <button 
              onClick={() => setShowOpenEditors(!showOpenEditors)}
              className="w-full px-2 py-1 text-[11px] uppercase text-[#e0e0e0] font-semibold flex items-center gap-1 hover:bg-[#2a2a2a] rounded"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className={`transition-transform ${showOpenEditors ? 'rotate-90' : ''}`}>
                <path d="M6 4l4 4-4 4z"/>
              </svg>
              OPEN EDITORS ({openTabs.length})
            </button>
            {showOpenEditors && (
              <div className="mt-0.5">
                {openTabs.map(tab => (
                  <div
                    key={tab.name}
                    onClick={() => onFileClick(tab.name)}
                    className={`group w-full flex items-center gap-1.5 py-[2px] px-3 text-[13px] rounded transition-colors cursor-pointer ${activeTab === tab.name ? 'bg-[#37373d] text-white' : 'text-[#cccccc] hover:bg-[#2a2a2a]'}`}
                  >
                    <span className="text-[9px] font-bold" style={{ color: tab.color }}>{tab.icon}</span>
                    <span className="truncate flex-1 text-left">{tab.name}</span>
                    {tab.modified && <span className="text-[#007acc]">●</span>}
                    {onCloseTab && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onCloseTab(tab.name); }}
                        className="text-[#666] hover:text-white text-[12px] opacity-0 group-hover:opacity-100"
                      >×</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* FOLDER TREE Section - only show when files exist */}
        {files.length > 0 && (
          <>
            <button 
              onClick={() => setShowFolderTree(!showFolderTree)}
              className="w-full px-2 py-1 text-[11px] uppercase text-[#e0e0e0] font-semibold flex items-center gap-1 hover:bg-[#2a2a2a] rounded"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className={`transition-transform ${showFolderTree ? 'rotate-90' : ''}`}>
                <path d="M6 4l4 4-4 4z"/>
              </svg>
              OPEN FILES
            </button>
            {showFolderTree && (
              <div className="mt-0.5">
                {files.map(file => {
                  const ext = file.split('.').pop();
                  const icon = ext === 'ts' || ext === 'tsx' ? 'TS' : ext === 'css' ? 'CSS' : ext === 'json' ? '{}' : 'TXT';
                  const color = ext === 'ts' || ext === 'tsx' ? '#3178c6' : ext === 'css' ? '#563d7c' : ext === 'json' ? '#f1e05a' : '#808080';
                  const isInContext = contextFiles.includes(file);
                  return (
                    <button
                      key={file}
                      onClick={() => onFileClick(file)}
                      onContextMenu={(e) => handleContextMenu(e, file)}
                      className={`w-full flex items-center gap-1.5 py-[2px] px-3 text-[13px] rounded transition-colors ${activeTab === file ? 'bg-[#37373d] text-white' : 'text-[#cccccc] hover:bg-[#2a2a2a]'}`}
                    >
                      <span className="text-[9px] font-bold" style={{ color }}>{icon}</span>
                      <span className="truncate flex-1 text-left">{file}</span>
                      {isInContext && <span className="text-[10px] text-[#007acc]" title="In AI Context">⚡</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* AI Context Section */}
        {contextFiles.length > 0 && (
          <div className="mt-3 border-t border-[#3c3c3c] pt-2">
            <div className="px-2 py-1 text-[10px] uppercase text-[#007acc] font-semibold flex items-center gap-1">
              ⚡ AI CONTEXT ({contextFiles.length})
            </div>
            {contextFiles.map(file => (
              <div key={file} className="flex items-center justify-between px-3 py-0.5 text-[12px] text-[#cccccc] hover:bg-[#2a2a2a] rounded">
                <span className="truncate">{file}</span>
                <button 
                  onClick={() => handleRemoveFromContext(file)} 
                  className="text-[#666] hover:text-[#f85149] text-[10px]"
                  title="Remove from context"
                >×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <div 
          className="fixed bg-[#2d2d2d] border border-[#3c3c3c] rounded-md shadow-xl py-1 z-[9999] min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onFileClick(contextMenu.file)}
            className="w-full text-left px-3 py-1.5 text-[12px] text-[#cccccc] hover:bg-[#3c3c3c] flex items-center gap-2"
          >
            <span>📄</span> Open File
          </button>
          <div className="h-px bg-[#3c3c3c] my-1" />
          {!contextFiles.includes(contextMenu.file) ? (
            <button
              onClick={() => handleAddToContext(contextMenu.file)}
              className="w-full text-left px-3 py-1.5 text-[12px] text-[#007acc] hover:bg-[#3c3c3c] flex items-center gap-2"
            >
              <span>⚡</span> Add to AI Context
            </button>
          ) : (
            <button
              onClick={() => handleRemoveFromContext(contextMenu.file)}
              className="w-full text-left px-3 py-1.5 text-[12px] text-[#f85149] hover:bg-[#3c3c3c] flex items-center gap-2"
            >
              <span>✖</span> Remove from AI Context
            </button>
          )}
          <button
            onClick={() => {
              navigator.clipboard.writeText(`src/${contextMenu.file}`);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-[12px] text-[#cccccc] hover:bg-[#3c3c3c] flex items-center gap-2"
          >
            <span>📋</span> Copy Path
          </button>
          <button
            onClick={() => {
              const newName = prompt('Enter new file name:', contextMenu.file);
              if (newName && newName !== contextMenu.file) {
                // Rename logic would go here
                setContextMenu(null);
              }
            }}
            className="w-full text-left px-3 py-1.5 text-[12px] text-[#cccccc] hover:bg-[#3c3c3c] flex items-center gap-2"
          >
            <span>✏️</span> Rename
          </button>
          <div className="h-px bg-[#3c3c3c] my-1" />
          <button
            onClick={() => {
              if (confirm(`Delete ${contextMenu.file}?`)) {
                // Delete logic would go here
                setContextMenu(null);
              }
            }}
            className="w-full text-left px-3 py-1.5 text-[12px] text-[#f85149] hover:bg-[#3c3c3c] flex items-center gap-2"
          >
            <span>🗑️</span> Delete
          </button>
        </div>
      )}

      {!isRight && (
        <div className="border-t border-[#3c3c3c] shrink-0">
          <button className="w-full text-left px-3 py-1.5 text-[11px] font-semibold text-[#808080] uppercase hover:text-[#cccccc]">OUTLINE</button>
        </div>
      )}
    </>
  );
}

function SearchPanel({ searchQuery, setSearchQuery, replaceQuery, setReplaceQuery, searchResults, onSearch, onReplace, onReplaceAll, onResultClick }: {
  searchQuery: string; setSearchQuery: (v: string) => void; replaceQuery: string; setReplaceQuery: (v: string) => void;
  searchResults: SearchResult[]; onSearch: () => void; onReplace: () => void; onReplaceAll: () => void; onResultClick: (file: string, line: number) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 shrink-0">
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          placeholder="Search" className="w-full bg-[#2d2d2d] border border-[#3c3c3c] rounded-md px-3 py-1.5 text-[12px] text-[#cccccc] placeholder-[#666] focus:outline-none focus:border-[#007acc]" />
        <input value={replaceQuery} onChange={(e) => setReplaceQuery(e.target.value)}
          placeholder="Replace" className="w-full bg-[#2d2d2d] border border-[#3c3c3c] rounded-md px-3 py-1.5 text-[12px] text-[#cccccc] placeholder-[#666] focus:outline-none focus:border-[#007acc] mt-1" />
        <div className="flex gap-1 mt-2">
          <button onClick={onSearch} className="flex-1 h-[26px] bg-[#007acc] hover:bg-[#0098ff] text-white text-[11px] rounded">Search</button>
          <button onClick={onReplace} className="flex-1 h-[26px] bg-[#3c3c3c] hover:bg-[#4c4c4c] text-white text-[11px] rounded">Replace</button>
          <button onClick={onReplaceAll} className="flex-1 h-[26px] bg-[#3c3c3c] hover:bg-[#4c4c4c] text-white text-[11px] rounded">All</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 text-[12px]">
        {searchResults.length === 0 ? (
          <div className="text-[#808080] text-center py-4">{searchQuery ? 'No results' : 'Enter search term'}</div>
        ) : (
          <div className="text-[#808080] px-2 py-1">{searchResults.length} results</div>
        )}
        {searchResults.map((r, i) => (
          <button key={i} onClick={() => onResultClick(r.file, r.line)} className="w-full text-left px-2 py-1 hover:bg-[#2a2a2a] rounded">
            <div className="text-[#cccccc]">{r.file}:{r.line}</div>
            <div className="text-[#808080] truncate">{r.content}</div>
          </button>
        ))}
      </div>
    </div>
  );
}


function DebugPanel({ onStart, onStop }: { onStart: () => void; onStop: () => void }) {
  const [isRunning, setIsRunning] = useState(false);
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 shrink-0">
        <select className="w-full bg-[#2d2d2d] border border-[#3c3c3c] rounded-md px-2 py-1 text-[12px] text-[#cccccc]">
          <option>Node.js: Launch Program</option>
          <option>Chrome: Attach</option>
        </select>
        <button onClick={() => { setIsRunning(!isRunning); isRunning ? onStop() : onStart(); }}
          className={`w-full h-[28px] ${isRunning ? 'bg-[#da3633] hover:bg-[#f85149]' : 'bg-[#3fb950] hover:bg-[#2ea043]'} text-white text-[12px] font-medium rounded-md mt-2 flex items-center justify-center gap-2`}>
          {isRunning ? '■ Stop' : '▶ Start Debugging'}
        </button>
      </div>
      <div className="px-2 text-[11px]">
        <div className="font-semibold text-[#808080] uppercase px-2 py-1.5">Variables</div>
        <div className="text-[#666] px-2">{isRunning ? 'Paused at breakpoint' : 'Not running'}</div>
        <div className="font-semibold text-[#808080] uppercase px-2 py-1.5 mt-2">Watch</div>
        <div className="text-[#666] px-2">No expressions</div>
        <div className="font-semibold text-[#808080] uppercase px-2 py-1.5 mt-2">Call Stack</div>
        <div className="text-[#666] px-2">{isRunning ? 'main() at line 15' : 'Not available'}</div>
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

function TitanAgentPanel({ sessions, activeSessionId, setActiveSessionId, currentSession, chatInput, setChatInput, isThinking, isStreaming, activeModel, onNewAgent, onSend, onStop, onKeyDown, onApply, chatEndRef, hasPendingDiff, onRejectDiff, onRenameSession, onDeleteSession, onRetry, onApplyCode }: {
  sessions: Session[]; activeSessionId: string; setActiveSessionId: (id: string) => void; currentSession: Session;
  chatInput: string; setChatInput: (v: string) => void; isThinking: boolean; isStreaming: boolean; activeModel: string;
  onNewAgent: () => void; onSend: () => void; onStop: () => void; onKeyDown: (e: React.KeyboardEvent) => void; onApply: () => void; chatEndRef: React.MutableRefObject<HTMLDivElement | null>;
  hasPendingDiff?: boolean; onRejectDiff?: () => void;
  onRenameSession?: (id: string, name: string) => void; onDeleteSession?: (id: string) => void;
  onRetry?: (message: string) => void;
  onApplyCode?: (code: string, filename?: string) => void;
}) {
  const [showFiles, setShowFiles] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [chatInput]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 shrink-0 border-b border-[#2d2d2d]">
        <button onClick={onNewAgent} className="w-full h-[32px] bg-[#2d2d2d] hover:bg-[#3c3c3c] text-[#e0e0e0] text-[12px] font-medium rounded-md flex items-center justify-center gap-1.5 border border-[#3c3c3c] transition-colors">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a.75.75 0 01.75.75v5.5h5.5a.75.75 0 010 1.5h-5.5v5.5a.75.75 0 01-1.5 0v-5.5h-5.5a.75.75 0 010-1.5h5.5v-5.5A.75.75 0 018 1z"/></svg>
          New Thread
        </button>
      </div>

      {/* Session list */}
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
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const menu = document.getElementById(`session-menu-${s.id}`);
                  if (menu) menu.classList.toggle('hidden');
                }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#3c3c3c] text-[#808080] text-[10px]"
              >···</button>
              <div id={`session-menu-${s.id}`} className="hidden absolute right-0 top-6 z-50 bg-[#252526] border border-[#3c3c3c] rounded shadow-lg min-w-[120px]">
                <button onClick={(e) => { e.stopPropagation(); const n = prompt('Rename:', s.name); if (n?.trim()) onRenameSession?.(s.id, n.trim()); document.getElementById(`session-menu-${s.id}`)?.classList.add('hidden'); }} className="w-full text-left px-3 py-1.5 text-[12px] text-[#cccccc] hover:bg-[#2a2d2e]">Rename</button>
                <button onClick={(e) => { e.stopPropagation(); document.getElementById(`session-menu-${s.id}`)?.classList.add('hidden'); if (sessions.length > 1) onDeleteSession?.(s.id); }} className="w-full text-left px-3 py-1.5 text-[12px] text-[#f48771] hover:bg-[#2a2d2e]">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Messages area - scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-3 py-3">
          {currentSession.messages.map((msg, i) => (
            <ChatMessage
              key={i}
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
              onRetry={onRetry}
              onApplyCode={onApplyCode}
            />
          ))}

          {/* Thinking indicator */}
          {isThinking && !currentSession.messages.some(m => m.streaming) && (
            <div className="mb-4 flex items-center gap-2 px-1">
              <div className="flex items-center gap-2 text-[12px] text-[#808080]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#569cd6" strokeWidth="2" className="animate-spin">
                  <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83"/>
                </svg>
                <span>Thinking...</span>
              </div>
            </div>
          )}
          <div ref={(node) => { chatEndRef.current = node; }} />
        </div>
      </div>

      {/* Bottom input area - always pinned */}
      <div className="shrink-0 border-t border-[#2d2d2d]">
        {/* Diff banner */}
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

        {/* Changed files */}
        {currentSession.changedFiles.length > 0 && !hasPendingDiff && (
          <div className="border-b border-[#2d2d2d]">
            <button onClick={() => setShowFiles(!showFiles)} className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[#808080] hover:text-[#cccccc]">
              <div className="flex items-center gap-1.5">
                <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor" className={`transition-transform ${showFiles ? 'rotate-90' : ''}`}><path d="M6 4l4 4-4 4z"/></svg>
                <span>{currentSession.changedFiles.length} file{currentSession.changedFiles.length !== 1 ? 's' : ''} changed</span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onApply(); }} className="h-[20px] px-2 bg-[#238636] hover:bg-[#2ea043] text-white text-[10px] rounded">Apply All</button>
            </button>
            {showFiles && (
              <div className="px-3 pb-1.5">
                {currentSession.changedFiles.map((f, i) => (
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

        {/* Text input */}
        <div className="p-2">
          <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg focus-within:border-[#569cd6] transition-colors">
            <textarea
              ref={textareaRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask Titan to edit code, fix bugs, run commands..."
              rows={1}
              className="w-full bg-transparent px-3 py-2 text-[13px] text-[#e0e0e0] placeholder-[#555] focus:outline-none resize-none leading-5 max-h-[120px]"
            />
            <div className="flex items-center justify-between px-2 pb-1.5">
              <span className="text-[11px] text-[#555] flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isThinking || isStreaming ? 'bg-[#f9826c] animate-pulse' : 'bg-[#3fb950]'}`} />
                {activeModel}
              </span>
              {isThinking || isStreaming ? (
                <button onClick={onStop} className="w-[26px] h-[26px] flex items-center justify-center rounded-md bg-[#f85149] hover:bg-[#da3633] text-white transition-colors" title="Stop">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1.5"/></svg>
                </button>
              ) : (
                <button onClick={onSend} disabled={!chatInput.trim()} className={`w-[26px] h-[26px] flex items-center justify-center rounded-md transition-colors ${chatInput.trim() ? 'bg-[#569cd6] hover:bg-[#6eb0e6] text-white' : 'bg-[#2d2d2d] text-[#555]'}`} title="Send (Enter)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountsPanel() {
  const [apiKeys, setApiKeys] = useState({
    openai: { connected: true, key: 'sk-...4a2f' },
    anthropic: { connected: true, key: 'sk-ant-...b3d1' },
    google: { connected: false, key: '' },
    openrouter: { connected: true, key: 'sk-or-...9e1c' },
    deepseek: { connected: false, key: '' },
    mistral: { connected: false, key: '' },
  });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');

  const handleAddKey = (provider: string) => {
    if (keyInput.trim()) {
      setApiKeys(prev => ({
        ...prev,
        [provider]: { connected: true, key: keyInput.slice(0, 6) + '...' + keyInput.slice(-4) }
      }));
      setEditingKey(null);
      setKeyInput('');
    }
  };

  const providers = [
    { id: 'openai', name: 'OpenAI', icon: '⚪' },
    { id: 'anthropic', name: 'Anthropic', icon: '🟠' },
    { id: 'google', name: 'Google AI', icon: '🔵' },
    { id: 'openrouter', name: 'OpenRouter', icon: '🟣' },
    { id: 'deepseek', name: 'DeepSeek', icon: '🔴' },
    { id: 'mistral', name: 'Mistral', icon: '🟡' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-3 p-3 bg-[#2a2a2a] rounded-lg">
          <div className="w-12 h-12 rounded-full bg-[#007acc] flex items-center justify-center text-white text-[18px] font-bold">T</div>
          <div>
            <div className="text-[14px] text-[#e0e0e0] font-medium">Titan User</div>
            <div className="text-[12px] text-[#808080]">titan@example.com</div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        <div className="text-[11px] font-semibold text-[#808080] uppercase px-2 py-1.5 flex items-center justify-between">
          <span>API Keys (BYOK)</span>
          <span className="text-[10px] text-[#007acc] font-normal">Bring Your Own Key</span>
        </div>
        {providers.map(p => {
          const data = apiKeys[p.id as keyof typeof apiKeys];
          return (
            <div key={p.id} className="px-2 py-2 hover:bg-[#2a2a2a] rounded">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{p.icon}</span>
                  <span className="text-[12px] text-[#cccccc]">{p.name}</span>
                </div>
                {data.connected ? (
                  <span className="text-[11px] text-[#3fb950]">✓ Connected</span>
                ) : (
                  <button 
                    onClick={() => setEditingKey(p.id)}
                    className="text-[11px] text-[#007acc] hover:text-[#0098ff]"
                  >
                    + Add Key
                  </button>
                )}
              </div>
              {data.connected && (
                <div className="text-[10px] text-[#555] mt-0.5 ml-6">{data.key}</div>
              )}
              {editingKey === p.id && (
                <div className="mt-2 flex gap-1">
                  <input
                    type="password"
                    placeholder={`Enter ${p.name} API key...`}
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    className="flex-1 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-[#cccccc] focus:outline-none focus:border-[#007acc]"
                  />
                  <button
                    onClick={() => handleAddKey(p.id)}
                    className="px-2 py-1 bg-[#007acc] hover:bg-[#0098ff] text-white text-[10px] rounded"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setEditingKey(null); setKeyInput(''); }}
                    className="px-2 py-1 bg-[#3c3c3c] hover:bg-[#4c4c4c] text-white text-[10px] rounded"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          );
        })}
        
        <div className="text-[11px] font-semibold text-[#808080] uppercase px-2 py-1.5 mt-3">Usage This Month</div>
        <div className="px-2">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[#cccccc]">Credits Used</span>
            <span className="text-[#3fb950]">$47.50</span>
          </div>
          <div className="w-full h-2 bg-[#3c3c3c] rounded-full mt-2">
            <div className="h-full w-[25%] bg-gradient-to-r from-[#007acc] to-[#3fb950] rounded-full"></div>
          </div>
          <div className="flex justify-between text-[10px] text-[#666] mt-1">
            <span>0</span>
            <span>Limit: $200</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ 
  fontSize, setFontSize, tabSize, setTabSize, wordWrap, setWordWrap, 
  activeModel, setActiveModel, models, trustLevel, setTrustLevel, midnightActive 
}: {
  fontSize: number; setFontSize: (v: number) => void; tabSize: number; setTabSize: (v: number) => void;
  wordWrap: boolean; setWordWrap: (v: boolean) => void; activeModel: string; setActiveModel: (v: string) => void; models: string[];
  trustLevel: 1 | 2 | 3; setTrustLevel: (v: 1 | 2 | 3) => void; midnightActive: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 shrink-0">
        <input placeholder="Search settings" className="w-full bg-[#2d2d2d] border border-[#3c3c3c] rounded-md px-3 py-1.5 text-[12px] text-[#cccccc] placeholder-[#666] focus:outline-none" />
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        <div className="text-[11px] font-semibold text-[#808080] uppercase px-2 py-1.5">Editor</div>
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[12px] text-[#cccccc]">Font Size</span>
          <input type="number" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-16 bg-[#2d2d2d] border border-[#3c3c3c] rounded px-2 py-0.5 text-[12px] text-[#cccccc] text-right" />
        </div>
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[12px] text-[#cccccc]">Tab Size</span>
          <input type="number" value={tabSize} onChange={(e) => setTabSize(Number(e.target.value))} className="w-16 bg-[#2d2d2d] border border-[#3c3c3c] rounded px-2 py-0.5 text-[12px] text-[#cccccc] text-right" />
        </div>
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[12px] text-[#cccccc]">Word Wrap</span>
          <button onClick={() => setWordWrap(!wordWrap)} className={`w-10 h-5 rounded-full ${wordWrap ? 'bg-[#007acc]' : 'bg-[#3c3c3c]'} relative`}>
            <span className={`absolute top-0.5 ${wordWrap ? 'right-0.5' : 'left-0.5'} w-4 h-4 bg-white rounded-full transition-all`}></span>
          </button>
        </div>
        <div className="text-[11px] font-semibold text-[#808080] uppercase px-2 py-1.5 mt-3">Titan AI</div>
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[12px] text-[#cccccc]">Default Model</span>
          <select value={activeModel} onChange={(e) => setActiveModel(e.target.value)} className="bg-[#2d2d2d] border border-[#3c3c3c] rounded px-2 py-0.5 text-[12px] text-[#cccccc]">
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        
        {/* Project Midnight Section */}
        <div className="text-[11px] font-semibold text-purple-400 uppercase px-2 py-1.5 mt-3 flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-purple-400">
            <path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" stroke="currentColor" strokeWidth="1.5" fill={midnightActive ? 'currentColor' : 'none'}/>
          </svg>
          Project Midnight
        </div>
        <div className="px-2 py-2">
          <TrustSlider value={trustLevel} onChange={setTrustLevel} disabled={midnightActive} />
        </div>
      </div>
    </div>
  );
}

/* ─── ICONS ─── */
function ExplorerIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>; }
function SearchIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>; }
function GitIcon({ size = 22 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>; }
function DebugIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="5 3 19 12 5 21 5 3"/></svg>; }
function ExtensionsIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function TitanAgentIcon({ size = 22 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>; }
function AccountIcon({ size = 22 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function SettingsGearIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
