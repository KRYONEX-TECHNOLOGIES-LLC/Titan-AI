'use client';

/**
 * Titan AI Command Registry
 * Central source of truth for every IDE command: ID, label, keybinding, category, when-clause, and executor.
 */

export interface Command {
  id: string;
  label: string;
  category: string;
  keybinding?: string;
  macKeybinding?: string;
  when?: string;
  execute: (...args: unknown[]) => void | Promise<void>;
  description?: string;
  icon?: string;
}

type CommandMap = Record<string, Command>;

// Global registry singleton
const registry: CommandMap = {};
let layoutStore: (() => import('@/stores/layout-store').LayoutState) | null = null;
let editorStore: (() => import('@/stores/editor-store').EditorState) | null = null;
let fileStore: (() => import('@/stores/file-store').FileState) | null = null;
let terminalStore: (() => import('@/stores/terminal-store').TerminalState) | null = null;
let debugStore: (() => import('@/stores/debug-store').DebugState) | null = null;

export function initCommandRegistry(stores: {
  layout: () => import('@/stores/layout-store').LayoutState;
  editor: () => import('@/stores/editor-store').EditorState;
  file: () => import('@/stores/file-store').FileState;
  terminal: () => import('@/stores/terminal-store').TerminalState;
  debug: () => import('@/stores/debug-store').DebugState;
}) {
  layoutStore = stores.layout;
  editorStore = stores.editor;
  fileStore = stores.file;
  terminalStore = stores.terminal;
  debugStore = stores.debug;
  buildRegistry();
}

function layout() { return layoutStore!(); }
function editor() { return editorStore!(); }
function file() { return fileStore!(); }
function terminal() { return terminalStore!(); }
function debug() { return debugStore!(); }

function reg(cmd: Command) {
  registry[cmd.id] = cmd;
}

