/**
 * Document Manager
 *
 * Manages document state and synchronization
 */

import { EventEmitter } from 'events';
import type { DocumentState, TextEdit, Range, Position } from './types';

export interface DocumentManagerConfig {
  maxCacheSize?: number;
  syncDelay?: number;
}

export class DocumentManager extends EventEmitter {
  private documents = new Map<string, DocumentState>();
  private config: DocumentManagerConfig;
  private pendingChanges = new Map<string, TextEdit[]>();

  constructor(config: DocumentManagerConfig = {}) {
    super();
    this.config = {
      maxCacheSize: config.maxCacheSize ?? 100,
      syncDelay: config.syncDelay ?? 100,
    };
  }

  /**
   * Open a document
   */
  open(uri: string, content: string, languageId: string): DocumentState {
    const doc: DocumentState = {
      uri,
      version: 1,
      content,
      languageId,
      isDirty: false,
      lineCount: content.split('\n').length,
    };

    this.documents.set(uri, doc);
    this.emit('documentOpened', doc);

    // Trim cache if needed
    this.trimCache();

    return doc;
  }

  /**
   * Close a document
   */
  close(uri: string): boolean {
    const doc = this.documents.get(uri);
    if (doc) {
      this.documents.delete(uri);
      this.pendingChanges.delete(uri);
      this.emit('documentClosed', doc);
      return true;
    }
    return false;
  }

  /**
   * Get a document
   */
  get(uri: string): DocumentState | undefined {
    return this.documents.get(uri);
  }

  /**
   * Check if document exists
   */
  has(uri: string): boolean {
    return this.documents.has(uri);
  }

  /**
   * Get all open documents
   */
  getAll(): DocumentState[] {
    return Array.from(this.documents.values());
  }

  /**
   * Apply text edits to a document
   */
  applyEdits(uri: string, edits: TextEdit[]): DocumentState | undefined {
    const doc = this.documents.get(uri);
    if (!doc) return undefined;

    // Sort edits in reverse order to apply from end to start
    const sortedEdits = [...edits].sort((a, b) => {
      const lineDiff = b.range.start.line - a.range.start.line;
      if (lineDiff !== 0) return lineDiff;
      return b.range.start.character - a.range.start.character;
    });

    let content = doc.content;

    for (const edit of sortedEdits) {
      content = this.applyEdit(content, edit);
    }

    const updatedDoc: DocumentState = {
      ...doc,
      content,
      version: doc.version + 1,
      isDirty: true,
      lineCount: content.split('\n').length,
    };

    this.documents.set(uri, updatedDoc);
    this.emit('documentChanged', updatedDoc, edits);

    return updatedDoc;
  }

  /**
   * Apply a single edit
   */
  private applyEdit(content: string, edit: TextEdit): string {
    const lines = content.split('\n');
    const startLine = edit.range.start.line;
    const endLine = edit.range.end.line;
    const startChar = edit.range.start.character;
    const endChar = edit.range.end.character;

    // Get the prefix from the start line
    const prefix = lines[startLine]?.slice(0, startChar) ?? '';

    // Get the suffix from the end line
    const suffix = lines[endLine]?.slice(endChar) ?? '';

    // Create new content
    const newLines = edit.newText.split('\n');

    // Combine with prefix and suffix
    if (newLines.length === 1) {
      newLines[0] = prefix + newLines[0] + suffix;
    } else {
      newLines[0] = prefix + newLines[0];
      newLines[newLines.length - 1] += suffix;
    }

    // Replace lines
    lines.splice(startLine, endLine - startLine + 1, ...newLines);

    return lines.join('\n');
  }

  /**
   * Get text at range
   */
  getText(uri: string, range?: Range): string | undefined {
    const doc = this.documents.get(uri);
    if (!doc) return undefined;

    if (!range) return doc.content;

    const lines = doc.content.split('\n');
    const startLine = range.start.line;
    const endLine = range.end.line;

    if (startLine === endLine) {
      return lines[startLine]?.slice(range.start.character, range.end.character);
    }

    const result: string[] = [];
    result.push(lines[startLine]?.slice(range.start.character) ?? '');

    for (let i = startLine + 1; i < endLine; i++) {
      result.push(lines[i] ?? '');
    }

    result.push(lines[endLine]?.slice(0, range.end.character) ?? '');

    return result.join('\n');
  }

  /**
   * Get position from offset
   */
  positionAt(uri: string, offset: number): Position | undefined {
    const doc = this.documents.get(uri);
    if (!doc) return undefined;

    let line = 0;
    let character = 0;
    let currentOffset = 0;

    for (const char of doc.content) {
      if (currentOffset === offset) break;

      if (char === '\n') {
        line++;
        character = 0;
      } else {
        character++;
      }
      currentOffset++;
    }

    return { line, character };
  }

  /**
   * Get offset from position
   */
  offsetAt(uri: string, position: Position): number | undefined {
    const doc = this.documents.get(uri);
    if (!doc) return undefined;

    const lines = doc.content.split('\n');
    let offset = 0;

    for (let i = 0; i < position.line && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }

    offset += position.character;
    return offset;
  }

  /**
   * Save document (mark as not dirty)
   */
  save(uri: string): boolean {
    const doc = this.documents.get(uri);
    if (!doc) return false;

    this.documents.set(uri, { ...doc, isDirty: false });
    this.emit('documentSaved', doc);
    return true;
  }

  /**
   * Trim cache to max size
   */
  private trimCache(): void {
    const maxSize = this.config.maxCacheSize ?? 100;
    if (this.documents.size <= maxSize) return;

    const toRemove = this.documents.size - maxSize;
    const entries = Array.from(this.documents.entries());

    // Remove oldest entries that aren't dirty
    let removed = 0;
    for (const [uri, doc] of entries) {
      if (removed >= toRemove) break;
      if (!doc.isDirty) {
        this.documents.delete(uri);
        removed++;
      }
    }
  }

  /**
   * Clear all documents
   */
  clear(): void {
    this.documents.clear();
    this.pendingChanges.clear();
    this.emit('cleared');
  }
}
