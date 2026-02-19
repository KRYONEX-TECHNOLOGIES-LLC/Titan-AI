'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { executeCommand } from '@/lib/ide/command-registry';
import { useLayoutStore } from '@/stores/layout-store';
import { useEditorStore } from '@/stores/editor-store';
import { useDebugStore } from '@/stores/debug-store';

// ─── Types ────────────────────────────────────────────────────────────────────
interface MenuItem {
  type?: 'separator';
  label?: string;
  commandId?: string;
  keybinding?: string;
  submenu?: MenuItem[];
  checked?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}

interface MenuDef {
  label: string;
  items: MenuItem[];
}

// ─── MenuDropdown ─────────────────────────────────────────────────────────────
function MenuDropdown({
  items,
  onClose,
}: {
  items: MenuItem[];
  onClose: () => void;
}) {
  const handleClick = useCallback(
    (item: MenuItem) => {
      if (!item.commandId || item.disabled) return;
      onClose();
      executeCommand(item.commandId);
    },
    [onClose]
  );

  return (
    <div
      className="menu-dropdown"
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        zIndex: 1000,
        minWidth: 240,
        background: '#1e1e2e',
        border: '1px solid #313244',
        borderRadius: 6,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        padding: '4px 0',
        userSelect: 'none',
      }}
    >
      {items.map((item, idx) => {
        if (item.type === 'separator') {
          return (
            <div
              key={idx}
              style={{ height: 1, background: '#313244', margin: '4px 0' }}
            />
          );
        }
        return (
          <button
            key={idx}
            onClick={() => handleClick(item)}
            disabled={item.disabled}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '5px 16px',
              background: 'transparent',
              border: 'none',
              cursor: item.disabled ? 'default' : 'pointer',
              color: item.disabled
                ? '#6c7086'
                : item.destructive
                ? '#f38ba8'
                : '#cdd6f4',
              fontSize: 13,
              textAlign: 'left',
              gap: 24,
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) (e.currentTarget as HTMLButtonElement).style.background = '#313244';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {item.checked !== undefined && (
                <span style={{ width: 14, textAlign: 'center', color: '#89b4fa' }}>
                  {item.checked ? '✓' : ''}
                </span>
              )}
              {item.label}
            </span>
            {item.keybinding && (
              <span style={{ color: '#6c7086', fontSize: 11, whiteSpace: 'nowrap' }}>
                {item.keybinding}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── MenuBar ──────────────────────────────────────────────────────────────────
export default function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const layout = useLayoutStore();
  const editorState = useEditorStore();
  const debugState = useDebugStore();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const menus: MenuDef[] = [
    // ── FILE ───────────────────────────────────────────────────────────────
    {
      label: 'File',
      items: [
        { label: 'New File', commandId: 'file.newFile', keybinding: 'Ctrl+N' },
        { label: 'New Window', commandId: 'file.newWindow', keybinding: 'Ctrl+Shift+N' },
        { type: 'separator' },
        { label: 'Open File...', commandId: 'file.open', keybinding: 'Ctrl+O' },
        { label: 'Open Folder...', commandId: 'file.openFolder', keybinding: 'Ctrl+K Ctrl+O' },
        { label: 'Close Folder', commandId: 'file.closeFolder', disabled: !layout.workspaceOpen, destructive: false },
        { type: 'separator' },
        { label: 'Save', commandId: 'file.save', keybinding: 'Ctrl+S' },
        { label: 'Save As...', commandId: 'file.saveAs', keybinding: 'Ctrl+Shift+S' },
        { label: 'Save All', commandId: 'file.saveAll', keybinding: 'Ctrl+K S' },
        { label: 'Revert File', commandId: 'file.revertFile', disabled: !editorState.activeTab },
        { type: 'separator' },
        { label: 'Auto Save', commandId: 'file.autoSave' },
        { type: 'separator' },
        { label: 'Close Editor', commandId: 'editor.closeEditor', keybinding: 'Ctrl+W' },
        { label: 'Close All Editors', commandId: 'editor.closeAllEditors', keybinding: 'Ctrl+K Ctrl+W' },
        { label: 'Reopen Closed Editor', commandId: 'editor.reopenClosedEditor', keybinding: 'Ctrl+Shift+T' },
        { type: 'separator' },
        { label: 'Preferences', commandId: 'workbench.settings' },
      ],
    },

    // ── EDIT ───────────────────────────────────────────────────────────────
    {
      label: 'Edit',
      items: [
        { label: 'Undo', commandId: 'edit.undo', keybinding: 'Ctrl+Z' },
        { label: 'Redo', commandId: 'edit.redo', keybinding: 'Ctrl+Y' },
        { type: 'separator' },
        { label: 'Cut', commandId: 'edit.cut', keybinding: 'Ctrl+X' },
        { label: 'Copy', commandId: 'edit.copy', keybinding: 'Ctrl+C' },
        { label: 'Paste', commandId: 'edit.paste', keybinding: 'Ctrl+V' },
        { type: 'separator' },
        { label: 'Find', commandId: 'edit.find', keybinding: 'Ctrl+F' },
        { label: 'Replace', commandId: 'edit.replace', keybinding: 'Ctrl+H' },
        { label: 'Find in Files', commandId: 'edit.findInFiles', keybinding: 'Ctrl+Shift+F' },
        { type: 'separator' },
        { label: 'Format Document', commandId: 'edit.formatDocument', keybinding: 'Shift+Alt+F' },
        { label: 'Format Selection', commandId: 'edit.formatSelection', keybinding: 'Ctrl+K Ctrl+F' },
        { label: 'Organize Imports', commandId: 'edit.organizeImports', keybinding: 'Shift+Alt+O' },
        { type: 'separator' },
        { label: 'Toggle Line Comment', commandId: 'edit.commentLine', keybinding: 'Ctrl+/' },
        { label: 'Toggle Block Comment', commandId: 'edit.commentBlock', keybinding: 'Shift+Alt+A' },
        { type: 'separator' },
        { label: 'Rename Symbol', commandId: 'edit.rename', keybinding: 'F2' },
        { label: 'Quick Fix', commandId: 'edit.quickFix', keybinding: 'Ctrl+.' },
        { type: 'separator' },
        { label: 'Move Line Up', commandId: 'edit.moveLineUp', keybinding: 'Alt+Up' },
        { label: 'Move Line Down', commandId: 'edit.moveLineDown', keybinding: 'Alt+Down' },
        { label: 'Duplicate Line Down', commandId: 'edit.duplicateLine', keybinding: 'Shift+Alt+Down' },
        { label: 'Delete Lines', commandId: 'edit.deleteLines', keybinding: 'Ctrl+Shift+K' },
        { type: 'separator' },
        { label: 'Select All', commandId: 'edit.selectAll', keybinding: 'Ctrl+A' },
        { label: 'Select Next Occurrence', commandId: 'edit.selectNextOccurrence', keybinding: 'Ctrl+D' },
        { label: 'Select All Occurrences', commandId: 'edit.selectAllOccurrences', keybinding: 'Ctrl+Shift+L' },
      ],
    },

    // ── SELECTION ──────────────────────────────────────────────────────────
    {
      label: 'Selection',
      items: [
        { label: 'Select Line', commandId: 'selection.selectLine', keybinding: 'Ctrl+L' },
        { label: 'Expand Selection', commandId: 'selection.expandSelection', keybinding: 'Shift+Alt+Right' },
        { label: 'Shrink Selection', commandId: 'selection.shrinkSelection', keybinding: 'Shift+Alt+Left' },
        { type: 'separator' },
        { label: 'Add Cursor Above', commandId: 'edit.insertCursorAbove', keybinding: 'Ctrl+Alt+Up' },
        { label: 'Add Cursor Below', commandId: 'edit.insertCursorBelow', keybinding: 'Ctrl+Alt+Down' },
        { label: 'Column Selection Mode', commandId: 'selection.columnSelectionMode' },
        { type: 'separator' },
        { label: 'Transform to Uppercase', commandId: 'selection.switchToUppercase' },
        { label: 'Transform to Lowercase', commandId: 'selection.switchToLowercase' },
        { label: 'Transform to Title Case', commandId: 'selection.toTitleCase' },
      ],
    },

    // ── VIEW ───────────────────────────────────────────────────────────────
    {
      label: 'View',
      items: [
        { label: 'Command Palette...', commandId: 'workbench.commandPalette', keybinding: 'Ctrl+Shift+P' },
        { type: 'separator' },
        { label: 'Explorer', commandId: 'view.explorer', keybinding: 'Ctrl+Shift+E', checked: layout.sidebarVisible && layout.sidebarView === 'explorer' },
        { label: 'Search', commandId: 'view.search', keybinding: 'Ctrl+Shift+F', checked: layout.sidebarVisible && layout.sidebarView === 'search' },
        { label: 'Source Control', commandId: 'view.git', keybinding: 'Ctrl+Shift+G', checked: layout.sidebarVisible && layout.sidebarView === 'git' },
        { label: 'Run & Debug', commandId: 'view.debug', keybinding: 'Ctrl+Shift+D', checked: layout.sidebarVisible && layout.sidebarView === 'debug' },
        { label: 'Extensions', commandId: 'view.extensions', keybinding: 'Ctrl+Shift+X', checked: layout.sidebarVisible && layout.sidebarView === 'extensions' },
        { label: 'Titan Agent', commandId: 'view.titanAgent', keybinding: 'Ctrl+Shift+A', checked: layout.sidebarVisible && layout.sidebarView === 'titan-agent' },
        { type: 'separator' },
        { label: 'Toggle Primary Side Bar', commandId: 'view.toggleSidebar', keybinding: 'Ctrl+B', checked: layout.sidebarVisible },
        { label: 'Toggle AI Chat Panel', commandId: 'view.toggleRightPanel', checked: layout.rightPanelVisible },
        { label: 'Toggle Panel', commandId: 'view.togglePanel', keybinding: 'Ctrl+`', checked: layout.panelVisible },
        { type: 'separator' },
        { label: 'Minimap', commandId: 'view.toggleMinimap', checked: layout.minimapEnabled },
        { label: 'Breadcrumbs', commandId: 'view.toggleBreadcrumbs', checked: layout.breadcrumbsEnabled },
        { label: 'Sticky Scroll', commandId: 'view.toggleStickyScroll', checked: layout.stickyScrollEnabled },
        { label: 'Word Wrap', commandId: 'view.toggleWordWrap', keybinding: 'Alt+Z', checked: layout.wordWrapEnabled },
        { type: 'separator' },
        { label: 'Zoom In', commandId: 'view.zoomIn', keybinding: 'Ctrl+=' },
        { label: 'Zoom Out', commandId: 'view.zoomOut', keybinding: 'Ctrl+-' },
        { label: 'Reset Zoom', commandId: 'view.resetZoom', keybinding: 'Ctrl+0' },
        { type: 'separator' },
        { label: 'Layout: Default', commandId: 'view.presetDefault' },
        { label: 'Layout: Zen Mode', commandId: 'view.presetZen', keybinding: 'Ctrl+K Z' },
        { label: 'Layout: Debug', commandId: 'view.presetDebug' },
        { label: 'Layout: Full Editor', commandId: 'view.presetFullEditor' },
      ],
    },

    // ── GO ─────────────────────────────────────────────────────────────────
    {
      label: 'Go',
      items: [
        { label: 'Go to File...', commandId: 'go.toFile', keybinding: 'Ctrl+P' },
        { label: 'Go to Symbol in Workspace...', commandId: 'go.toSymbol', keybinding: 'Ctrl+T' },
        { label: 'Go to Symbol in File...', commandId: 'go.toSymbolInFile', keybinding: 'Ctrl+Shift+O' },
        { label: 'Go to Line...', commandId: 'go.toLine', keybinding: 'Ctrl+G' },
        { type: 'separator' },
        { label: 'Go to Definition', commandId: 'go.toDefinition', keybinding: 'F12' },
        { label: 'Go to Type Definition', commandId: 'go.toTypeDefinition' },
        { label: 'Go to Implementation', commandId: 'go.toImplementation', keybinding: 'Ctrl+F12' },
        { label: 'Go to References', commandId: 'go.toReferences', keybinding: 'Shift+F12' },
        { type: 'separator' },
        { label: 'Go Back', commandId: 'go.back', keybinding: 'Alt+Left' },
        { label: 'Go Forward', commandId: 'go.forward', keybinding: 'Alt+Right' },
        { label: 'Go to Last Edit Location', commandId: 'go.lastEditLocation', keybinding: 'Ctrl+K Ctrl+Q' },
        { type: 'separator' },
        { label: 'Go to Bracket', commandId: 'go.bracketMatch', keybinding: 'Ctrl+Shift+\\' },
        { label: 'Next Problem', commandId: 'go.nextError', keybinding: 'F8' },
        { label: 'Previous Problem', commandId: 'go.prevError', keybinding: 'Shift+F8' },
      ],
    },

    // ── RUN ────────────────────────────────────────────────────────────────
    {
      label: 'Run',
      items: [
        { label: 'Start Debugging', commandId: 'debug.start', keybinding: 'F5' },
        { label: 'Start Without Debugging', commandId: 'debug.startWithoutDebugging', keybinding: 'Ctrl+F5' },
        { label: 'Stop Debugging', commandId: 'debug.stop', keybinding: 'Shift+F5', disabled: debugState.status === 'idle' || debugState.status === 'terminated' },
        { label: 'Restart Debugging', commandId: 'debug.restart', keybinding: 'Ctrl+Shift+F5', disabled: debugState.status === 'idle' || debugState.status === 'terminated' },
        { type: 'separator' },
        { label: 'Pause', commandId: 'debug.pause', keybinding: 'F6', disabled: debugState.status !== 'running' },
        { label: 'Continue', commandId: 'debug.continue', keybinding: 'F5', disabled: debugState.status !== 'paused' },
        { label: 'Step Over', commandId: 'debug.stepOver', keybinding: 'F10', disabled: debugState.status !== 'paused' },
        { label: 'Step Into', commandId: 'debug.stepInto', keybinding: 'F11', disabled: debugState.status !== 'paused' },
        { label: 'Step Out', commandId: 'debug.stepOut', keybinding: 'Shift+F11', disabled: debugState.status !== 'paused' },
        { type: 'separator' },
        { label: 'Toggle Breakpoint', commandId: 'debug.toggleBreakpoint', keybinding: 'F9' },
        { label: 'Enable All Breakpoints', commandId: 'debug.enableAllBreakpoints' },
        { label: 'Disable All Breakpoints', commandId: 'debug.disableAllBreakpoints' },
        { label: 'Remove All Breakpoints', commandId: 'debug.removeAllBreakpoints', destructive: true },
        { type: 'separator' },
        { label: 'Run & Debug Panel', commandId: 'debug.openPanel', keybinding: 'Ctrl+Shift+D' },
      ],
    },

    // ── TERMINAL ───────────────────────────────────────────────────────────
    {
      label: 'Terminal',
      items: [
        { label: 'New Terminal', commandId: 'terminal.new', keybinding: 'Ctrl+Shift+`' },
        { label: 'Split Terminal', commandId: 'terminal.splitTerminal' },
        { label: 'Kill Terminal', commandId: 'terminal.killTerminal', destructive: true },
        { label: 'Kill All Terminals', commandId: 'terminal.killAllTerminals', destructive: true },
        { type: 'separator' },
        { label: 'Run Selected Text in Terminal', commandId: 'terminal.runSelection' },
        { type: 'separator' },
        { label: 'Focus Terminal', commandId: 'terminal.focusTerminal', keybinding: 'Ctrl+`' },
        { label: 'Scroll Terminal Up', commandId: 'terminal.scrollUp', keybinding: 'Ctrl+Shift+Up' },
        { label: 'Scroll Terminal Down', commandId: 'terminal.scrollDown', keybinding: 'Ctrl+Shift+Down' },
        { label: 'Clear Terminal', commandId: 'terminal.clearTerminal', keybinding: 'Ctrl+K' },
      ],
    },

    // ── HELP ───────────────────────────────────────────────────────────────
    {
      label: 'Help',
      items: [
        { label: 'Welcome', commandId: 'help.welcome' },
        { label: 'Documentation', commandId: 'help.docs' },
        { label: 'Keyboard Shortcuts', commandId: 'help.keybindings', keybinding: 'Ctrl+K Ctrl+S' },
        { type: 'separator' },
        { label: 'Report Issue', commandId: 'help.reportIssue' },
        { label: 'Check for Updates', commandId: 'help.checkForUpdates' },
        { type: 'separator' },
        { label: 'Toggle Developer Tools', commandId: 'help.toggleDevTools', keybinding: 'Ctrl+Shift+I' },
      ],
    },
  ];

  return (
    <div
      ref={barRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 30,
        background: '#181825',
        borderBottom: '1px solid #313244',
        userSelect: 'none',
        flexShrink: 0,
        padding: '0 4px',
      }}
    >
      {menus.map((menu) => (
        <div key={menu.label} style={{ position: 'relative' }}>
          <button
            onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
            onMouseEnter={() => openMenu && setOpenMenu(menu.label)}
            style={{
              padding: '4px 10px',
              background: openMenu === menu.label ? '#313244' : 'transparent',
              border: 'none',
              borderRadius: 4,
              color: openMenu === menu.label ? '#cdd6f4' : '#a6adc8',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'background 0.1s, color 0.1s',
              height: 26,
            }}
            onMouseOver={(e) => {
              if (openMenu !== menu.label) (e.currentTarget as HTMLButtonElement).style.background = '#313244';
            }}
            onMouseOut={(e) => {
              if (openMenu !== menu.label) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            {menu.label}
          </button>
          {openMenu === menu.label && (
            <MenuDropdown items={menu.items} onClose={() => setOpenMenu(null)} />
          )}
        </div>
      ))}
    </div>
  );
}
