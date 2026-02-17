/**
 * Titan AI Speculative - Block Generator
 * Intelligent block type detection for speculative editing
 */

import type { BlockType } from './types.js';

export class BlockGenerator {
  /**
   * Detect the appropriate block type for speculation
   */
  detectBlockType(prefix: string, language: string): BlockType {
    const lastLine = this.getLastLine(prefix);
    const trimmed = lastLine.trim();

    // Function/method definition starting
    if (this.isFunctionStart(trimmed, language)) {
      return 'function';
    }

    // Multi-line block (control structures, etc.)
    if (this.isBlockStart(trimmed, language)) {
      return 'multi-line';
    }

    // Line completion
    if (this.isLineCompletion(trimmed, language)) {
      return 'line';
    }

    // Token-level completion
    if (this.isTokenCompletion(trimmed, language)) {
      return 'token';
    }

    // Default to character-level
    return 'character';
  }

  /**
   * Check if at a natural code boundary
   */
  isNaturalBoundary(text: string, language: string): boolean {
    const trimmed = text.trim();

    // Empty or just whitespace
    if (!trimmed) return true;

    // Language-specific boundaries
    switch (language) {
      case 'typescript':
      case 'javascript':
        return this.isJSBoundary(trimmed);
      case 'python':
        return this.isPythonBoundary(trimmed);
      case 'rust':
        return this.isRustBoundary(trimmed);
      case 'go':
        return this.isGoBoundary(trimmed);
      default:
        return this.isGenericBoundary(trimmed);
    }
  }

  /**
   * Get recommended speculative count for block type
   */
  getRecommendedCount(blockType: BlockType): number {
    switch (blockType) {
      case 'character':
        return 3;
      case 'token':
        return 5;
      case 'line':
        return 8;
      case 'multi-line':
        return 12;
      case 'function':
        return 15;
      case 'file':
        return 20;
      default:
        return 8;
    }
  }

  /**
   * Get last line of text
   */
  private getLastLine(text: string): string {
    const lines = text.split('\n');
    return lines[lines.length - 1] ?? '';
  }

  /**
   * Check if line starts a function
   */
  private isFunctionStart(line: string, language: string): boolean {
    const patterns: Record<string, RegExp[]> = {
      typescript: [
        /^(async\s+)?function\s+/,
        /^(export\s+)?(async\s+)?function\s+/,
        /^(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/,
        /^(public|private|protected)?\s*(async\s+)?\w+\s*\(/,
      ],
      javascript: [
        /^(async\s+)?function\s+/,
        /^(export\s+)?(async\s+)?function\s+/,
        /^(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/,
      ],
      python: [
        /^(async\s+)?def\s+/,
        /^class\s+/,
      ],
      rust: [
        /^(pub\s+)?(async\s+)?fn\s+/,
        /^impl\s+/,
      ],
      go: [
        /^func\s+/,
        /^func\s+\([^)]+\)\s+\w+/,
      ],
    };

    const langPatterns = patterns[language] ?? [];
    return langPatterns.some(p => p.test(line));
  }

  /**
   * Check if line starts a block
   */
  private isBlockStart(line: string, language: string): boolean {
    const patterns: Record<string, RegExp[]> = {
      typescript: [
        /^if\s*\(/,
        /^for\s*\(/,
        /^while\s*\(/,
        /^switch\s*\(/,
        /^try\s*{?$/,
        /^class\s+/,
        /^interface\s+/,
        /^type\s+/,
      ],
      javascript: [
        /^if\s*\(/,
        /^for\s*\(/,
        /^while\s*\(/,
        /^switch\s*\(/,
        /^try\s*{?$/,
        /^class\s+/,
      ],
      python: [
        /^if\s+/,
        /^for\s+/,
        /^while\s+/,
        /^try\s*:/,
        /^with\s+/,
      ],
      rust: [
        /^if\s+/,
        /^for\s+/,
        /^while\s+/,
        /^match\s+/,
        /^struct\s+/,
        /^enum\s+/,
      ],
      go: [
        /^if\s+/,
        /^for\s+/,
        /^switch\s+/,
        /^select\s*{?$/,
        /^type\s+/,
      ],
    };

    const langPatterns = patterns[language] ?? [];
    return langPatterns.some(p => p.test(line));
  }

  /**
   * Check if completing a line
   */
  private isLineCompletion(line: string, language: string): boolean {
    // Line has content but doesn't end with statement terminator
    if (!line.trim()) return false;

    const terminators: Record<string, string[]> = {
      typescript: [';', '{', '}', ','],
      javascript: [';', '{', '}', ','],
      python: [':', ','],
      rust: [';', '{', '}', ','],
      go: ['{', '}', ','],
    };

    const langTerminators = terminators[language] ?? [';', '{', '}'];
    const lastChar = line.trim().slice(-1);

    return !langTerminators.includes(lastChar);
  }

  /**
   * Check if completing a token
   */
  private isTokenCompletion(line: string, language: string): boolean {
    // Mid-word completion
    const lastChar = line.slice(-1);
    return /[a-zA-Z0-9_]/.test(lastChar);
  }

  /**
   * JavaScript/TypeScript boundary check
   */
  private isJSBoundary(text: string): boolean {
    // Function end
    if (text.endsWith('}') && this.hasBalancedBraces(text)) {
      return true;
    }

    // Statement end
    if (text.endsWith(';')) return true;

    // Export statement end
    if (text.endsWith('};')) return true;

    return false;
  }

  /**
   * Python boundary check
   */
  private isPythonBoundary(text: string): boolean {
    // Function/class definition complete (blank line after)
    if (text.endsWith('\n\n')) return true;

    // Return statement
    if (/return\s+.+$/.test(text)) return true;

    return false;
  }

  /**
   * Rust boundary check
   */
  private isRustBoundary(text: string): boolean {
    if (text.endsWith('}') && this.hasBalancedBraces(text)) {
      return true;
    }
    if (text.endsWith(';')) return true;
    return false;
  }

  /**
   * Go boundary check
   */
  private isGoBoundary(text: string): boolean {
    if (text.endsWith('}') && this.hasBalancedBraces(text)) {
      return true;
    }
    // Go doesn't require semicolons
    if (text.endsWith('\n') && !text.trim().endsWith(',')) {
      return true;
    }
    return false;
  }

  /**
   * Generic boundary check
   */
  private isGenericBoundary(text: string): boolean {
    if (text.endsWith('}')) return true;
    if (text.endsWith(';')) return true;
    if (text.endsWith('\n\n')) return true;
    return false;
  }

  /**
   * Check if braces are balanced
   */
  private hasBalancedBraces(text: string): boolean {
    let count = 0;
    for (const char of text) {
      if (char === '{') count++;
      if (char === '}') count--;
    }
    return count === 0;
  }
}
