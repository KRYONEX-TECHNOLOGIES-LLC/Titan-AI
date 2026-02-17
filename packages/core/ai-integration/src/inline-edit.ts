/**
 * Inline Edit Service
 *
 * AI-powered inline code editing
 */

import { EventEmitter } from 'events';
import type {
  InlineEditRequest,
  InlineEditResult,
  InlineEditContext,
} from './types';
import type { Range, TextEdit } from '@titan/editor-core';

export interface InlineEditConfig {
  maxEditSize: number;
  includeContext: boolean;
  contextLines: number;
}

export class InlineEditService extends EventEmitter {
  private config: InlineEditConfig;
  private pendingEdits = new Map<string, InlineEditRequest>();

  constructor(config: Partial<InlineEditConfig> = {}) {
    super();
    this.config = {
      maxEditSize: config.maxEditSize ?? 500,
      includeContext: config.includeContext ?? true,
      contextLines: config.contextLines ?? 20,
    };
  }

  /**
   * Request an inline edit
   */
  async requestEdit(request: InlineEditRequest): Promise<InlineEditResult> {
    const editId = `edit-${Date.now()}`;
    this.pendingEdits.set(editId, request);
    this.emit('editRequested', editId, request);

    try {
      // Build the edit prompt
      const prompt = this.buildEditPrompt(request);

      // This would call the AI gateway in production
      // For now, return a placeholder
      const result: InlineEditResult = {
        edits: [],
        explanation: 'Edit completed',
        suggestedFollowUps: [],
      };

      this.emit('editCompleted', editId, result);
      return result;
    } catch (error) {
      this.emit('editFailed', editId, error);
      throw error;
    } finally {
      this.pendingEdits.delete(editId);
    }
  }

  /**
   * Build edit prompt
   */
  private buildEditPrompt(request: InlineEditRequest): string {
    const parts: string[] = [];

    parts.push(`Instruction: ${request.instruction}`);
    parts.push('');

    if (request.context) {
      parts.push(`Language: ${request.context.language}`);
      parts.push('');
      parts.push('Selected code:');
      parts.push('```');

      // Extract selected portion
      const lines = request.context.fileContent.split('\n');
      const selectedLines = lines.slice(
        request.range.start.line,
        request.range.end.line + 1
      );

      // Adjust first and last line for character offsets
      if (selectedLines.length > 0) {
        selectedLines[0] = selectedLines[0].slice(request.range.start.character);
        const lastIdx = selectedLines.length - 1;
        if (request.range.start.line === request.range.end.line) {
          selectedLines[lastIdx] = selectedLines[lastIdx].slice(
            0,
            request.range.end.character - request.range.start.character
          );
        } else {
          selectedLines[lastIdx] = selectedLines[lastIdx].slice(
            0,
            request.range.end.character
          );
        }
      }

      parts.push(selectedLines.join('\n'));
      parts.push('```');

      if (this.config.includeContext) {
        parts.push('');
        parts.push('Surrounding context:');
        parts.push('```');

        const contextStart = Math.max(0, request.range.start.line - this.config.contextLines);
        const contextEnd = Math.min(
          lines.length,
          request.range.end.line + this.config.contextLines + 1
        );

        parts.push(lines.slice(contextStart, contextEnd).join('\n'));
        parts.push('```');
      }
    }

    return parts.join('\n');
  }

  /**
   * Parse edit response into TextEdits
   */
  parseEditResponse(
    response: string,
    originalRange: Range
  ): TextEdit[] {
    // Extract code block from response
    const codeMatch = response.match(/```[\w]*\n([\s\S]*?)\n```/);
    if (!codeMatch) {
      return [];
    }

    const newText = codeMatch[1];

    return [
      {
        range: originalRange,
        newText,
      },
    ];
  }

  /**
   * Preview an edit
   */
  previewEdit(
    originalContent: string,
    edits: TextEdit[]
  ): string {
    let result = originalContent;

    // Sort edits in reverse order
    const sortedEdits = [...edits].sort((a, b) => {
      const lineDiff = b.range.start.line - a.range.start.line;
      if (lineDiff !== 0) return lineDiff;
      return b.range.start.character - a.range.start.character;
    });

    const lines = result.split('\n');

    for (const edit of sortedEdits) {
      const startLine = edit.range.start.line;
      const endLine = edit.range.end.line;
      const startChar = edit.range.start.character;
      const endChar = edit.range.end.character;

      // Get prefix from start line
      const prefix = lines[startLine]?.slice(0, startChar) ?? '';

      // Get suffix from end line
      const suffix = lines[endLine]?.slice(endChar) ?? '';

      // Create new lines
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
    }

    return lines.join('\n');
  }

  /**
   * Cancel pending edit
   */
  cancelEdit(editId: string): boolean {
    if (!this.pendingEdits.has(editId)) return false;
    this.pendingEdits.delete(editId);
    this.emit('editCancelled', editId);
    return true;
  }

  /**
   * Get pending edits
   */
  getPendingEdits(): InlineEditRequest[] {
    return Array.from(this.pendingEdits.values());
  }
}
