/**
 * Titan AI Repo Map - Graph Builder
 * Build reference graph between symbols
 */

import type { RepoGraph, SymbolReference, RepoSymbol } from './types.js';

export class RepoGraphBuilder {
  /**
   * Build references between symbols
   */
  async buildReferences(graph: RepoGraph): Promise<SymbolReference[]> {
    const references: SymbolReference[] = [];

    // Build a name-to-symbol index for faster lookup
    const nameIndex = new Map<string, RepoSymbol[]>();
    for (const symbol of graph.symbols.values()) {
      const existing = nameIndex.get(symbol.name) ?? [];
      existing.push(symbol);
      nameIndex.set(symbol.name, existing);
    }

    // For each file, find references to other symbols
    for (const [filePath, symbolIds] of graph.files) {
      // Get all symbol names in this file
      const fileSymbols = symbolIds
        .map(id => graph.symbols.get(id))
        .filter((s): s is RepoSymbol => s !== undefined);

      // Look for references to other symbols
      for (const symbol of fileSymbols) {
        for (const [name, targets] of nameIndex) {
          // Skip self-references
          if (name === symbol.name) continue;

          // Check if this symbol references another
          for (const target of targets) {
            // Skip symbols in the same file (usually already connected)
            if (target.filePath === symbol.filePath) continue;

            // Check for common reference patterns
            if (this.hasReference(symbol, target, name)) {
              references.push({
                fromSymbol: symbol.id,
                toSymbol: target.id,
                type: this.inferReferenceType(symbol, target),
              });
            }
          }
        }
      }
    }

    return this.deduplicateReferences(references);
  }

  /**
   * Check if source symbol references target
   */
  private hasReference(
    source: RepoSymbol,
    target: RepoSymbol,
    targetName: string
  ): boolean {
    // Check signature for the target name
    if (source.signature?.includes(targetName)) {
      return true;
    }

    return false;
  }

  /**
   * Infer reference type from symbols
   */
  private inferReferenceType(
    source: RepoSymbol,
    target: RepoSymbol
  ): SymbolReference['type'] {
    // Class extending another class
    if (source.kind === 'class' && target.kind === 'class') {
      if (source.signature?.includes(`extends ${target.name}`)) {
        return 'extend';
      }
      if (source.signature?.includes(`implements ${target.name}`)) {
        return 'implement';
      }
    }

    // Function calling another function
    if (source.kind === 'function' && target.kind === 'function') {
      return 'call';
    }

    // Import
    if (target.exported) {
      return 'import';
    }

    return 'use';
  }

  /**
   * Remove duplicate references
   */
  private deduplicateReferences(references: SymbolReference[]): SymbolReference[] {
    const seen = new Set<string>();
    return references.filter(ref => {
      const key = `${ref.fromSymbol}:${ref.toSymbol}:${ref.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Build adjacency list from graph
   */
  buildAdjacencyList(graph: RepoGraph): Map<string, string[]> {
    const adjacency = new Map<string, string[]>();

    for (const symbol of graph.symbols.keys()) {
      adjacency.set(symbol, []);
    }

    for (const ref of graph.references) {
      const outgoing = adjacency.get(ref.fromSymbol) ?? [];
      outgoing.push(ref.toSymbol);
      adjacency.set(ref.fromSymbol, outgoing);
    }

    return adjacency;
  }

  /**
   * Build reverse adjacency (incoming edges)
   */
  buildReverseAdjacency(graph: RepoGraph): Map<string, string[]> {
    const reverse = new Map<string, string[]>();

    for (const symbol of graph.symbols.keys()) {
      reverse.set(symbol, []);
    }

    for (const ref of graph.references) {
      const incoming = reverse.get(ref.toSymbol) ?? [];
      incoming.push(ref.fromSymbol);
      reverse.set(ref.toSymbol, incoming);
    }

    return reverse;
  }

  /**
   * Get connected components
   */
  getConnectedComponents(graph: RepoGraph): string[][] {
    const visited = new Set<string>();
    const components: string[][] = [];
    const adjacency = this.buildAdjacencyList(graph);

    const dfs = (start: string, component: string[]): void => {
      visited.add(start);
      component.push(start);

      for (const neighbor of adjacency.get(start) ?? []) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, component);
        }
      }
    };

    for (const symbol of graph.symbols.keys()) {
      if (!visited.has(symbol)) {
        const component: string[] = [];
        dfs(symbol, component);
        components.push(component);
      }
    }

    return components;
  }
}
