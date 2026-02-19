'use client';

import { useEffect } from 'react';
import { executeCommand } from '@/lib/ide/command-registry';

interface Binding {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  key: string;
  commandId: string;
}

const BINDINGS: Binding[] = [
  { ctrl: true, key: 'n', commandId: 'file.newFile' },
  { ctrl: true, shift: true, key: 'N', commandId: 'file.newWindow' },
  { ctrl: true, key: 'o', commandId: 'file.open' },
  { ctrl: true, key: 's', commandId: 'file.save' },
  { ctrl: true, shift: true, key: 'S', commandId: 'file.saveAs' },
  { ctrl: true, key: 'w', commandId: 'editor.closeEditor' },

  { ctrl: true, key: 'z', commandId: 'edit.undo' },
  { ctrl: true, key: 'y', commandId: 'edit.redo' },
  { ctrl: true, key: 'f', commandId: 'edit.find' },
  { ctrl: true, key: 'h', commandId: 'edit.replace' },
  { ctrl: true, key: '/', commandId: 'edit.commentLine' },
  { ctrl: true, key: '.', commandId: 'edit.quickFix' },
  { ctrl: true, key: 'd', commandId: 'edit.selectNextOccurrence' },
  { ctrl: true, shift: true, key: 'K', commandId: 'edit.deleteLines' },
  { ctrl: true, shift: true, key: 'L', commandId: 'edit.selectAllOccurrences' },
  { ctrl: true, key: ']', commandId: 'edit.indentLine' },
  { ctrl: true, key: '[', commandId: 'edit.outdentLine' },
  { shift: true, alt: true, key: 'F', commandId: 'edit.formatDocument' },
  { key: 'F2', commandId: 'edit.rename' },

  { shift: true, alt: true, key: 'ArrowRight', commandId: 'selection.expandSelection' },
  { shift: true, alt: true, key: 'ArrowLeft', commandId: 'selection.shrinkSelection' },

  { ctrl: true, key: 'b', commandId: 'view.toggleSidebar' },
  { ctrl: true, key: '`', commandId: 'view.togglePanel' },
  { ctrl: true, shift: true, key: 'E', commandId: 'view.explorer' },
  { ctrl: true, shift: true, key: 'F', commandId: 'view.search' },
  { ctrl: true, shift: true, key: 'G', commandId: 'view.git' },
  { ctrl: true, shift: true, key: 'D', commandId: 'view.debug' },
  { ctrl: true, shift: true, key: 'X', commandId: 'view.extensions' },
  { ctrl: true, shift: true, key: 'A', commandId: 'view.titanAgent' },
  { ctrl: true, shift: true, key: 'M', commandId: 'view.showProblems' },
  { alt: true, key: 'z', commandId: 'view.toggleWordWrap' },
  { ctrl: true, key: '=', commandId: 'view.zoomIn' },
  { ctrl: true, key: '-', commandId: 'view.zoomOut' },
  { ctrl: true, key: '0', commandId: 'view.resetZoom' },

  { ctrl: true, key: 'p', commandId: 'go.toFile' },
  { ctrl: true, key: 't', commandId: 'go.toSymbol' },
  { ctrl: true, key: 'g', commandId: 'go.toLine' },
  { key: 'F12', commandId: 'go.toDefinition' },
  { key: 'F8', commandId: 'go.nextError' },
  { shift: true, key: 'F8', commandId: 'go.prevError' },
  { alt: true, key: 'ArrowLeft', commandId: 'go.back' },
  { alt: true, key: 'ArrowRight', commandId: 'go.forward' },

  { key: 'F5', commandId: 'debug.start' },
  { ctrl: true, key: 'F5', commandId: 'debug.startWithoutDebugging' },
  { shift: true, key: 'F5', commandId: 'debug.stop' },
  { ctrl: true, shift: true, key: 'F5', commandId: 'debug.restart' },
  { key: 'F10', commandId: 'debug.stepOver' },
  { key: 'F11', commandId: 'debug.stepInto' },
  { shift: true, key: 'F11', commandId: 'debug.stepOut' },
  { key: 'F9', commandId: 'debug.toggleBreakpoint' },

  { ctrl: true, shift: true, key: '`', commandId: 'terminal.new' },

  { ctrl: true, key: 'Tab', commandId: 'workbench.nextTab' },
  { ctrl: true, shift: true, key: 'Tab', commandId: 'workbench.prevTab' },
  { ctrl: true, key: ',', commandId: 'workbench.settings' },
];

function matchBinding(e: KeyboardEvent, b: Binding): boolean {
  return (
    e.key === b.key &&
    !!e.ctrlKey === !!b.ctrl &&
    !!e.shiftKey === !!b.shift &&
    !!e.altKey === !!b.alt &&
    !!e.metaKey === !!b.meta
  );
}

export default function KeybindingService() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture inside text inputs unless it's an IDE shortcut
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;

      for (const binding of BINDINGS) {
        if (matchBinding(e, binding)) {
          // For text inputs, only pass through non-text editing shortcuts
          if (isInput && !binding.ctrl && !binding.meta && !binding.alt) continue;
          e.preventDefault();
          e.stopPropagation();
          executeCommand(binding.commandId);
          return;
        }
      }
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, []);

  return null;
}
