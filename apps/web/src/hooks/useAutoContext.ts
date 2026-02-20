'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { isElectron, electronAPI } from '@/lib/electron';

interface CursorPosition {
  line: number;
  column: number;
  file: string;
}

interface RecentFile {
  file: string;
  timestamp: number;
}

interface LinterDiagnostic {
  file: string;
  line: number;
  column: number;
  severity: string;
  message: string;
  source?: string;
}

export interface AutoContext {
  cursorPosition: CursorPosition | null;
  recentlyEditedFiles: RecentFile[];
  recentlyViewedFiles: string[];
  linterDiagnostics: LinterDiagnostic[];
  terminalOutput: string[];
  isDesktop: boolean;
  osPlatform: string;
}

const MAX_RECENT_FILES = 10;
const MAX_TERMINAL_LINES = 20;

export function useAutoContext(
  editorInstance: unknown | null,
  activeTab: string,
  workspacePath: string,
): AutoContext {
  const [cursorPosition, setCursorPosition] = useState<CursorPosition | null>(null);
  const [recentlyEditedFiles, setRecentlyEditedFiles] = useState<RecentFile[]>([]);
  const [recentlyViewedFiles, setRecentlyViewedFiles] = useState<string[]>([]);
  const [linterDiagnostics, setLinterDiagnostics] = useState<LinterDiagnostic[]>([]);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const viewedRef = useRef(new Set<string>());

  // Track cursor position from Monaco
  useEffect(() => {
    if (!editorInstance) return;
    const editor = editorInstance as {
      onDidChangeCursorPosition: (cb: (e: { position: { lineNumber: number; column: number } }) => void) => { dispose: () => void };
    };
    const disposable = editor.onDidChangeCursorPosition((e) => {
      setCursorPosition({
        line: e.position.lineNumber,
        column: e.position.column,
        file: activeTab,
      });
    });
    return () => disposable.dispose();
  }, [editorInstance, activeTab]);

  // Track recently viewed files
  useEffect(() => {
    if (!activeTab) return;
    viewedRef.current.add(activeTab);
    setRecentlyViewedFiles(prev => {
      const filtered = prev.filter(f => f !== activeTab);
      return [activeTab, ...filtered].slice(0, MAX_RECENT_FILES);
    });
  }, [activeTab]);

  // Track file edits for recently edited files
  const trackFileEdit = useCallback((filePath: string) => {
    setRecentlyEditedFiles(prev => {
      const filtered = prev.filter(f => f.file !== filePath);
      return [{ file: filePath, timestamp: Date.now() }, ...filtered].slice(0, MAX_RECENT_FILES);
    });
  }, []);

  // Linter diagnostics (Electron only -- uses native linter)
  useEffect(() => {
    if (!isElectron || !electronAPI || !activeTab) return;

    const fetchDiagnostics = async () => {
      try {
        const diag = await electronAPI!.linter.getDiagnostics(activeTab);
        setLinterDiagnostics(diag);
      } catch {
        setLinterDiagnostics([]);
      }
    };

    fetchDiagnostics();
    const interval = setInterval(fetchDiagnostics, 10000);

    const unsub = electronAPI.linter.onDiagnosticsChange((diag) => {
      setLinterDiagnostics(diag as LinterDiagnostic[]);
    });

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, [activeTab]);

  // Linter diagnostics (Monaco markers fallback for web mode)
  useEffect(() => {
    if (isElectron || !editorInstance) return;
    const editor = editorInstance as {
      getModel: () => {
        onDidChangeDecorations: (cb: () => void) => { dispose: () => void };
        uri: unknown;
      } | null;
    };
    const model = editor.getModel();
    if (!model) return;

    const checkMarkers = () => {
      try {
        const monaco = (window as unknown as Record<string, unknown>).monaco as {
          editor: {
            getModelMarkers: (opts: { resource: unknown }) => Array<{
              startLineNumber: number;
              startColumn: number;
              severity: number;
              message: string;
              source?: string;
            }>;
          };
        } | undefined;
        if (!monaco) return;
        const markers = monaco.editor.getModelMarkers({ resource: model.uri });
        setLinterDiagnostics(markers.map(m => ({
          file: activeTab,
          line: m.startLineNumber,
          column: m.startColumn,
          severity: m.severity >= 8 ? 'error' : 'warning',
          message: m.message,
          source: m.source,
        })));
      } catch { /* Monaco not available */ }
    };

    const disposable = model.onDidChangeDecorations(checkMarkers);
    checkMarkers();
    return () => disposable.dispose();
  }, [editorInstance, activeTab]);

  // Terminal output tracking via custom events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) {
        setTerminalOutput(prev => [...prev.slice(-MAX_TERMINAL_LINES + 1), detail]);
      }
    };
    window.addEventListener('titan:terminal:output', handler);
    return () => window.removeEventListener('titan:terminal:output', handler);
  }, []);

  const osPlatform = typeof navigator !== 'undefined'
    ? (navigator.platform?.toLowerCase().includes('win') ? 'windows'
      : navigator.platform?.toLowerCase().includes('mac') ? 'macos'
      : 'linux')
    : 'unknown';

  return {
    cursorPosition,
    recentlyEditedFiles,
    recentlyViewedFiles,
    linterDiagnostics,
    terminalOutput,
    isDesktop: isElectron,
    osPlatform,
  };
}
