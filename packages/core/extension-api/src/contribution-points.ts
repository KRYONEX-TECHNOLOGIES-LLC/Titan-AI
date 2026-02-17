/**
 * Contribution Points
 *
 * Extension contribution point handlers
 */

import type { ExtensionContributions, CommandContribution, KeybindingContribution } from './types';

export interface ContributionHandler<T> {
  validate(contribution: T): boolean;
  register(extensionId: string, contribution: T): void;
  unregister(extensionId: string): void;
}

export class ContributionRegistry {
  private handlers = new Map<string, ContributionHandler<unknown>>();
  private contributions = new Map<string, Map<string, unknown[]>>();

  /**
   * Register a contribution handler
   */
  registerHandler<T>(
    point: keyof ExtensionContributions,
    handler: ContributionHandler<T>
  ): void {
    this.handlers.set(point, handler as ContributionHandler<unknown>);
  }

  /**
   * Process contributions from an extension
   */
  processContributions(
    extensionId: string,
    contributions: ExtensionContributions
  ): void {
    for (const [point, value] of Object.entries(contributions)) {
      const handler = this.handlers.get(point);
      if (!handler) continue;

      const items = Array.isArray(value) ? value : [value];

      for (const item of items) {
        if (handler.validate(item)) {
          handler.register(extensionId, item);

          // Track contributions
          if (!this.contributions.has(extensionId)) {
            this.contributions.set(extensionId, new Map());
          }
          const extContribs = this.contributions.get(extensionId)!;
          if (!extContribs.has(point)) {
            extContribs.set(point, []);
          }
          extContribs.get(point)!.push(item);
        }
      }
    }
  }

  /**
   * Remove contributions from an extension
   */
  removeContributions(extensionId: string): void {
    const extContribs = this.contributions.get(extensionId);
    if (!extContribs) return;

    for (const [point] of extContribs) {
      const handler = this.handlers.get(point);
      if (handler) {
        handler.unregister(extensionId);
      }
    }

    this.contributions.delete(extensionId);
  }

  /**
   * Get contributions for an extension
   */
  getContributions(extensionId: string): Map<string, unknown[]> | undefined {
    return this.contributions.get(extensionId);
  }

  /**
   * Get all contributions of a type
   */
  getAllOfType<T>(point: keyof ExtensionContributions): Array<{
    extensionId: string;
    contribution: T;
  }> {
    const results: Array<{ extensionId: string; contribution: T }> = [];

    for (const [extensionId, contribs] of this.contributions) {
      const items = contribs.get(point);
      if (items) {
        for (const item of items) {
          results.push({ extensionId, contribution: item as T });
        }
      }
    }

    return results;
  }
}

/**
 * Create a command contribution handler
 */
export function createCommandContributionHandler(
  onRegister: (extensionId: string, command: CommandContribution) => void,
  onUnregister: (extensionId: string) => void
): ContributionHandler<CommandContribution> {
  return {
    validate(contribution: CommandContribution): boolean {
      return !!(contribution.command && contribution.title);
    },
    register(extensionId: string, contribution: CommandContribution): void {
      onRegister(extensionId, contribution);
    },
    unregister(extensionId: string): void {
      onUnregister(extensionId);
    },
  };
}

/**
 * Create a keybinding contribution handler
 */
export function createKeybindingContributionHandler(
  onRegister: (extensionId: string, keybinding: KeybindingContribution) => void,
  onUnregister: (extensionId: string) => void
): ContributionHandler<KeybindingContribution> {
  return {
    validate(contribution: KeybindingContribution): boolean {
      return !!(contribution.command && contribution.key);
    },
    register(extensionId: string, contribution: KeybindingContribution): void {
      onRegister(extensionId, contribution);
    },
    unregister(extensionId: string): void {
      onUnregister(extensionId);
    },
  };
}
