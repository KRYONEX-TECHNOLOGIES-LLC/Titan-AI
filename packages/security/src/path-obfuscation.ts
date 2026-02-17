/**
 * Titan AI Security - Path Obfuscation
 * Remove sensitive path information before sending to LLMs
 */

import type { ObfuscationConfig, ObfuscationPattern } from './types.js';
import { createHash } from 'crypto';

export class PathObfuscator {
  private config: ObfuscationConfig;
  private mappings: Map<string, string> = new Map();
  private reverseMappings: Map<string, string> = new Map();

  constructor(config: Partial<ObfuscationConfig> = {}) {
    this.config = {
      enabled: true,
      preserveStructure: true,
      patterns: [
        { type: 'username', replacement: '<USER>' },
        { type: 'hostname', replacement: '<HOST>' },
        { type: 'path', replacement: '' },
      ],
      ...config,
    };
  }

  /**
   * Obfuscate a path
   */
  obfuscate(path: string): string {
    if (!this.config.enabled) return path;

    let result = path;

    // Apply patterns
    for (const pattern of this.config.patterns) {
      result = this.applyPattern(result, pattern);
    }

    // Store mapping for reverse lookup
    if (result !== path) {
      this.mappings.set(path, result);
      this.reverseMappings.set(result, path);
    }

    return result;
  }

  /**
   * Deobfuscate a path
   */
  deobfuscate(obfuscated: string): string {
    return this.reverseMappings.get(obfuscated) ?? obfuscated;
  }

  /**
   * Obfuscate content containing paths
   */
  obfuscateContent(content: string): string {
    if (!this.config.enabled) return content;

    let result = content;

    // Find and replace paths
    const pathPatterns = [
      /[A-Za-z]:\\[^\s"'<>|*?]+/g, // Windows paths
      /\/(?:Users|home|var|opt|etc|usr)\/[^\s"'<>|*?]+/g, // Unix paths
    ];

    for (const regex of pathPatterns) {
      result = result.replace(regex, match => this.obfuscate(match));
    }

    return result;
  }

  /**
   * Deobfuscate content
   */
  deobfuscateContent(content: string): string {
    let result = content;

    for (const [obfuscated, original] of this.reverseMappings.entries()) {
      result = result.replace(new RegExp(this.escapeRegex(obfuscated), 'g'), original);
    }

    return result;
  }

  /**
   * Apply an obfuscation pattern
   */
  private applyPattern(path: string, pattern: ObfuscationPattern): string {
    switch (pattern.type) {
      case 'username':
        return this.obfuscateUsername(path, pattern.replacement);
      case 'hostname':
        return this.obfuscateHostname(path, pattern.replacement);
      case 'path':
        return this.obfuscateFullPath(path);
      case 'custom':
        return pattern.pattern
          ? path.replace(pattern.pattern, pattern.replacement)
          : path;
      default:
        return path;
    }
  }

  /**
   * Obfuscate username in path
   */
  private obfuscateUsername(path: string, replacement: string): string {
    // Windows: C:\Users\username\...
    const windowsMatch = path.match(/^([A-Za-z]:\\Users\\)([^\\]+)(\\.*)?$/);
    if (windowsMatch) {
      return `${windowsMatch[1]}${replacement}${windowsMatch[3] ?? ''}`;
    }

    // Unix: /home/username/... or /Users/username/...
    const unixMatch = path.match(/^(\/(?:home|Users)\/)([^/]+)(\/.*)?$/);
    if (unixMatch) {
      return `${unixMatch[1]}${replacement}${unixMatch[3] ?? ''}`;
    }

    return path;
  }

  /**
   * Obfuscate hostname in path
   */
  private obfuscateHostname(path: string, replacement: string): string {
    // UNC paths: \\hostname\share\...
    const uncMatch = path.match(/^(\\\\)([^\\]+)(\\.*)?$/);
    if (uncMatch) {
      return `${uncMatch[1]}${replacement}${uncMatch[3] ?? ''}`;
    }

    return path;
  }

  /**
   * Obfuscate full path to workspace-relative
   */
  private obfuscateFullPath(path: string): string {
    if (this.config.preserveStructure) {
      // Keep relative structure, just anonymize absolute prefix
      const hash = createHash('sha256').update(path).digest('hex').slice(0, 8);
      const filename = path.split(/[/\\]/).pop() ?? '';
      return `<workspace>/${hash}/${filename}`;
    }

    // Full obfuscation
    const hash = createHash('sha256').update(path).digest('hex').slice(0, 12);
    return `<path:${hash}>`;
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Clear all mappings
   */
  clearMappings(): void {
    this.mappings.clear();
    this.reverseMappings.clear();
  }

  /**
   * Get current mappings
   */
  getMappings(): Map<string, string> {
    return new Map(this.mappings);
  }
}