function buildRegistry() {
  // ─── FILE ───────────────────────────────────────────────────────────────
  reg({ id: 'file.newFile', label: 'New File', category: 'File', keybinding: 'Ctrl+N',
    execute: () => {
      const name = `untitled-${Date.now()}.ts`;
      editor().openTab({ name, path: `/${name}`, icon: 'TS', color: '#3178c6', modified: true, language: 'typescript' });
      editor().updateFileContent(name, '');
    }
  });

  reg({ id: 'file.newWindow', label: 'New Window', category: 'File', keybinding: 'Ctrl+Shift+N',
    execute: () => window.open(window.location.href, '_blank')
  });

  reg({ id: 'file.open', label: 'Open File...', category: 'File', keybinding: 'Ctrl+O',
    execute: async () => {
      const input = Object.assign(document.createElement('input'), { type: 'file', multiple: true, accept: '*' });
      input.onchange = async () => {
        const files = Array.from(input.files ?? []);
        for (const f of files) {
          const content = await f.text();
          const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
          const langMap: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', py: 'python', rs: 'rust', go: 'go', json: 'json', md: 'markdown', css: 'css', html: 'html' };
          editor().openTab({ name: f.name, path: `/${f.name}`, icon: (ext.slice(0, 3)).toUpperCase() || 'TXT', color: '#888', modified: false, language: langMap[ext] ?? 'plaintext' });
          editor().updateFileContent(f.name, content);
          editor().markTabModified(f.name, false);
          editor().addRecentFile(`/${f.name}`);
        }
      };
      input.click();
    }
  });

  reg({ id: 'file.openFolder', label: 'Open Folder...', category: 'File', keybinding: 'Ctrl+K Ctrl+O',
    execute: async () => {
      try {
        const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
        const walkDir = async (handle: FileSystemDirectoryHandle, path: string): Promise<import('@/stores/file-store').FileNode[]> => {
          const nodes: import('@/stores/file-store').FileNode[] = [];
          for await (const [name, entry] of handle.entries()) {
            if (name.startsWith('.') || name === 'node_modules') continue;
            const entryPath = `${path}/${name}`;
            if (entry.kind === 'directory') {
              const children = await walkDir(entry as FileSystemDirectoryHandle, entryPath);
              nodes.push({ name, path: entryPath, type: 'folder', children });
            } else {
              nodes.push({ name, path: entryPath, type: 'file' });
            }
          }
          return nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
        };
        const tree = await walkDir(dirHandle, `/${dirHandle.name}`);
        file().openFolder(`/${dirHandle.name}`, dirHandle.name, tree);
        layout().setSidebarView('explorer');
        layout().setSidebarVisible(true);
      } catch {
        // user cancelled
      }
    }
  });

  reg({ id: 'file.closeFolder', label: 'Close Folder', category: 'File',
    when: 'workspaceOpen',
    execute: () => {
      file().closeFolder();
    }
  });

  reg({ id: 'file.save', label: 'Save', category: 'File', keybinding: 'Ctrl+S',
    execute: async () => {
      const { activeTab, fileContents } = editor();
      if (!activeTab) return;
      const content = fileContents[activeTab] ?? '';
      try {
        await fetch('/api/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ op: 'writeFile', path: `/${activeTab}`, content }),
        });
      } catch { /* ignore network errors, mark saved anyway */ }
      editor().saveTab(activeTab);
    }
  });

  reg({ id: 'file.saveAs', label: 'Save As...', category: 'File', keybinding: 'Ctrl+Shift+S',
    execute: async () => {
      const { activeTab, fileContents } = editor();
      if (!activeTab) return;
      const content = fileContents[activeTab] ?? '';
      try {
        const fh = await (window as unknown as { showSaveFilePicker: (o?: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker({ suggestedName: activeTab });
        const w = await fh.createWritable();
        await w.write(content);
        await w.close();
      } catch { /* cancelled */ }
    }
  });

  reg({ id: 'file.saveAll', label: 'Save All', category: 'File', keybinding: 'Ctrl+K S',
    execute: async () => {
      const { tabs, fileContents } = editor();
      const dirtyTabs = tabs.filter((t) => t.modified);
      for (const t of dirtyTabs) {
        await fetch('/api/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ op: 'writeFile', path: t.path, content: fileContents[t.name] ?? '' }),
        }).catch(() => {});
      }
      editor().saveAllTabs();
    }
  });

  reg({ id: 'file.revertFile', label: 'Revert File', category: 'File',
    execute: async () => {
      const { activeTab } = editor();
      if (!activeTab) return;
      const res = await fetch(`/api/workspace?path=/${activeTab}`).catch(() => null);
      if (res?.ok) {
        const { content } = await res.json();
        editor().updateFileContent(activeTab, content);
        editor().markTabModified(activeTab, false);
      }
    }
  });

  reg({ id: 'file.autoSave', label: 'Auto Save', category: 'File',
    execute: () => { /* toggled by setting */ }
  });

  reg({ id: 'editor.closeEditor', label: 'Close Editor', category: 'File', keybinding: 'Ctrl+W',
    execute: () => editor().closeTab(editor().activeTab)
  });

  reg({ id: 'editor.closeAllEditors', label: 'Close All Editors', category: 'File', keybinding: 'Ctrl+K Ctrl+W',
    execute: () => editor().closeAllTabs()
  });

  reg({ id: 'editor.reopenClosedEditor', label: 'Reopen Closed Editor', category: 'File', keybinding: 'Ctrl+Shift+T',
    execute: () => { /* re-open from recentFiles */ }
  });

  // ─── EDIT ────────────────────────────────────────────────────────────────
  reg({ id: 'edit.undo', label: 'Undo', category: 'Edit', keybinding: 'Ctrl+Z',
    execute: () => editor().editorRef?.trigger('keyboard', 'undo', {})
  });

  reg({ id: 'edit.redo', label: 'Redo', category: 'Edit', keybinding: 'Ctrl+Y',
    execute: () => editor().editorRef?.trigger('keyboard', 'redo', {})
  });

  reg({ id: 'edit.cut', label: 'Cut', category: 'Edit', keybinding: 'Ctrl+X',
    execute: () => document.execCommand('cut')
  });

  reg({ id: 'edit.copy', label: 'Copy', category: 'Edit', keybinding: 'Ctrl+C',
    execute: () => document.execCommand('copy')
  });

  reg({ id: 'edit.paste', label: 'Paste', category: 'Edit', keybinding: 'Ctrl+V',
    execute: () => document.execCommand('paste')
  });

  reg({ id: 'edit.selectAll', label: 'Select All', category: 'Edit', keybinding: 'Ctrl+A',
    execute: () => editor().editorRef?.trigger('keyboard', 'selectAll', {})
  });

  reg({ id: 'edit.find', label: 'Find', category: 'Edit', keybinding: 'Ctrl+F',
    execute: () => editor().editorRef?.trigger('keyboard', 'actions.find', {})
  });

  reg({ id: 'edit.replace', label: 'Replace', category: 'Edit', keybinding: 'Ctrl+H',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.startFindReplaceAction', {})
  });

  reg({ id: 'edit.findInFiles', label: 'Find in Files', category: 'Edit', keybinding: 'Ctrl+Shift+F',
    execute: () => layout().toggleSidebarView('search')
  });

  reg({ id: 'edit.formatDocument', label: 'Format Document', category: 'Edit', keybinding: 'Shift+Alt+F',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.formatDocument', {})
  });

  reg({ id: 'edit.formatSelection', label: 'Format Selection', category: 'Edit', keybinding: 'Ctrl+K Ctrl+F',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.formatSelection', {})
  });

  reg({ id: 'edit.commentLine', label: 'Toggle Line Comment', category: 'Edit', keybinding: 'Ctrl+/',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.commentLine', {})
  });

  reg({ id: 'edit.commentBlock', label: 'Toggle Block Comment', category: 'Edit', keybinding: 'Shift+Alt+A',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.blockComment', {})
  });

  reg({ id: 'edit.indentLine', label: 'Indent Line', category: 'Edit', keybinding: 'Ctrl+]',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.indentLines', {})
  });

  reg({ id: 'edit.outdentLine', label: 'Outdent Line', category: 'Edit', keybinding: 'Ctrl+[',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.outdentLines', {})
  });

  reg({ id: 'edit.duplicateLine', label: 'Duplicate Line Down', category: 'Edit', keybinding: 'Shift+Alt+Down',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.copyLinesDownAction', {})
  });

  reg({ id: 'edit.moveLineUp', label: 'Move Line Up', category: 'Edit', keybinding: 'Alt+Up',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.moveLinesUpAction', {})
  });

  reg({ id: 'edit.moveLineDown', label: 'Move Line Down', category: 'Edit', keybinding: 'Alt+Down',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.moveLinesDownAction', {})
  });

  reg({ id: 'edit.deleteLines', label: 'Delete Lines', category: 'Edit', keybinding: 'Ctrl+Shift+K',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.deleteLines', {})
  });

  reg({ id: 'edit.insertCursorAbove', label: 'Add Cursor Above', category: 'Edit', keybinding: 'Ctrl+Alt+Up',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.insertCursorAbove', {})
  });

  reg({ id: 'edit.insertCursorBelow', label: 'Add Cursor Below', category: 'Edit', keybinding: 'Ctrl+Alt+Down',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.insertCursorBelow', {})
  });

  reg({ id: 'edit.selectNextOccurrence', label: 'Select Next Occurrence', category: 'Edit', keybinding: 'Ctrl+D',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.addSelectionToNextFindMatch', {})
  });

  reg({ id: 'edit.selectAllOccurrences', label: 'Select All Occurrences', category: 'Edit', keybinding: 'Ctrl+Shift+L',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.selectHighlights', {})
  });

  reg({ id: 'edit.rename', label: 'Rename Symbol', category: 'Edit', keybinding: 'F2',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.rename', {})
  });

  reg({ id: 'edit.quickFix', label: 'Quick Fix', category: 'Edit', keybinding: 'Ctrl+.',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.quickFix', {})
  });

  reg({ id: 'edit.organizeImports', label: 'Organize Imports', category: 'Edit', keybinding: 'Shift+Alt+O',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.organizeImports', {})
  });

  // ─── SELECTION ────────────────────────────────────────────────────────────
  reg({ id: 'selection.selectLine', label: 'Select Line', category: 'Selection', keybinding: 'Ctrl+L',
    execute: () => editor().editorRef?.trigger('keyboard', 'expandLineSelection', {})
  });

  reg({ id: 'selection.expandSelection', label: 'Expand Selection', category: 'Selection', keybinding: 'Shift+Alt+Right',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.smartSelect.expand', {})
  });

  reg({ id: 'selection.shrinkSelection', label: 'Shrink Selection', category: 'Selection', keybinding: 'Shift+Alt+Left',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.smartSelect.shrink', {})
  });

  reg({ id: 'selection.selectAll', label: 'Select All', category: 'Selection', keybinding: 'Ctrl+A',
    execute: () => editor().editorRef?.trigger('keyboard', 'selectAll', {})
  });

  reg({ id: 'selection.columnSelectionMode', label: 'Column Selection Mode', category: 'Selection', keybinding: 'Ctrl+Shift+Alt+Down',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.insertCursorAtEndOfEachLineSelected', {})
  });

  reg({ id: 'selection.switchToUppercase', label: 'Transform to Uppercase', category: 'Selection',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.transformToUppercase', {})
  });

  reg({ id: 'selection.switchToLowercase', label: 'Transform to Lowercase', category: 'Selection',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.transformToLowercase', {})
  });

  reg({ id: 'selection.toTitleCase', label: 'Transform to Title Case', category: 'Selection',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.transformToTitlecase', {})
  });

  // ─── VIEW ────────────────────────────────────────────────────────────────
  reg({ id: 'view.toggleSidebar', label: 'Toggle Primary Side Bar', category: 'View', keybinding: 'Ctrl+B',
    execute: () => layout().toggleSidebar()
  });

  reg({ id: 'view.toggleRightPanel', label: 'Toggle AI Chat Panel', category: 'View', keybinding: 'Ctrl+Alt+B',
    execute: () => layout().toggleRightPanel()
  });

  reg({ id: 'view.togglePanel', label: 'Toggle Panel', category: 'View', keybinding: 'Ctrl+`',
    execute: () => layout().togglePanel()
  });

  reg({ id: 'view.toggleZenMode', label: 'Toggle Zen Mode', category: 'View', keybinding: 'Ctrl+K Z',
    execute: () => layout().toggleZenMode()
  });

  reg({ id: 'view.toggleCenteredLayout', label: 'Toggle Centered Layout', category: 'View',
    execute: () => layout().toggleCenteredLayout()
  });

  reg({ id: 'view.explorer', label: 'Show Explorer', category: 'View', keybinding: 'Ctrl+Shift+E',
    execute: () => layout().toggleSidebarView('explorer')
  });

  reg({ id: 'view.search', label: 'Show Search', category: 'View', keybinding: 'Ctrl+Shift+F',
    execute: () => layout().toggleSidebarView('search')
  });

  reg({ id: 'view.git', label: 'Show Source Control', category: 'View', keybinding: 'Ctrl+Shift+G',
    execute: () => layout().toggleSidebarView('git')
  });

  reg({ id: 'view.debug', label: 'Show Run & Debug', category: 'View', keybinding: 'Ctrl+Shift+D',
    execute: () => layout().toggleSidebarView('debug')
  });

  reg({ id: 'view.extensions', label: 'Show Extensions', category: 'View', keybinding: 'Ctrl+Shift+X',
    execute: () => layout().toggleSidebarView('extensions')
  });

  reg({ id: 'view.titanAgent', label: 'Show Titan Agent', category: 'View', keybinding: 'Ctrl+Shift+A',
    execute: () => layout().toggleSidebarView('titan-agent')
  });

  reg({ id: 'view.toggleMinimap', label: 'Toggle Minimap', category: 'View',
    execute: () => layout().toggleMinimap()
  });

  reg({ id: 'view.toggleBreadcrumbs', label: 'Toggle Breadcrumbs', category: 'View',
    execute: () => layout().toggleBreadcrumbs()
  });

  reg({ id: 'view.toggleStickyScroll', label: 'Toggle Sticky Scroll', category: 'View',
    execute: () => layout().toggleStickyScroll()
  });

  reg({ id: 'view.toggleWordWrap', label: 'Toggle Word Wrap', category: 'View', keybinding: 'Alt+Z',
    execute: () => layout().toggleWordWrap()
  });

  reg({ id: 'view.zoomIn', label: 'Zoom In', category: 'View', keybinding: 'Ctrl+=',
    execute: () => editor().setFontSize(Math.min(editor().fontSize + 1, 32))
  });

  reg({ id: 'view.zoomOut', label: 'Zoom Out', category: 'View', keybinding: 'Ctrl+-',
    execute: () => editor().setFontSize(Math.max(editor().fontSize - 1, 8))
  });

  reg({ id: 'view.resetZoom', label: 'Reset Zoom', category: 'View', keybinding: 'Ctrl+0',
    execute: () => editor().setFontSize(13)
  });

  reg({ id: 'view.splitEditorRight', label: 'Split Editor Right', category: 'View', keybinding: 'Ctrl+\\',
    execute: () => { /* split editor logic */ }
  });

  reg({ id: 'view.showTerminal', label: 'Show Terminal', category: 'View', keybinding: 'Ctrl+`',
    execute: () => { layout().setPanelView('terminal'); layout().setPanelVisible(true); }
  });

  reg({ id: 'view.showOutput', label: 'Show Output', category: 'View',
    execute: () => { layout().setPanelView('output'); layout().setPanelVisible(true); }
  });

  reg({ id: 'view.showProblems', label: 'Show Problems', category: 'View', keybinding: 'Ctrl+Shift+M',
    execute: () => { layout().setPanelView('problems'); layout().setPanelVisible(true); }
  });

  reg({ id: 'view.presetDefault', label: 'Layout: Default', category: 'View',
    execute: () => layout().applyPreset('default')
  });

  reg({ id: 'view.presetZen', label: 'Layout: Zen Mode', category: 'View',
    execute: () => layout().applyPreset('zen')
  });

  reg({ id: 'view.presetDebug', label: 'Layout: Debug', category: 'View',
    execute: () => layout().applyPreset('debug')
  });

  reg({ id: 'view.presetFullEditor', label: 'Layout: Full Editor', category: 'View',
    execute: () => layout().applyPreset('full-editor')
  });

  // ─── GO ─────────────────────────────────────────────────────────────────
  reg({ id: 'go.toFile', label: 'Go to File...', category: 'Go', keybinding: 'Ctrl+P',
    execute: () => {
      window.dispatchEvent(new CustomEvent('titan:commandPalette:open', { detail: { mode: 'file' } }));
    }
  });

  reg({ id: 'go.toSymbol', label: 'Go to Symbol in Workspace...', category: 'Go', keybinding: 'Ctrl+T',
    execute: () => {
      window.dispatchEvent(new CustomEvent('titan:commandPalette:open', { detail: { mode: 'symbol' } }));
    }
  });

  reg({ id: 'go.toSymbolInFile', label: 'Go to Symbol in File...', category: 'Go', keybinding: 'Ctrl+Shift+O',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.quickOutline', {})
  });

  reg({ id: 'go.toLine', label: 'Go to Line...', category: 'Go', keybinding: 'Ctrl+G',
    execute: () => {
      window.dispatchEvent(new CustomEvent('titan:commandPalette:open', { detail: { mode: 'line' } }));
    }
  });

  reg({ id: 'go.toDefinition', label: 'Go to Definition', category: 'Go', keybinding: 'F12',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.revealDefinition', {})
  });

  reg({ id: 'go.toTypeDefinition', label: 'Go to Type Definition', category: 'Go',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.goToTypeDefinition', {})
  });

  reg({ id: 'go.toImplementation', label: 'Go to Implementation', category: 'Go', keybinding: 'Ctrl+F12',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.goToImplementation', {})
  });

  reg({ id: 'go.toReferences', label: 'Go to References', category: 'Go', keybinding: 'Shift+F12',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.goToReferences', {})
  });

  reg({ id: 'go.back', label: 'Go Back', category: 'Go', keybinding: 'Alt+Left',
    execute: () => editor().editorRef?.trigger('keyboard', 'workbench.action.navigateBack', {})
  });

  reg({ id: 'go.forward', label: 'Go Forward', category: 'Go', keybinding: 'Alt+Right',
    execute: () => editor().editorRef?.trigger('keyboard', 'workbench.action.navigateForward', {})
  });

  reg({ id: 'go.lastEditLocation', label: 'Go to Last Edit Location', category: 'Go', keybinding: 'Ctrl+K Ctrl+Q',
    execute: () => editor().editorRef?.trigger('keyboard', 'workbench.action.navigateToLastEditLocation', {})
  });

  reg({ id: 'go.bracketMatch', label: 'Go to Bracket Match', category: 'Go', keybinding: 'Ctrl+Shift+\\',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.jumpToBracket', {})
  });

  reg({ id: 'go.nextError', label: 'Go to Next Problem', category: 'Go', keybinding: 'F8',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.marker.nextInFiles', {})
  });

  reg({ id: 'go.prevError', label: 'Go to Previous Problem', category: 'Go', keybinding: 'Shift+F8',
    execute: () => editor().editorRef?.trigger('keyboard', 'editor.action.marker.prevInFiles', {})
  });

  // ─── RUN ─────────────────────────────────────────────────────────────────
  reg({ id: 'debug.start', label: 'Start Debugging', category: 'Run', keybinding: 'F5',
    execute: () => debug().startSession()
  });

  reg({ id: 'debug.startWithoutDebugging', label: 'Start Without Debugging', category: 'Run', keybinding: 'Ctrl+F5',
    execute: () => { layout().setPanelView('terminal'); layout().setPanelVisible(true); terminal().addSession('bash'); }
  });

  reg({ id: 'debug.stop', label: 'Stop Debugging', category: 'Run', keybinding: 'Shift+F5',
    execute: () => debug().stopSession()
  });

  reg({ id: 'debug.restart', label: 'Restart Debugging', category: 'Run', keybinding: 'Ctrl+Shift+F5',
    execute: () => debug().restart()
  });

  reg({ id: 'debug.pause', label: 'Pause', category: 'Run', keybinding: 'F6',
    execute: () => debug().pauseSession()
  });

  reg({ id: 'debug.continue', label: 'Continue', category: 'Run', keybinding: 'F5',
    when: 'debugPaused',
    execute: () => debug().continueSession()
  });

  reg({ id: 'debug.stepOver', label: 'Step Over', category: 'Run', keybinding: 'F10',
    execute: () => debug().stepOver()
  });

  reg({ id: 'debug.stepInto', label: 'Step Into', category: 'Run', keybinding: 'F11',
    execute: () => debug().stepInto()
  });

  reg({ id: 'debug.stepOut', label: 'Step Out', category: 'Run', keybinding: 'Shift+F11',
    execute: () => debug().stepOut()
  });

  reg({ id: 'debug.toggleBreakpoint', label: 'Toggle Breakpoint', category: 'Run', keybinding: 'F9',
    execute: () => {
      const { editorRef, activeTab, cursorPosition } = editor();
      if (editorRef && activeTab) {
        editor().toggleBreakpoint(activeTab, cursorPosition.line);
      }
    }
  });

  reg({ id: 'debug.enableAllBreakpoints', label: 'Enable All Breakpoints', category: 'Run',
    execute: () => editor().enableAllBreakpoints()
  });

  reg({ id: 'debug.disableAllBreakpoints', label: 'Disable All Breakpoints', category: 'Run',
    execute: () => editor().disableAllBreakpoints()
  });

  reg({ id: 'debug.removeAllBreakpoints', label: 'Remove All Breakpoints', category: 'Run',
    execute: () => editor().removeAllBreakpoints()
  });

  reg({ id: 'debug.openPanel', label: 'Show Run & Debug Panel', category: 'Run', keybinding: 'Ctrl+Shift+D',
    execute: () => layout().toggleSidebarView('debug')
  });

  // ─── TERMINAL ────────────────────────────────────────────────────────────
  reg({ id: 'terminal.new', label: 'New Terminal', category: 'Terminal', keybinding: 'Ctrl+Shift+`',
    execute: () => {
      layout().setPanelView('terminal');
      layout().setPanelVisible(true);
      terminal().addSession();
    }
  });

  reg({ id: 'terminal.splitTerminal', label: 'Split Terminal', category: 'Terminal',
    execute: () => { terminal().addSession(); }
  });

  reg({ id: 'terminal.killTerminal', label: 'Kill Terminal', category: 'Terminal',
    execute: () => terminal().removeSession(terminal().activeSessionId)
  });

  reg({ id: 'terminal.killAllTerminals', label: 'Kill All Terminals', category: 'Terminal',
    execute: () => terminal().clearAllSessions()
  });

  reg({ id: 'terminal.runSelection', label: 'Run Selected Text in Terminal', category: 'Terminal',
    execute: () => {
      const sel = editor().editorRef?.getModel()?.getValueInRange(editor().editorRef!.getSelection()!);
      if (sel) window.dispatchEvent(new CustomEvent('titan:terminal:runText', { detail: sel }));
    }
  });

  reg({ id: 'terminal.focusTerminal', label: 'Focus Terminal', category: 'Terminal', keybinding: 'Ctrl+`',
    execute: () => { layout().setPanelView('terminal'); layout().setPanelVisible(true); }
  });

  reg({ id: 'terminal.scrollUp', label: 'Scroll Terminal Up', category: 'Terminal', keybinding: 'Ctrl+Shift+Up',
    execute: () => window.dispatchEvent(new CustomEvent('titan:terminal:scroll', { detail: 'up' }))
  });

  reg({ id: 'terminal.scrollDown', label: 'Scroll Terminal Down', category: 'Terminal', keybinding: 'Ctrl+Shift+Down',
    execute: () => window.dispatchEvent(new CustomEvent('titan:terminal:scroll', { detail: 'down' }))
  });

  reg({ id: 'terminal.clearTerminal', label: 'Clear Terminal', category: 'Terminal', keybinding: 'Ctrl+K',
    execute: () => window.dispatchEvent(new CustomEvent('titan:terminal:clear'))
  });

  // ─── HELP ────────────────────────────────────────────────────────────────
  reg({ id: 'help.welcome', label: 'Welcome', category: 'Help',
    execute: () => window.dispatchEvent(new CustomEvent('titan:welcome:open'))
  });

  reg({ id: 'help.docs', label: 'Documentation', category: 'Help',
    execute: () => window.open('https://docs.titanai.dev', '_blank')
  });

  reg({ id: 'help.keybindings', label: 'Keyboard Shortcuts Reference', category: 'Help', keybinding: 'Ctrl+K Ctrl+S',
    execute: () => window.dispatchEvent(new CustomEvent('titan:keybindings:open'))
  });

  reg({ id: 'help.checkForUpdates', label: 'Check for Updates', category: 'Help',
    execute: () => window.dispatchEvent(new CustomEvent('titan:updates:check'))
  });

  reg({ id: 'help.reportIssue', label: 'Report Issue', category: 'Help',
    execute: () => window.open('https://github.com/titanai/issues/new', '_blank')
  });

  reg({ id: 'help.toggleDevTools', label: 'Toggle Developer Tools', category: 'Help', keybinding: 'Ctrl+Shift+I',
    execute: () => { /* electron IPC or browser devtools */ }
  });

  // ─── WORKBENCH ────────────────────────────────────────────────────────────
  reg({ id: 'workbench.commandPalette', label: 'Show Command Palette', category: 'View', keybinding: 'Ctrl+Shift+P',
    execute: () => window.dispatchEvent(new CustomEvent('titan:commandPalette:open', { detail: { mode: 'command' } }))
  });

  reg({ id: 'workbench.quickOpen', label: 'Quick Open', category: 'Go', keybinding: 'Ctrl+P',
    execute: () => window.dispatchEvent(new CustomEvent('titan:commandPalette:open', { detail: { mode: 'file' } }))
  });

  reg({ id: 'workbench.nextTab', label: 'Next Editor Tab', category: 'View', keybinding: 'Ctrl+Tab',
    execute: () => {
      const { tabs, activeTab } = editor();
      const idx = tabs.findIndex((t) => t.name === activeTab);
      const next = tabs[(idx + 1) % tabs.length];
      if (next) editor().setActiveTab(next.name);
    }
  });

  reg({ id: 'workbench.prevTab', label: 'Previous Editor Tab', category: 'View', keybinding: 'Ctrl+Shift+Tab',
    execute: () => {
      const { tabs, activeTab } = editor();
      const idx = tabs.findIndex((t) => t.name === activeTab);
      const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
      if (prev) editor().setActiveTab(prev.name);
    }
  });

  reg({ id: 'workbench.settings', label: 'Open Settings', category: 'File', keybinding: 'Ctrl+,',
    execute: () => layout().toggleSidebarView('settings')
  });
}

export function executeCommand(id: string, ...args: unknown[]): void {
  const cmd = registry[id];
  if (!cmd) {
    console.warn(`[CommandRegistry] Unknown command: ${id}`);
    return;
  }
  Promise.resolve(cmd.execute(...args)).catch(console.error);
}

export function getCommand(id: string): Command | undefined {
  return registry[id];
}

export function getAllCommands(): Command[] {
  return Object.values(registry);
}

export function getCommandsByCategory(category: string): Command[] {
  return Object.values(registry).filter((c) => c.category === category);
}

export function searchCommands(query: string): Command[] {
  if (!query) return getAllCommands();
  const q = query.toLowerCase();
  return getAllCommands()
    .filter((c) =>
      c.label.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    )
    .sort((a, b) => {
      const aStart = a.label.toLowerCase().startsWith(q) ? 0 : 1;
      const bStart = b.label.toLowerCase().startsWith(q) ? 0 : 1;
      return aStart - bStart || a.label.localeCompare(b.label);
    });
}
