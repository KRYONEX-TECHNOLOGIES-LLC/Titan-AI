/**
 * Editor core types
 */

import type { URI } from 'vscode-uri';

export interface DocumentState {
  uri: string;
  version: number;
  content: string;
  languageId: string;
  isDirty: boolean;
  lineCount: number;
}

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface WorkspaceEdit {
  changes: Map<string, TextEdit[]>;
  documentChanges?: DocumentChange[];
}

export interface DocumentChange {
  kind: 'create' | 'rename' | 'delete' | 'edit';
  uri: string;
  newUri?: string;
  edits?: TextEdit[];
}

export interface DiagnosticSeverity {
  Error: 1;
  Warning: 2;
  Information: 3;
  Hint: 4;
}

export interface Diagnostic {
  range: Range;
  message: string;
  severity: number;
  source?: string;
  code?: string | number;
  relatedInformation?: DiagnosticRelatedInformation[];
}

export interface DiagnosticRelatedInformation {
  location: {
    uri: string;
    range: Range;
  };
  message: string;
}

export interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  textEdit?: TextEdit;
  additionalTextEdits?: TextEdit[];
  sortText?: string;
  filterText?: string;
  preselect?: boolean;
}

export interface CompletionList {
  isIncomplete: boolean;
  items: CompletionItem[];
}

export interface Hover {
  contents: string | string[];
  range?: Range;
}

export interface SymbolInformation {
  name: string;
  kind: number;
  location: {
    uri: string;
    range: Range;
  };
  containerName?: string;
}

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export interface Location {
  uri: string;
  range: Range;
}

export interface CodeAction {
  title: string;
  kind?: string;
  diagnostics?: Diagnostic[];
  isPreferred?: boolean;
  edit?: WorkspaceEdit;
  command?: Command;
}

export interface Command {
  title: string;
  command: string;
  arguments?: unknown[];
}

export interface FileSystemWatcher {
  globPattern: string;
  ignoreCreate?: boolean;
  ignoreChange?: boolean;
  ignoreDelete?: boolean;
}

export interface WorkspaceFolder {
  uri: string;
  name: string;
  index: number;
}

export interface EditorConfig {
  tabSize: number;
  insertSpaces: boolean;
  trimTrailingWhitespace: boolean;
  insertFinalNewline: boolean;
}

export interface EditorState {
  activeDocument?: DocumentState;
  visibleDocuments: DocumentState[];
  workspaceFolders: WorkspaceFolder[];
  configuration: EditorConfig;
}
