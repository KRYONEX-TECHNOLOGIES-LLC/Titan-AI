/**
 * Composer types
 */

export interface DiffChange {
  type: 'add' | 'remove' | 'unchanged';
  value: string;
  lineNumber?: number;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffChange[];
}

export interface FileDiff {
  filePath: string;
  oldContent: string;
  newContent: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  isNew: boolean;
  isDeleted: boolean;
  isRenamed: boolean;
  oldPath?: string;
}

export interface MultiFileDiff {
  files: FileDiff[];
  totalAdditions: number;
  totalDeletions: number;
  summary: string;
}

export interface PatchHunk {
  id: string;
  filePath: string;
  hunk: DiffHunk;
  status: 'pending' | 'accepted' | 'rejected';
  preview: string;
}

export interface InlinePatch {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  originalContent: string;
  newContent: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface ConflictMarker {
  filePath: string;
  startLine: number;
  endLine: number;
  ours: string;
  theirs: string;
  base?: string;
}

export interface ConflictResolution {
  conflictId: string;
  resolution: 'ours' | 'theirs' | 'both' | 'custom';
  customContent?: string;
}

export interface ComposerState {
  currentDiff: MultiFileDiff | null;
  patches: InlinePatch[];
  conflicts: ConflictMarker[];
  acceptedPatches: Set<string>;
  rejectedPatches: Set<string>;
}

export interface ComposerConfig {
  contextLines: number;
  showWhitespace: boolean;
  wordWrap: boolean;
  syntaxHighlight: boolean;
  sideBySideMode: boolean;
}
