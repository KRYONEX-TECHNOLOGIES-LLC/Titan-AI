export type NavigationStrategy = 'direct' | 'targeted_search' | 'exploration';
export type SearchTool = 'grep_search' | 'semantic_search' | 'glob_search' | 'list_directory';

export interface NavigationContext {
  openTabs?: string[];
  recentlyEditedFiles?: Array<{ file: string; timestamp: number }>;
  recentlyViewedFiles?: string[];
  workspacePath?: string;
}

export interface ProposedToolCall {
  tool: SearchTool;
  args: Record<string, unknown>;
  reason: string;
}

export interface NavigationPlan {
  strategy: NavigationStrategy;
  toolCalls: ProposedToolCall[];
  found: boolean;
  resolvedPath?: string;
}

const IDENTIFIER_HINT = /\b([A-Za-z_][A-Za-z0-9_]{2,})\b/;
const GLOB_HINT = /[*?]|\.test\.|\.spec\.|\.\w+$/;

function normalizePath(input: string): string {
  return input.replace(/\\/g, '/').trim();
}

function inferIdentifier(query: string): string | null {
  const match = query.match(IDENTIFIER_HINT);
  return match ? match[1] : null;
}

export class ContextNavigator {
  resolveTarget(query: string, context: NavigationContext): NavigationPlan {
    const q = query.trim();
    if (!q) return { strategy: 'exploration', toolCalls: [], found: false };

    const open = (context.openTabs || []).map(normalizePath);
    const viewed = (context.recentlyViewedFiles || []).map(normalizePath);
    const edited = (context.recentlyEditedFiles || []).map((f) => normalizePath(f.file));
    const needle = normalizePath(q);

    const directMatch = [...open, ...viewed, ...edited].find((p) => p.endsWith(needle) || p.includes(needle));
    if (directMatch) {
      return {
        strategy: 'direct',
        toolCalls: [],
        found: true,
        resolvedPath: directMatch,
      };
    }

    if (GLOB_HINT.test(q) || /find file|filename|pattern/i.test(q)) {
      return {
        strategy: 'targeted_search',
        found: false,
        toolCalls: [
          {
            tool: 'glob_search',
            args: { pattern: q },
            reason: 'Pattern-like query, use glob_search first.',
          },
        ],
      };
    }

    const identifier = inferIdentifier(q);
    if (identifier && /function|class|variable|symbol|identifier|where is|definition|usage/i.test(q)) {
      return {
        strategy: 'targeted_search',
        found: false,
        toolCalls: [
          {
            tool: 'grep_search',
            args: { query: identifier },
            reason: 'Identifier-oriented query, use grep_search.',
          },
        ],
      };
    }

    if (/auth|logic|flow|where|how|concept|architecture|responsible/i.test(q)) {
      return {
        strategy: 'targeted_search',
        found: false,
        toolCalls: [
          {
            tool: 'semantic_search',
            args: { query: q },
            reason: 'Conceptual query, use semantic_search.',
          },
        ],
      };
    }

    return {
      strategy: 'exploration',
      found: false,
      toolCalls: [
        {
          tool: 'list_directory',
          args: { path: '.' },
          reason: 'No direct or targeted hit; explore as last resort.',
        },
      ],
    };
  }
}
