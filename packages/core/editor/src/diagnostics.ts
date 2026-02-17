/**
 * Diagnostics Manager
 *
 * Manages diagnostics (errors, warnings) for documents
 */

import { EventEmitter } from 'events';
import type { Diagnostic, Range } from './types';

export interface DiagnosticCollection {
  name: string;
  diagnostics: Map<string, Diagnostic[]>;
}

export class DiagnosticsManager extends EventEmitter {
  private collections = new Map<string, DiagnosticCollection>();

  /**
   * Create a diagnostic collection
   */
  createCollection(name: string): DiagnosticCollection {
    const collection: DiagnosticCollection = {
      name,
      diagnostics: new Map(),
    };

    this.collections.set(name, collection);
    return collection;
  }

  /**
   * Get a diagnostic collection
   */
  getCollection(name: string): DiagnosticCollection | undefined {
    return this.collections.get(name);
  }

  /**
   * Set diagnostics for a document
   */
  set(collectionName: string, uri: string, diagnostics: Diagnostic[]): void {
    let collection = this.collections.get(collectionName);

    if (!collection) {
      collection = this.createCollection(collectionName);
    }

    collection.diagnostics.set(uri, diagnostics);
    this.emit('diagnosticsChanged', uri, this.getAllForDocument(uri));
  }

  /**
   * Clear diagnostics for a document
   */
  clear(collectionName: string, uri: string): void {
    const collection = this.collections.get(collectionName);
    if (!collection) return;

    collection.diagnostics.delete(uri);
    this.emit('diagnosticsChanged', uri, this.getAllForDocument(uri));
  }

  /**
   * Clear all diagnostics in a collection
   */
  clearCollection(collectionName: string): void {
    const collection = this.collections.get(collectionName);
    if (!collection) return;

    const uris = Array.from(collection.diagnostics.keys());
    collection.diagnostics.clear();

    for (const uri of uris) {
      this.emit('diagnosticsChanged', uri, this.getAllForDocument(uri));
    }
  }

  /**
   * Delete a collection
   */
  deleteCollection(collectionName: string): void {
    const collection = this.collections.get(collectionName);
    if (!collection) return;

    const uris = Array.from(collection.diagnostics.keys());
    this.collections.delete(collectionName);

    for (const uri of uris) {
      this.emit('diagnosticsChanged', uri, this.getAllForDocument(uri));
    }
  }

  /**
   * Get all diagnostics for a document
   */
  getAllForDocument(uri: string): Diagnostic[] {
    const allDiagnostics: Diagnostic[] = [];

    for (const collection of this.collections.values()) {
      const diagnostics = collection.diagnostics.get(uri);
      if (diagnostics) {
        allDiagnostics.push(...diagnostics);
      }
    }

    return allDiagnostics;
  }

  /**
   * Get diagnostics at position
   */
  getAtPosition(uri: string, line: number, character: number): Diagnostic[] {
    const all = this.getAllForDocument(uri);

    return all.filter((d) => {
      const { start, end } = d.range;
      if (line < start.line || line > end.line) return false;
      if (line === start.line && character < start.character) return false;
      if (line === end.line && character > end.character) return false;
      return true;
    });
  }

  /**
   * Get diagnostics in range
   */
  getInRange(uri: string, range: Range): Diagnostic[] {
    const all = this.getAllForDocument(uri);

    return all.filter((d) => {
      // Check if diagnostic range overlaps with query range
      const dRange = d.range;
      return !(
        dRange.end.line < range.start.line ||
        dRange.start.line > range.end.line ||
        (dRange.end.line === range.start.line && dRange.end.character < range.start.character) ||
        (dRange.start.line === range.end.line && dRange.start.character > range.end.character)
      );
    });
  }

  /**
   * Get diagnostic counts
   */
  getCounts(uri?: string): { errors: number; warnings: number; info: number; hints: number } {
    let diagnostics: Diagnostic[];

    if (uri) {
      diagnostics = this.getAllForDocument(uri);
    } else {
      diagnostics = [];
      for (const collection of this.collections.values()) {
        for (const docDiagnostics of collection.diagnostics.values()) {
          diagnostics.push(...docDiagnostics);
        }
      }
    }

    return {
      errors: diagnostics.filter((d) => d.severity === 1).length,
      warnings: diagnostics.filter((d) => d.severity === 2).length,
      info: diagnostics.filter((d) => d.severity === 3).length,
      hints: diagnostics.filter((d) => d.severity === 4).length,
    };
  }

  /**
   * Get all documents with diagnostics
   */
  getDocumentsWithDiagnostics(): string[] {
    const uris = new Set<string>();

    for (const collection of this.collections.values()) {
      for (const uri of collection.diagnostics.keys()) {
        uris.add(uri);
      }
    }

    return Array.from(uris);
  }
}
