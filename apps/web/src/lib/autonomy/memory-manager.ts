import { attemptEditWithRetry } from './edit-retry';

export interface ADREntry {
  id: string;
  decision: string;
  rationale: string;
  date: string;
  taskId: string;
  status: string;
  references?: string;
}

export interface MemoryState {
  raw: string;
  entries: ADREntry[];
  memoryPath: string;
}

export interface MemoryExecutor {
  executeToolCall: (tool: string, args: Record<string, unknown>) => Promise<{
    success: boolean;
    output: string;
    error?: string;
    metadata?: Record<string, unknown>;
  }>;
  directEditApi?: {
    tools: {
      editFile: (path: string, oldString: string, newString: string) => Promise<{
        newContent: string;
        changed: boolean;
        bytesWritten?: number;
        beforeHash?: string;
        afterHash?: string;
        pathResolved?: string;
      }>;
      readFile: (path: string, opts?: { lineOffset?: number; lineLimit?: number }) => Promise<{ content: string; lineCount: number }>;
    };
  };
}

const PATH_CANDIDATES = [
  'docs/memory.md',
  'apps/desktop/docs/memory.md',
];

// Supplemental shared-context files (read in addition to the primary memory file)
const SYNC_FILE_CANDIDATES = [
  'docs/shared/AGENT-SYNC.md',
  'apps/desktop/docs/shared/AGENT-SYNC.md',
];

// Mistakes ledger — anti-patterns from past failures, auto-loaded every session
const MISTAKES_FILE_CANDIDATES = [
  'docs/shared/mistakes.md',
  'apps/desktop/docs/shared/mistakes.md',
];

function parseEntries(raw: string): ADREntry[] {
  const blocks = raw.split(/\n##\s+/).slice(1);
  const entries: ADREntry[] = [];
  for (const block of blocks) {
    const id = (block.match(/^(ADR-\d+):/m) || [])[1];
    if (!id) continue;
    entries.push({
      id,
      decision: (block.match(/\*\*Decision:\*\*\s*(.+)/) || [])[1] || '',
      rationale: (block.match(/\*\*Rationale:\*\*\s*(.+)/) || [])[1] || '',
      date: (block.match(/\*\*Date:\*\*\s*(.+)/) || [])[1] || '',
      taskId: (block.match(/\*\*Task ID:\*\*\s*(.+)/) || [])[1] || '',
      status: (block.match(/\*\*Status:\*\*\s*(.+)/) || [])[1] || '',
      references: (block.match(/\*\*References:\*\*\s*(.+)/) || [])[1] || undefined,
    });
  }
  return entries;
}

function nextAdrId(entries: ADREntry[]): string {
  const max = entries.reduce((m, e) => {
    const n = Number((e.id.match(/ADR-(\d+)/) || [])[1] || 0);
    return Math.max(m, n);
  }, 0);
  return `ADR-${String(max + 1).padStart(3, '0')}`;
}

export class MemoryManager {
  async readMemory(executeToolCall: MemoryExecutor['executeToolCall']): Promise<MemoryState> {
    let primaryRaw = '';
    let primaryPath = PATH_CANDIDATES[1];

    for (const path of PATH_CANDIDATES) {
      const res = await executeToolCall('read_file', { path });
      if (res.success && res.output) {
        primaryRaw = res.output;
        primaryPath = path;
        break;
      }
    }

    // Also read the shared AGENT-SYNC file and append it as supplemental context
    let syncRaw = '';
    for (const path of SYNC_FILE_CANDIDATES) {
      const res = await executeToolCall('read_file', { path });
      if (res.success && res.output) {
        syncRaw = `\n\n---\n[AGENT-SYNC — Shared Change Log]\n${res.output}`;
        break;
      }
    }

    // Also read the mistakes ledger so Titan never repeats past failures
    let mistakesRaw = '';
    for (const path of MISTAKES_FILE_CANDIDATES) {
      const res = await executeToolCall('read_file', { path });
      if (res.success && res.output) {
        mistakesRaw = `\n\n---\n[MISTAKES LEDGER — Anti-Patterns From Past Failures — READ BEFORE ACTING]\n${res.output}`;
        break;
      }
    }

    const combinedRaw = primaryRaw + syncRaw + mistakesRaw;
    return {
      raw: combinedRaw,
      entries: parseEntries(combinedRaw),
      memoryPath: primaryPath,
    };
  }

  async appendDecision(
    entry: Omit<ADREntry, 'id'> & { id?: string },
    executor: MemoryExecutor,
  ): Promise<{ success: boolean; id?: string; path?: string; error?: string }> {
    const state = await this.readMemory(executor.executeToolCall);
    const id = entry.id || nextAdrId(state.entries);
    const marker = '<!-- NEW ENTRIES BELOW THIS LINE -->';
    const newBlock = [
      `## ${id}: ${entry.decision}`,
      `- **Decision:** ${entry.decision}`,
      `- **Rationale:** ${entry.rationale}`,
      `- **Date:** ${entry.date}`,
      `- **Task ID:** ${entry.taskId}`,
      `- **Status:** ${entry.status}`,
      entry.references ? `- **References:** ${entry.references}` : '',
      '',
      marker,
    ].filter(Boolean).join('\n');

    if (executor.directEditApi) {
      const retry = await attemptEditWithRetry(
        executor.directEditApi,
        state.memoryPath,
        marker,
        newBlock,
        3,
      );
      return retry.success
        ? { success: true, id, path: state.memoryPath }
        : { success: false, error: retry.error, path: state.memoryPath };
    }

    const edit = await executor.executeToolCall('edit_file', {
      path: state.memoryPath,
      old_string: marker,
      new_string: newBlock,
    });
    return edit.success
      ? { success: true, id, path: state.memoryPath }
      : { success: false, error: edit.error || edit.output, path: state.memoryPath };
  }

  queryMemory(question: string, entries: ADREntry[]): ADREntry[] {
    const q = question.toLowerCase();
    const terms = q.split(/\s+/).filter((t) => t.length > 2);
    return entries
      .map((entry) => {
        const hay = `${entry.decision} ${entry.rationale} ${entry.references || ''}`.toLowerCase();
        const score = terms.reduce((sum, t) => sum + (hay.includes(t) ? 1 : 0), 0);
        return { entry, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.entry);
  }

  shouldReadMemory(userMessage: string): boolean {
    return /architecture|database|protocol|framework|infrastructure|migration|deployment|redis|cache|decision|adr|rationale|model|models|cost|price|pricing|stack|qwen|deepseek|gemini|opus|gpt|claude|tokens|token|build|electron|package\.json|electron-builder|ipc|railway|vercel|ci|github.actions|release|version|bump|tag|config|tsconfig|webpack|pnpm|npm|yarn|remember|forgot|last time|we discussed|we planned|we decided|we built|we changed|previously|before|earlier|history|what did|where did|project|feature|engine|module|component|system|improvement|refactor|fix|bug|issue|setup|install|plan|design|midnight|forge|phoenix|supreme|omega|titan|memecoin|trading|landing|auth|login|sign.?in|supabase|api|route|endpoint|sidebar|panel|brain|observatory|training|lab|status|working on|todo|task/i.test(userMessage);
  }
}
