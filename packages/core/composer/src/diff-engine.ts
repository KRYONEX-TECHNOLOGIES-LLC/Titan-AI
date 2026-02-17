/**
 * Diff Engine
 *
 * Core diffing functionality
 */

import * as diff from 'diff';
import type { DiffChange, DiffHunk, FileDiff, MultiFileDiff } from './types';

export class DiffEngine {
  /**
   * Compute diff between two strings
   */
  static computeDiff(oldContent: string, newContent: string): DiffChange[] {
    const changes = diff.diffLines(oldContent, newContent);
    const result: DiffChange[] = [];

    let oldLine = 1;
    let newLine = 1;

    for (const change of changes) {
      const lines = change.value.split('\n').filter((l, i, arr) => 
        i < arr.length - 1 || l !== ''
      );

      for (const line of lines) {
        if (change.added) {
          result.push({
            type: 'add',
            value: line,
            newLineNumber: newLine++,
          });
        } else if (change.removed) {
          result.push({
            type: 'remove',
            value: line,
            oldLineNumber: oldLine++,
          });
        } else {
          result.push({
            type: 'unchanged',
            value: line,
            oldLineNumber: oldLine++,
            newLineNumber: newLine++,
          });
        }
      }
    }

    return result;
  }

  /**
   * Compute diff hunks
   */
  static computeHunks(
    oldContent: string,
    newContent: string,
    contextLines = 3
  ): DiffHunk[] {
    const changes = this.computeDiff(oldContent, newContent);
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let unchangedCount = 0;

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      const isChanged = change.type !== 'unchanged';

      if (isChanged) {
        if (!currentHunk) {
          // Start new hunk with context
          const contextStart = Math.max(0, i - contextLines);
          currentHunk = {
            oldStart: changes[contextStart].oldLineNumber || 1,
            oldLines: 0,
            newStart: changes[contextStart].newLineNumber || 1,
            newLines: 0,
            changes: [],
          };

          // Add preceding context
          for (let j = contextStart; j < i; j++) {
            currentHunk.changes.push(changes[j]);
            if (changes[j].oldLineNumber) currentHunk.oldLines++;
            if (changes[j].newLineNumber) currentHunk.newLines++;
          }
        }

        currentHunk.changes.push(change);
        if (change.type === 'remove') currentHunk.oldLines++;
        if (change.type === 'add') currentHunk.newLines++;
        unchangedCount = 0;
      } else if (currentHunk) {
        unchangedCount++;
        currentHunk.changes.push(change);
        currentHunk.oldLines++;
        currentHunk.newLines++;

        // End hunk if too many unchanged lines
        if (unchangedCount > contextLines * 2) {
          // Trim trailing context
          const trimCount = unchangedCount - contextLines;
          currentHunk.changes = currentHunk.changes.slice(0, -trimCount);
          currentHunk.oldLines -= trimCount;
          currentHunk.newLines -= trimCount;
          hunks.push(currentHunk);
          currentHunk = null;
          unchangedCount = 0;
        }
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return hunks;
  }

  /**
   * Compute file diff
   */
  static computeFileDiff(
    filePath: string,
    oldContent: string,
    newContent: string,
    options: { oldPath?: string } = {}
  ): FileDiff {
    const hunks = this.computeHunks(oldContent, newContent);

    let additions = 0;
    let deletions = 0;

    for (const hunk of hunks) {
      for (const change of hunk.changes) {
        if (change.type === 'add') additions++;
        if (change.type === 'remove') deletions++;
      }
    }

    return {
      filePath,
      oldContent,
      newContent,
      hunks,
      additions,
      deletions,
      isNew: oldContent === '',
      isDeleted: newContent === '',
      isRenamed: options.oldPath !== undefined && options.oldPath !== filePath,
      oldPath: options.oldPath,
    };
  }

  /**
   * Compute multi-file diff
   */
  static computeMultiFileDiff(
    files: Array<{ path: string; oldContent: string; newContent: string; oldPath?: string }>
  ): MultiFileDiff {
    const fileDiffs = files.map((f) =>
      this.computeFileDiff(f.path, f.oldContent, f.newContent, { oldPath: f.oldPath })
    );

    const totalAdditions = fileDiffs.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = fileDiffs.reduce((sum, f) => sum + f.deletions, 0);

    const summary = `${files.length} file(s) changed, ${totalAdditions} insertion(s), ${totalDeletions} deletion(s)`;

    return {
      files: fileDiffs,
      totalAdditions,
      totalDeletions,
      summary,
    };
  }

  /**
   * Apply patch to content
   */
  static applyPatch(content: string, patch: string): string | null {
    const result = diff.applyPatch(content, patch);
    return result === false ? null : result;
  }

  /**
   * Create unified patch
   */
  static createPatch(
    filePath: string,
    oldContent: string,
    newContent: string
  ): string {
    return diff.createPatch(filePath, oldContent, newContent);
  }

  /**
   * Parse unified diff
   */
  static parsePatch(patch: string): diff.ParsedDiff[] {
    return diff.parsePatch(patch);
  }
}
