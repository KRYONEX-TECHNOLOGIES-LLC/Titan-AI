'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type * as Monaco from 'monaco-editor';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="flex-1 bg-[#1e1e1e]" />,
});

// Project Midnight Components
const MidnightToggle = dynamic(() => import('@/components/midnight/MidnightToggle'), { ssr: false });
const FactoryView = dynamic(() => import('@/components/midnight/FactoryView'), { ssr: false });
const TrustSlider = dynamic(() => import('@/components/midnight/TrustSlider'), { ssr: false });
const ConfidenceIndicator = dynamic(
  () => import('@/components/midnight/ConfidenceMeter').then(mod => ({ default: mod.ConfidenceIndicator })),
  { ssr: false }
);

/* ═══ FILE CONTENTS DATABASE ═══ */
const FILE_CONTENTS: Record<string, { content: string; language: string }> = {
  'orchestrator.ts': {
    language: 'typescript',
    content: `import { TitanAI } from '@titan/core';

export class AgentOrchestrator {
  private agents: Map<string, Agent> = new Map();
  private coordinator: CoordinatorAgent;

  constructor(private config: OrchestratorConfig) {
    this.coordinator = new CoordinatorAgent(config);
  }

  async dispatch(task: Task): Promise<TaskResult> {
    const plan = await this.coordinator.plan(task);
    const agents = this.selectAgents(plan);

    const results = await Promise.all(
      agents.map(agent => agent.execute(plan.subtasks.get(agent.id)!))
    );

    return this.coordinator.merge(results);
  }

  private selectAgents(plan: ExecutionPlan): Agent[] {
    return plan.requiredCapabilities.map(cap =>
      this.findBestAgent(cap)
    );
  }

  private findBestAgent(capability: string): Agent {
    const candidates = [...this.agents.values()]
      .filter(a => a.capabilities.includes(capability))
      .sort((a, b) => b.score - a.score);
    return candidates[0];
  }
}
`,
  },
  'page.tsx': {
    language: 'typescript',
    content: `'use client';

import { useState } from 'react';

export default function HomePage() {
  const [count, setCount] = useState(0);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <button onClick={() => setCount(c => c + 1)}>
        Count: {count}
      </button>
    </div>
  );
}
`,
  },
  'layout.tsx': {
    language: 'typescript',
    content: `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Titan AI',
  description: 'AI-Native IDE',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
  },
  'globals.css': {
    language: 'css',
    content: `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-primary: #1e1e1e;
  --text-primary: #cccccc;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
}
`,
  },
  'package.json': {
    language: 'json',
    content: `{
  "name": "@titan/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@monaco-editor/react": "^4.6.0"
  }
}
`,
  },
  'tsconfig.json': {
    language: 'json',
    content: `{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
`,
  },
  'untitled-1': {
    language: 'typescript',
    content: '// New file\n',
  },
};

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
  role: 'user' | 'assistant';
  content: string;
  time?: string;
}

interface SearchResult {
  file: string;
  line: number;
  content: string;
  match: string;
}

/* ═══ MAIN IDE COMPONENT ═══ */
export default function TitanIDE() {
  // HYDRATION FIX: Prevent SSR mismatch from browser extensions
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Panel visibility
  const [activeView, setActiveView] = useState<string>('titan-agent');
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string[]>(['$ Welcome to Titan AI Terminal', '$ Type commands here...']);
  const [terminalInput, setTerminalInput] = useState('');

  // Editor state
  const [editorInstance, setEditorInstance] = useState<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [monacoInstance, setMonacoInstance] = useState<typeof Monaco | null>(null);
  const [tabs, setTabs] = useState<FileTab[]>([
    { name: 'orchestrator.ts', icon: 'TS', color: '#3178c6' },
  ]);
  const [activeTab, setActiveTab] = useState('orchestrator.ts');
  const [fileContents, setFileContents] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    Object.entries(FILE_CONTENTS).forEach(([name, data]) => {
      initial[name] = data.content;
    });
    return initial;
  });
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });

  // AI Chat state
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);

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
  const [activeModel, setActiveModel] = useState('Opus 4.5');
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
  
  // Full model registry (30+ models)
  const [modelRegistry, setModelRegistry] = useState<ModelInfo[]>([]);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const models = ['Opus 4.5', 'Sonnet 3.5', 'GPT-4o', 'Gemini Pro', 'Claude 3']; // Fallback

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

  // Get current session
  const currentSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  // Fetch model registry on mount
  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        if (data.models) {
          setModelRegistry(data.models);
        }
      })
      .catch(console.error);
  }, []);

  // ═══ PERSISTENCE: Save state to localStorage ═══
  useEffect(() => {
    if (!mounted) return;
    const state = {
      tabs: tabs.map(t => ({ name: t.name, icon: t.icon, color: t.color, modified: t.modified })),
      activeTab,
      sessions: sessions.map(s => ({
        id: s.id,
        name: s.name,
        time: s.time,
        messages: s.messages,
        changedFiles: s.changedFiles,
      })),
      activeSessionId,
      activeModel,
      trustLevel,
      midnightActive,
      fileContents,
      gitBranch,
      fontSize,
      tabSize,
      wordWrap,
    };
    localStorage.setItem('titan-ai-state', JSON.stringify(state));
  }, [mounted, tabs, activeTab, sessions, activeSessionId, activeModel, trustLevel, midnightActive, fileContents, gitBranch, fontSize, tabSize, wordWrap]);

  // ═══ PERSISTENCE: Restore state from localStorage (FULL) ═══
  useEffect(() => {
    if (!mounted) return;
    try {
      const saved = localStorage.getItem('titan-ai-state');
      if (saved) {
        const state = JSON.parse(saved);
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
        // Restore file contents
        if (state.fileContents && Object.keys(state.fileContents).length > 0) {
          setFileContents(prev => ({ ...prev, ...state.fileContents }));
        }
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
      default:
        return { icon: 'TXT', color: '#808080' };
    }
  };

  /* ═══ EDITOR COMMANDS ═══ */

  const executeCommand = useCallback((command: string) => {
    if (!editorInstance || !monacoInstance) return;

    switch (command) {
      // File commands
      case 'newFile': {
        const newFileName = `untitled-${Date.now()}.ts`;
        setFileContents(prev => ({ ...prev, [newFileName]: '// New file\n' }));
        const info = getFileInfo(newFileName);
        setTabs(prev => [...prev, { name: newFileName, icon: info.icon, color: info.color }]);
        setActiveTab(newFileName);
        break;
      }
      case 'save': {
        setTabs(prev => prev.map(t => t.name === activeTab ? { ...t, modified: false } : t));
        setTerminalOutput(prev => [...prev, `$ File saved: ${activeTab}`]);
        break;
      }
      case 'saveAll': {
        setTabs(prev => prev.map(t => ({ ...t, modified: false })));
        setTerminalOutput(prev => [...prev, '$ All files saved']);
        break;
      }

      // Edit commands
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

      // Selection commands
      case 'selectAll':
        editorInstance.trigger('keyboard', 'editor.action.selectAll', null);
        break;
      case 'expandSelection':
        editorInstance.trigger('keyboard', 'editor.action.smartSelect.expand', null);
        break;

      // View commands
      case 'commandPalette':
        editorInstance.trigger('keyboard', 'editor.action.quickCommand', null);
        break;
      case 'toggleSidebar':
        setActiveView(prev => prev ? '' : 'titan-agent');
        break;
      case 'togglePanel':
        setShowTerminal(prev => !prev);
        break;

      // Go commands
      case 'goToFile':
        editorInstance.trigger('keyboard', 'workbench.action.quickOpen', null);
        break;
      case 'goToSymbol':
        editorInstance.trigger('keyboard', 'editor.action.quickOutline', null);
        break;
      case 'goToLine':
        editorInstance.trigger('keyboard', 'editor.action.gotoLine', null);
        break;

      // Terminal commands
      case 'newTerminal':
        setShowTerminal(true);
        setTerminalOutput(prev => [...prev, '$ New terminal session started']);
        setTimeout(() => terminalInputRef.current?.focus(), 100);
        break;
      case 'splitTerminal':
        setShowTerminal(true);
        setTerminalOutput(prev => [...prev, '$ Terminal split (simulated)']);
        break;

      // Debug commands
      case 'startDebug':
        setShowTerminal(true);
        setTerminalOutput(prev => [...prev, '$ Starting debugger...', '$ Debugger attached to process', '$ Listening on port 9229']);
        break;
      case 'stopDebug':
        setTerminalOutput(prev => [...prev, '$ Debugger disconnected']);
        break;
    }
  }, [editorInstance, monacoInstance, activeTab]);

  /* ═══ HANDLERS ═══ */

  // Handle sending message with code context - WIRED TO API
  const handleSend = useCallback(async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput('');

    // Get code context from Monaco (LIVE VISION)
    const currentCode = editorInstance?.getValue() || fileContents[activeTab] || '';
    const selection = editorInstance?.getSelection();
    const selectedText = selection ? editorInstance?.getModel()?.getValueInRange(selection) : '';
    const currentLanguage = FILE_CONTENTS[activeTab]?.language || 'typescript';

    // Add user message with context indicator
    const userMessage: ChatMessage = {
      role: 'user',
      content: selectedText ? `[Selected Code]\n\`\`\`${currentLanguage}\n${selectedText}\n\`\`\`\n\n${msg}` : msg,
      time: 'just now',
    };

    setSessions(prev => prev.map(s =>
      s.id === activeSessionId
        ? { ...s, messages: [...s.messages, userMessage] }
        : s
    ));
    setIsThinking(true);

    try {
      // Call the chat API with code context
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          message: msg,
          model: activeModel,
          codeContext: {
            file: activeTab,
            content: currentCode,
            selection: selectedText || undefined,
            language: currentLanguage,
          },
        }),
      });

      const data = await response.json();
      
      setIsThinking(false);
      
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.content || 'I apologize, but I encountered an error processing your request.',
        time: 'just now',
      };

      // Check for suggested edits and apply as DIFFS
      const newChangedFiles = data.suggestedEdits?.map((edit: { file: string; content?: string }) => {
        const info = getFileInfo(edit.file);
        return { name: edit.file, additions: 15, deletions: 3, icon: info.icon, color: info.color };
      }) || [];

      // If there are code suggestions, apply them as diff decorations
      if (data.suggestedEdits && data.suggestedEdits.length > 0) {
        const edit = data.suggestedEdits[0];
        if (edit.content && edit.file === activeTab) {
          // Apply diff decorations showing red/green
          applyDiffDecorations(currentCode, edit.content);
        }
      } else if (data.content?.includes('```')) {
        // Extract code from markdown code blocks
        const codeMatch = data.content.match(/```(?:\w+)?\n([\s\S]*?)```/);
        if (codeMatch && codeMatch[1]) {
          const suggestedCode = codeMatch[1].trim();
          // If the code looks like a full replacement, apply as diff
          if (suggestedCode.length > 50) {
            applyDiffDecorations(currentCode, suggestedCode);
          }
        }
      }

      setSessions(prev => prev.map(s =>
        s.id === activeSessionId
          ? {
            ...s,
            messages: [...s.messages, assistantMessage],
            changedFiles: newChangedFiles.length > 0 ? newChangedFiles : 
              (s.changedFiles.length === 0 && data.content?.includes('```') ? 
                [{ name: activeTab, additions: 15, deletions: 3, ...getFileInfo(activeTab) }] : s.changedFiles),
          }
          : s
      ));
    } catch (error) {
      console.error('Chat error:', error);
      setIsThinking(false);
      
      // Fallback to local response
      const response = generateAIResponse(msg, activeTab, selectedText || '');
      setSessions(prev => prev.map(s =>
        s.id === activeSessionId
          ? {
            ...s,
            messages: [...s.messages, { role: 'assistant', content: response, time: 'just now' }],
            changedFiles: s.changedFiles.length === 0 ? [{ name: activeTab, additions: 15, deletions: 3, ...getFileInfo(activeTab) }] : s.changedFiles,
          }
          : s
      ));
    }
  }, [chatInput, editorInstance, activeTab, fileContents, activeSessionId, activeModel, applyDiffDecorations]);

  const generateAIResponse = (query: string, file: string, selectedCode: string): string => {
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes('explain')) {
      return `I can see you're working on \`${file}\`. ${selectedCode ? `The selected code defines a ${selectedCode.includes('class') ? 'class' : selectedCode.includes('function') ? 'function' : 'code block'} that handles specific logic.` : 'This file contains TypeScript code for the application.'} Would you like me to provide a more detailed explanation of any specific part?`;
    }
    if (lowerQuery.includes('refactor') || lowerQuery.includes('improve')) {
      return `I've analyzed \`${file}\` and found a few areas for improvement:\n\n1. **Type Safety**: Consider adding more explicit type annotations\n2. **Error Handling**: Add try-catch blocks for async operations\n3. **Performance**: The loop on line 25 could be optimized with a Map lookup\n\nWould you like me to apply these changes?`;
    }
    if (lowerQuery.includes('test')) {
      return `I'll generate unit tests for \`${file}\`:\n\n\`\`\`typescript\ndescribe('AgentOrchestrator', () => {\n  it('should dispatch tasks correctly', async () => {\n    const orchestrator = new AgentOrchestrator(config);\n    const result = await orchestrator.dispatch(mockTask);\n    expect(result).toBeDefined();\n  });\n});\n\`\`\`\n\nShall I create a test file with these tests?`;
    }
    if (lowerQuery.includes('bug') || lowerQuery.includes('fix') || lowerQuery.includes('error')) {
      return `I've scanned \`${file}\` for potential issues:\n\n**Found 1 potential bug:**\n- Line 34: Possible null reference when \`candidates\` array is empty\n\n**Suggested fix:**\n\`\`\`typescript\nreturn candidates[0] ?? this.defaultAgent;\n\`\`\`\n\nWould you like me to apply this fix?`;
    }
    return `I'll help you with that. I can see you're working on \`${file}\`${selectedCode ? ' with some selected code' : ''}. Let me analyze and work on your request.\n\nWhat specific changes would you like me to make?`;
  };

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
          setTerminalOutput(prev => [...prev, 'Running tests...', '', 'PASS src/tests/orchestrator.test.ts', '  ✓ should dispatch tasks (45ms)', '  ✓ should select agents (12ms)', '', 'Tests: 2 passed, 2 total']);
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
  const applyDiffDecorations = useCallback((oldContent: string, newContent: string) => {
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
        if (newLine !== undefined && i < newLines.length) {
          // Line was added or modified - show green
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

    // Show the new content with decorations
    model.setValue(newContent);
  }, [editorInstance, monacoInstance, pendingDiff, activeTab]);

  // Handle editor content change
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setFileContents(prev => ({ ...prev, [activeTab]: value }));
      setTabs(prev => prev.map(t => t.name === activeTab ? { ...t, modified: true } : t));
    }
  }, [activeTab]);

  // Get current file content and language
  const currentFileContent = fileContents[activeTab] || '';
  const currentFileLanguage = FILE_CONTENTS[activeTab]?.language || 'typescript';

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

      {/* ═══ TITLE BAR ═══ */}
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

        {/* Menu Items */}
        <div className="flex items-center text-[#b0b0b0] text-[13px]">
          <MenuDropdown
            label="File"
            isOpen={openMenu === 'file'}
            onToggle={(e) => { e.stopPropagation(); setOpenMenu(openMenu === 'file' ? null : 'file'); }}
            items={[
              { label: 'New File', shortcut: 'Ctrl+N', action: () => executeCommand('newFile') },
              { label: 'New Window', shortcut: 'Ctrl+Shift+N' },
              { type: 'separator' },
              { label: 'Open File...', shortcut: 'Ctrl+O' },
              { label: 'Open Folder...', shortcut: 'Ctrl+K O', action: async () => {
                // Trigger folder import with Tree-sitter indexing
                const mockPath = '/Users/dev/my-project';
                try {
                  const res = await fetch('/api/workspace', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'import', path: mockPath }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setTerminalOutput(prev => [...prev, 
                      `$ Opening folder: ${mockPath}`,
                      '$ Starting Tree-sitter indexer...',
                      '$ Generating LanceDB embeddings...',
                    ]);
                    setShowTerminal(true);
                  }
                } catch (e) {
                  console.error('Folder import failed:', e);
                }
              }},
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
            {activeModel}
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4z"/></svg>
          </button>
          {showModelDropdown && (
            <div className="absolute top-full right-0 mt-1 w-[320px] bg-[#2d2d2d] border border-[#3c3c3c] rounded-lg shadow-xl z-50 overflow-hidden">
              {/* Search */}
              <div className="p-2 border-b border-[#3c3c3c]">
                <input
                  type="text"
                  placeholder="Search models..."
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-[12px] text-[#cccccc] placeholder-[#666] focus:outline-none focus:border-[#007acc]"
                />
              </div>
              {/* Model List */}
              <div className="max-h-[400px] overflow-y-auto">
                {modelRegistry.length > 0 ? (
                  <>
                    {['frontier', 'standard', 'economy', 'local'].map(tier => {
                      const tierModels = modelRegistry.filter(m => 
                        m.tier === tier && 
                        (modelSearchQuery === '' || 
                         m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
                         m.provider.toLowerCase().includes(modelSearchQuery.toLowerCase()))
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
                              onClick={() => { setActiveModel(model.name); setShowModelDropdown(false); setModelSearchQuery(''); }}
                              className={`w-full text-left px-3 py-2 hover:bg-[#3c3c3c] transition-colors border-b border-[#333] ${activeModel === model.name ? 'bg-[#37373d]' : ''}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className={`text-[12px] ${activeModel === model.name ? 'text-[#007acc]' : 'text-[#cccccc]'}`}>{model.name}</span>
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
                      onClick={() => { setActiveModel(model); setShowModelDropdown(false); }}
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
      </div>

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
              <ExplorerPanel activeTab={activeTab} onFileClick={handleFileClick} fileContents={fileContents} />
            )}

            {/* SEARCH */}
            {activeView === 'search' && (
              <SearchPanel
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                replaceQuery={replaceQuery}
                setReplaceQuery={setReplaceQuery}
                searchResults={searchResults}
                onSearch={handleSearch}
                onReplace={handleReplace}
                onReplaceAll={handleReplaceAll}
                onResultClick={(file, line) => {
                  handleFileClick(file);
                  setTimeout(() => editorInstance?.revealLineInCenter(line), 100);
                }}
              />
            )}

            {/* GIT */}
            {activeView === 'git' && (
              <GitPanel
                commitMessage={commitMessage}
                setCommitMessage={setCommitMessage}
                branch={gitBranch}
                setBranch={setGitBranch}
                modifiedFiles={tabs.filter(t => t.modified)}
                stagedFiles={stagedFiles}
                onStage={(file) => setStagedFiles(prev => [...prev, file])}
                onUnstage={(file) => setStagedFiles(prev => prev.filter(f => f !== file))}
                onCommit={handleCommit}
              />
            )}

            {/* DEBUG */}
            {activeView === 'debug' && (
              <DebugPanel onStart={() => executeCommand('startDebug')} onStop={() => executeCommand('stopDebug')} />
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
                activeModel={activeModel}
                onNewAgent={handleNewAgent}
                onSend={handleSend}
                onKeyDown={handleKeyDown}
                onApply={handleApplyChanges}
                chatEndRef={chatEndRef}
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
          {/* Breadcrumb */}
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

          {/* Editor */}
          <div className="flex-1 min-h-0">
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
          </div>

          {/* Terminal */}
          {showTerminal && (
            <div className="h-[200px] bg-[#1e1e1e] border-t border-[#3c3c3c] flex flex-col shrink-0">
              <div className="h-[28px] flex items-center justify-between px-3 bg-[#2b2b2b] border-b border-[#3c3c3c]">
                <span className="text-[11px] text-[#cccccc]">Terminal</span>
                <button onClick={() => setShowTerminal(false)} className="text-[#808080] hover:text-white">×</button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 font-mono text-[12px] text-[#cccccc]">
                {terminalOutput.map((line, i) => (
                  <div key={i} className={line.startsWith('$') ? 'text-[#3fb950]' : ''}>{line}</div>
                ))}
              </div>
              <div className="flex items-center px-2 pb-2">
                <span className="text-[#3fb950] mr-1">$</span>
                <input
                  ref={terminalInputRef}
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  onKeyDown={handleTerminalCommand}
                  className="flex-1 bg-transparent text-[12px] text-[#cccccc] focus:outline-none font-mono"
                  placeholder="Type command..."
                />
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        {showRightPanel && activeView !== 'explorer' && (
          <div className="w-[260px] bg-[#1e1e1e] border-l border-[#3c3c3c] flex flex-col shrink-0">
            <ExplorerPanel activeTab={activeTab} onFileClick={handleFileClick} fileContents={fileContents} isRight />
          </div>
        )}
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
                    body: JSON.stringify({ action: 'start', trustLevel }),
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
            {activeModel}
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

function ExplorerPanel({ activeTab, onFileClick, fileContents, isRight, onAddToContext }: { 
  activeTab: string; 
  onFileClick: (name: string) => void; 
  fileContents: Record<string, string>; 
  isRight?: boolean;
  onAddToContext?: (fileName: string) => void;
}) {
  const files = Object.keys(fileContents);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: string } | null>(null);
  const [contextFiles, setContextFiles] = useState<string[]>([]);

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
        <div className="px-2 py-1 text-[11px] uppercase text-[#e0e0e0] font-semibold">TITAN AI</div>
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

function GitPanel({ commitMessage, setCommitMessage, branch, setBranch, modifiedFiles, stagedFiles, onStage, onUnstage, onCommit }: {
  commitMessage: string; setCommitMessage: (v: string) => void; branch: string; setBranch: (v: string) => void;
  modifiedFiles: FileTab[]; stagedFiles: string[]; onStage: (f: string) => void; onUnstage: (f: string) => void; onCommit: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 shrink-0">
        <select value={branch} onChange={(e) => setBranch(e.target.value)} className="w-full bg-[#2d2d2d] border border-[#3c3c3c] rounded-md px-2 py-1 text-[12px] text-[#cccccc] mb-2">
          <option value="main">main</option>
          <option value="develop">develop</option>
          <option value="feature/ai">feature/ai</option>
        </select>
        <textarea value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} placeholder="Commit message"
          className="w-full bg-[#2d2d2d] border border-[#3c3c3c] rounded-md px-3 py-2 text-[12px] text-[#cccccc] placeholder-[#666] resize-none" rows={2} />
        <button onClick={onCommit} disabled={!commitMessage.trim()} className="w-full h-[28px] bg-[#007acc] hover:bg-[#0098ff] disabled:bg-[#3c3c3c] disabled:text-[#808080] text-white text-[12px] font-medium rounded-md mt-2">
          Commit {stagedFiles.length > 0 ? `(${stagedFiles.length})` : ''}
        </button>
      </div>
      <div className="px-2 flex-1 overflow-y-auto">
        <div className="text-[11px] font-semibold text-[#808080] uppercase px-2 py-1.5">Staged ({stagedFiles.length})</div>
        {stagedFiles.map(f => (
          <div key={f} className="flex items-center justify-between px-2 py-1 hover:bg-[#2a2a2a] rounded">
            <span className="text-[12px] text-[#cccccc]">{f}</span>
            <button onClick={() => onUnstage(f)} className="text-[10px] text-[#808080] hover:text-white">−</button>
          </div>
        ))}
        <div className="text-[11px] font-semibold text-[#808080] uppercase px-2 py-1.5 mt-2">Changes ({modifiedFiles.length})</div>
        {modifiedFiles.filter(f => !stagedFiles.includes(f.name)).map(f => (
          <div key={f.name} className="flex items-center justify-between px-2 py-1 hover:bg-[#2a2a2a] rounded">
            <span className="text-[12px] text-[#cccccc]">{f.name}</span>
            <button onClick={() => onStage(f.name)} className="text-[10px] text-[#808080] hover:text-white">+</button>
          </div>
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

function TitanAgentPanel({ sessions, activeSessionId, setActiveSessionId, currentSession, chatInput, setChatInput, isThinking, activeModel, onNewAgent, onSend, onKeyDown, onApply, chatEndRef, hasPendingDiff, onRejectDiff }: {
  sessions: Session[]; activeSessionId: string; setActiveSessionId: (id: string) => void; currentSession: Session;
  chatInput: string; setChatInput: (v: string) => void; isThinking: boolean; activeModel: string;
  onNewAgent: () => void; onSend: () => void; onKeyDown: (e: React.KeyboardEvent) => void; onApply: () => void; chatEndRef: React.RefObject<HTMLDivElement | null>;
  hasPendingDiff?: boolean; onRejectDiff?: () => void;
}) {
  const [showFiles, setShowFiles] = useState(true);
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 shrink-0">
        <button onClick={onNewAgent} className="w-full h-[36px] bg-[#007acc] hover:bg-[#0098ff] text-white text-[13px] font-medium rounded-md flex items-center justify-center gap-2">
          <span>+</span> New Agent
        </button>
      </div>
      <div className="px-2 shrink-0 max-h-[120px] overflow-y-auto">
        <div className="text-[11px] font-semibold text-[#808080] uppercase px-2 py-1.5">AGENTS</div>
        {sessions.slice(0, 5).map(s => (
          <button key={s.id} onClick={() => setActiveSessionId(s.id)}
            className={`w-full text-left rounded-md px-2.5 py-2 mb-0.5 ${activeSessionId === s.id ? 'bg-[#2a2a2a]' : 'hover:bg-[#2a2a2a]'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${activeSessionId === s.id ? 'bg-[#007acc]' : 'bg-[#555]'}`}></span><span className="text-[13px] text-[#e0e0e0] truncate">{s.name}</span></div>
              <span className="text-[11px] text-[#666]">{s.time}</span>
            </div>
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
        {currentSession.messages.map((msg, i) => (
          <div key={i} className="mb-4 flex gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${msg.role === 'user' ? 'bg-[#3c3c3c]' : 'bg-[#007acc]'}`}>
              {msg.role === 'user' ? <AccountIcon size={14} /> : <TitanAgentIcon size={14} />}
            </div>
            <div className="text-[13px] text-[#cccccc] leading-relaxed whitespace-pre-wrap">{msg.content}</div>
          </div>
        ))}
        {isThinking && <div className="flex gap-2 mb-4"><div className="w-6 h-6 rounded-full bg-[#007acc] flex items-center justify-center"><TitanAgentIcon size={14} /></div><div className="text-[13px] text-[#808080] animate-pulse">Thinking...</div></div>}
        <div ref={chatEndRef} />
      </div>
      <div className="border-t border-[#3c3c3c] shrink-0">
        {/* Pending Diff Banner */}
        {hasPendingDiff && (
          <div className="bg-gradient-to-r from-[#3fb950]/20 to-[#f85149]/20 border-b border-[#3c3c3c] px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-[#3fb950] rounded-full animate-pulse" />
                <span className="text-[12px] text-[#e0e0e0] font-medium">Diff Preview Active</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={onRejectDiff}
                  className="h-[24px] px-3 bg-[#f85149] hover:bg-[#da3633] text-white text-[11px] font-medium rounded"
                >
                  Reject
                </button>
                <button 
                  onClick={onApply}
                  className="h-[24px] px-3 bg-[#3fb950] hover:bg-[#2ea043] text-white text-[11px] font-medium rounded"
                >
                  Accept
                </button>
              </div>
            </div>
            <p className="text-[11px] text-[#808080] mt-1">Green lines = additions. Click Accept to apply changes.</p>
          </div>
        )}
        
        {currentSession.changedFiles.length > 0 && !hasPendingDiff && (
          <div className="border-b border-[#3c3c3c]">
            <button onClick={() => setShowFiles(!showFiles)} className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] text-[#808080] hover:text-[#cccccc]">
              <div className="flex items-center gap-1.5"><svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className={`transition-transform ${showFiles ? 'rotate-90' : ''}`}><path d="M6 4l4 4-4 4z"/></svg><span>{currentSession.changedFiles.length} Files</span></div>
              <button onClick={(e) => { e.stopPropagation(); onApply(); }} className="h-[22px] px-2.5 bg-[#22d3ee] hover:bg-[#06b6d4] text-[#111] text-[11px] font-medium rounded-md">Apply</button>
            </button>
            {showFiles && <div className="px-3 pb-2">{currentSession.changedFiles.map((f, i) => (<div key={i} className="flex items-center gap-2 py-0.5 text-[12px]"><span style={{ color: f.color }}>{f.icon}</span><span className="text-[#cccccc]">{f.name}</span><span className="text-[#3fb950] ml-auto">+{f.additions}</span><span className="text-[#f85149]">-{f.deletions}</span></div>))}</div>}
          </div>
        )}
        <div className="p-3">
          <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={onKeyDown} placeholder="Ask anything..." rows={2}
            className="w-full bg-[#2d2d2d] border border-[#3c3c3c] rounded-lg px-3 py-2 text-[13px] text-[#e0e0e0] placeholder-[#555] focus:outline-none focus:border-[#007acc] resize-none" />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[12px] text-[#808080] flex items-center gap-1"><span className="w-1.5 h-1.5 bg-[#3fb950] rounded-full"></span>{activeModel}</span>
            <button onClick={onSend} disabled={!chatInput.trim()} className={`w-[28px] h-[28px] flex items-center justify-center rounded-full ${chatInput.trim() ? 'bg-[#007acc] hover:bg-[#0098ff] text-white' : 'bg-[#3c3c3c] text-[#555]'}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountsPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-3 p-3 bg-[#2a2a2a] rounded-lg">
          <div className="w-12 h-12 rounded-full bg-[#007acc] flex items-center justify-center text-white text-[18px] font-bold">T</div>
          <div><div className="text-[14px] text-[#e0e0e0] font-medium">Titan User</div><div className="text-[12px] text-[#808080]">titan@example.com</div></div>
        </div>
      </div>
      <div className="px-2">
        <div className="text-[11px] font-semibold text-[#808080] uppercase px-2 py-1.5">API Keys</div>
        {['OpenAI', 'Anthropic', 'Google'].map(k => (
          <div key={k} className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[12px] text-[#cccccc]">{k}</span>
            <span className="text-[11px] text-[#3fb950]">✓ Connected</span>
          </div>
        ))}
        <div className="text-[11px] font-semibold text-[#808080] uppercase px-2 py-1.5 mt-3">Usage</div>
        <div className="px-2"><div className="text-[12px] text-[#cccccc]">Credits: <span className="text-[#3fb950]">$47.50</span></div>
          <div className="w-full h-2 bg-[#3c3c3c] rounded-full mt-2"><div className="h-full w-[25%] bg-[#007acc] rounded-full"></div></div>
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
