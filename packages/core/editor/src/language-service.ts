/**
 * Language Service
 *
 * Language intelligence features
 */

import { EventEmitter } from 'events';
import type {
  CompletionItem,
  CompletionList,
  Hover,
  Location,
  DocumentSymbol,
  CodeAction,
  Position,
  Range,
  Diagnostic,
} from './types';

export interface LanguageProvider {
  id: string;
  languages: string[];
  provideCompletion?: (uri: string, position: Position) => Promise<CompletionList>;
  provideHover?: (uri: string, position: Position) => Promise<Hover | null>;
  provideDefinition?: (uri: string, position: Position) => Promise<Location[]>;
  provideReferences?: (uri: string, position: Position) => Promise<Location[]>;
  provideDocumentSymbols?: (uri: string) => Promise<DocumentSymbol[]>;
  provideCodeActions?: (uri: string, range: Range, diagnostics: Diagnostic[]) => Promise<CodeAction[]>;
}

export class LanguageService extends EventEmitter {
  private providers = new Map<string, LanguageProvider>();
  private languageToProvider = new Map<string, string[]>();

  /**
   * Register a language provider
   */
  registerProvider(provider: LanguageProvider): void {
    this.providers.set(provider.id, provider);

    for (const lang of provider.languages) {
      const existing = this.languageToProvider.get(lang) ?? [];
      existing.push(provider.id);
      this.languageToProvider.set(lang, existing);
    }

    this.emit('providerRegistered', provider.id);
  }

  /**
   * Unregister a language provider
   */
  unregisterProvider(providerId: string): boolean {
    const provider = this.providers.get(providerId);
    if (!provider) return false;

    this.providers.delete(providerId);

    for (const lang of provider.languages) {
      const existing = this.languageToProvider.get(lang) ?? [];
      const filtered = existing.filter((id) => id !== providerId);
      if (filtered.length > 0) {
        this.languageToProvider.set(lang, filtered);
      } else {
        this.languageToProvider.delete(lang);
      }
    }

    this.emit('providerUnregistered', providerId);
    return true;
  }

  /**
   * Get providers for a language
   */
  private getProvidersForLanguage(languageId: string): LanguageProvider[] {
    const providerIds = this.languageToProvider.get(languageId) ?? [];
    return providerIds
      .map((id) => this.providers.get(id))
      .filter((p): p is LanguageProvider => p !== undefined);
  }

  /**
   * Get completions at position
   */
  async getCompletions(
    uri: string,
    position: Position,
    languageId: string
  ): Promise<CompletionList> {
    const providers = this.getProvidersForLanguage(languageId);
    const allItems: CompletionItem[] = [];
    let isIncomplete = false;

    for (const provider of providers) {
      if (!provider.provideCompletion) continue;

      try {
        const result = await provider.provideCompletion(uri, position);
        allItems.push(...result.items);
        if (result.isIncomplete) isIncomplete = true;
      } catch (error) {
        this.emit('error', { provider: provider.id, method: 'provideCompletion', error });
      }
    }

    return { items: allItems, isIncomplete };
  }

  /**
   * Get hover at position
   */
  async getHover(
    uri: string,
    position: Position,
    languageId: string
  ): Promise<Hover | null> {
    const providers = this.getProvidersForLanguage(languageId);

    for (const provider of providers) {
      if (!provider.provideHover) continue;

      try {
        const result = await provider.provideHover(uri, position);
        if (result) return result;
      } catch (error) {
        this.emit('error', { provider: provider.id, method: 'provideHover', error });
      }
    }

    return null;
  }

  /**
   * Get definition locations
   */
  async getDefinition(
    uri: string,
    position: Position,
    languageId: string
  ): Promise<Location[]> {
    const providers = this.getProvidersForLanguage(languageId);
    const allLocations: Location[] = [];

    for (const provider of providers) {
      if (!provider.provideDefinition) continue;

      try {
        const result = await provider.provideDefinition(uri, position);
        allLocations.push(...result);
      } catch (error) {
        this.emit('error', { provider: provider.id, method: 'provideDefinition', error });
      }
    }

    return allLocations;
  }

  /**
   * Get references
   */
  async getReferences(
    uri: string,
    position: Position,
    languageId: string
  ): Promise<Location[]> {
    const providers = this.getProvidersForLanguage(languageId);
    const allLocations: Location[] = [];

    for (const provider of providers) {
      if (!provider.provideReferences) continue;

      try {
        const result = await provider.provideReferences(uri, position);
        allLocations.push(...result);
      } catch (error) {
        this.emit('error', { provider: provider.id, method: 'provideReferences', error });
      }
    }

    return allLocations;
  }

  /**
   * Get document symbols
   */
  async getDocumentSymbols(
    uri: string,
    languageId: string
  ): Promise<DocumentSymbol[]> {
    const providers = this.getProvidersForLanguage(languageId);
    const allSymbols: DocumentSymbol[] = [];

    for (const provider of providers) {
      if (!provider.provideDocumentSymbols) continue;

      try {
        const result = await provider.provideDocumentSymbols(uri);
        allSymbols.push(...result);
      } catch (error) {
        this.emit('error', { provider: provider.id, method: 'provideDocumentSymbols', error });
      }
    }

    return allSymbols;
  }

  /**
   * Get code actions
   */
  async getCodeActions(
    uri: string,
    range: Range,
    diagnostics: Diagnostic[],
    languageId: string
  ): Promise<CodeAction[]> {
    const providers = this.getProvidersForLanguage(languageId);
    const allActions: CodeAction[] = [];

    for (const provider of providers) {
      if (!provider.provideCodeActions) continue;

      try {
        const result = await provider.provideCodeActions(uri, range, diagnostics);
        allActions.push(...result);
      } catch (error) {
        this.emit('error', { provider: provider.id, method: 'provideCodeActions', error });
      }
    }

    return allActions;
  }
}
