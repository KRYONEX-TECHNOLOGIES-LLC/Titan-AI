/**
 * Alfred Tool-Calling System — LLM-driven function calling.
 *
 * 40+ tools with REAL server-side execution.
 * IDE tools use Node.js fs/execSync directly (runs inside Next.js API route).
 * Enhancement modules (channels, devices, sessions) are wired in.
 */

import fs from 'fs';
import pathMod from 'path';
import { execSync } from 'child_process';

export type ToolSafety = 'instant' | 'confirm' | 'forbidden';

export interface AlfredToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required?: string[];
    };
  };
}

export interface ToolExecResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  clientAction?: { action: string; params: Record<string, string> };
}

// ═══ SAFETY TIERS ═══

export const TOOL_SAFETY: Record<string, ToolSafety> = {
  browse_url: 'instant',
  web_search: 'instant',
  query_knowledge: 'instant',
  store_knowledge: 'instant',
  check_protocol_status: 'instant',
  check_harvest_status: 'instant',
  evaluate_performance: 'instant',
  read_file: 'instant',
  list_directory: 'instant',
  glob_search: 'instant',
  search_code: 'instant',
  scan_project: 'instant',
  analyze_codebase: 'instant',
  query_codebase: 'instant',
  check_markets: 'instant',
  research_topic: 'instant',
  switch_mode: 'instant',
  mute_voice: 'instant',
  snooze_thoughts: 'instant',
  start_plan: 'instant',
  device_list: 'instant',
  device_status: 'instant',
  sessions_list: 'instant',

  create_file: 'confirm',
  edit_file: 'confirm',
  write_file: 'confirm',
  delete_file: 'confirm',
  run_command: 'confirm',
  start_protocol: 'confirm',
  stop_protocol: 'confirm',
  start_harvester: 'confirm',
  stop_harvester: 'confirm',
  start_auto_learn: 'confirm',
  stop_auto_learn: 'confirm',
  git_commit: 'confirm',
  git_push: 'confirm',
  message_send: 'confirm',
  device_command: 'confirm',
  sessions_spawn: 'confirm',

  force_push: 'forbidden',
};

// ═══ TOOL DEFINITIONS (OpenAI function-calling format) ═══

export const ALFRED_TOOLS: AlfredToolSchema[] = [
  // ── Protocol control ──
  {
    type: 'function',
    function: {
      name: 'start_protocol',
      description: 'Start a Titan AI protocol. midnight=autonomous builds, phoenix=5-role decomposition, supreme=zero-trust critical work, sniper=cheap parallel execution.',
      parameters: {
        type: 'object',
        properties: {
          protocol: { type: 'string', enum: ['midnight', 'phoenix', 'supreme', 'sniper'], description: 'Which protocol to start' },
          goal: { type: 'string', description: 'The task or goal for the protocol to work on' },
        },
        required: ['protocol', 'goal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stop_protocol',
      description: 'Stop a currently running protocol.',
      parameters: {
        type: 'object',
        properties: {
          protocol: { type: 'string', enum: ['midnight', 'phoenix', 'supreme', 'sniper'], description: 'Which protocol to stop' },
        },
        required: ['protocol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_protocol_status',
      description: 'Check the status of running protocols and current project progress.',
      parameters: { type: 'object', properties: {} },
    },
  },

  // ── File operations (REAL — server-side fs) ──
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file in the project. Returns numbered lines.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path from project root' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_file',
      description: 'Create a new file with the given content. Creates parent directories automatically.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to project root' },
          content: { type: 'string', description: 'Full file content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing an exact string with new content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to project root' },
          old_string: { type: 'string', description: 'Exact text to find and replace (must match file content)' },
          new_string: { type: 'string', description: 'Replacement text' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write/overwrite a file with new content. Creates parent directories automatically.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to project root' },
          content: { type: 'string', description: 'Full file content' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file. Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to project root' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and directories at a path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path relative to project root (default: root)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description: 'Search the codebase for a text pattern or keyword. Returns matching lines with file paths.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query or regex pattern' },
          scope: { type: 'string', description: 'Optional directory scope (e.g. "apps/web/src")' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob_search',
      description: 'Find files matching a glob/name pattern.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'File name pattern (e.g. "*.tsx", "package.json")' },
          path: { type: 'string', description: 'Base directory to search in' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command in the project directory. Use with caution — requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scan_project',
      description: 'Scan the project structure and return an overview of files, components, and architecture.',
      parameters: { type: 'object', properties: {} },
    },
  },

  // ── Codebase Cartography ──
  {
    type: 'function',
    function: {
      name: 'analyze_codebase',
      description: 'Run full codebase cartography: dependency graph, hotspot detection, architecture analysis, complexity metrics, and AI-powered insights.',
      parameters: {
        type: 'object',
        properties: {
          forceRefresh: { type: 'string', description: 'Set to "true" to force a fresh scan' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_codebase',
      description: 'Ask a natural language question about the codebase architecture, dependencies, complexity, or patterns.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question about the codebase' },
        },
        required: ['question'],
      },
    },
  },

  // ── Web research ──
  {
    type: 'function',
    function: {
      name: 'browse_url',
      description: 'Fetch and extract readable content from a URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for information on a topic.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'research_topic',
      description: 'Deep research on a topic — fetches multiple sources and synthesizes findings.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'The topic to research' },
          depth: { type: 'string', enum: ['quick', 'deep'], description: 'quick=2-3 sources, deep=5+ sources' },
        },
        required: ['topic'],
      },
    },
  },

  // ── Brain / knowledge ──
  {
    type: 'function',
    function: {
      name: 'store_knowledge',
      description: 'Store a piece of knowledge, skill, or observation in the brain.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The knowledge content to store' },
          category: { type: 'string', enum: ['knowledge', 'skill', 'idea', 'observation', 'mistake', 'finance', 'strategy', 'culture', 'research'], description: 'Category' },
          importance: { type: 'string', description: 'Importance score 1-10' },
        },
        required: ['content', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_knowledge',
      description: 'Search the brain knowledge base for relevant entries.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          category: { type: 'string', enum: ['knowledge', 'skill', 'idea', 'observation', 'mistake', 'finance', 'strategy', 'culture', 'research'], description: 'Optional category filter' },
        },
        required: ['query'],
      },
    },
  },

  // ── Scraper / harvester ──
  {
    type: 'function',
    function: {
      name: 'start_harvester',
      description: 'Start the Forge Harvester with 100 parallel workers to scrape knowledge sources.',
      parameters: {
        type: 'object',
        properties: {
          sources: { type: 'string', description: 'Comma-separated source types (leave empty for all)' },
          workers: { type: 'string', description: 'Number of parallel workers (default 100)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stop_harvester',
      description: 'Stop the currently running Forge Harvester.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_harvest_status',
      description: 'Check the Forge Harvester status.',
      parameters: { type: 'object', properties: {} },
    },
  },

  // ── Self-improvement ──
  {
    type: 'function',
    function: {
      name: 'evaluate_performance',
      description: 'Evaluate recent conversation performance — review what worked, what failed, what gaps exist.',
      parameters: { type: 'object', properties: {} },
    },
  },

  // ── Mode control ──
  {
    type: 'function',
    function: {
      name: 'switch_mode',
      description: 'Switch the IDE chat mode.',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['agent', 'chat', 'plan'], description: 'The mode to switch to' },
        },
        required: ['mode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_plan',
      description: 'Start Plan Mode with a specific goal or project name.',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'The plan goal or project name' },
        },
        required: ['goal'],
      },
    },
  },

  // ── Voice control ──
  {
    type: 'function',
    function: {
      name: 'mute_voice',
      description: 'Toggle voice mute on/off.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'snooze_thoughts',
      description: 'Snooze proactive thoughts for 30 minutes.',
      parameters: {
        type: 'object',
        properties: {
          minutes: { type: 'string', description: 'Duration in minutes (default 30)' },
        },
      },
    },
  },

  // ── Auto-learner ──
  {
    type: 'function',
    function: {
      name: 'start_auto_learn',
      description: 'Start the autonomous background learning engine.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stop_auto_learn',
      description: 'Stop the autonomous learning engine.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_markets',
      description: 'Check current financial market data and trends.',
      parameters: { type: 'object', properties: {} },
    },
  },

  // ── Git operations ──
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Stage all changes and create a git commit with the specified message.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message' },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_push',
      description: 'Push commits to the remote repository. NEVER force push.',
      parameters: { type: 'object', properties: {} },
    },
  },

  // ── Messaging (channels) ──
  {
    type: 'function',
    function: {
      name: 'message_send',
      description: 'Send a message via Telegram, Slack, or Discord. Requires channel configuration.',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', enum: ['telegram', 'slack', 'discord'], description: 'Messaging platform' },
          target: { type: 'string', description: 'Chat/channel ID to send to' },
          text: { type: 'string', description: 'Message text' },
        },
        required: ['channel', 'target', 'text'],
      },
    },
  },

  // ── Smart devices ──
  {
    type: 'function',
    function: {
      name: 'device_command',
      description: 'Send a command to a smart device (thermostat, light, camera, lock, etc.).',
      parameters: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device ID' },
          action: { type: 'string', enum: ['on', 'off', 'toggle', 'set_temp', 'set_brightness', 'set_color', 'set_volume', 'lock', 'unlock', 'snapshot', 'stream', 'arm', 'disarm', 'status', 'info'], description: 'Action to perform' },
          params: { type: 'string', description: 'JSON params for the action (e.g. {"temp": 72})' },
        },
        required: ['deviceId', 'action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'device_list',
      description: 'List all registered smart devices and their status.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'device_status',
      description: 'Get the current status of a specific smart device.',
      parameters: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device ID' },
        },
        required: ['deviceId'],
      },
    },
  },

  // ── Subagent sessions ──
  {
    type: 'function',
    function: {
      name: 'sessions_spawn',
      description: 'Spawn a background subagent to handle a specific task. Returns when complete.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Task description for the subagent' },
          label: { type: 'string', description: 'Short label for this session' },
          model: { type: 'string', description: 'Model to use (default: gemini-2.0-flash)' },
        },
        required: ['task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sessions_list',
      description: 'List recent subagent sessions and their results.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

// ═══ SCHEMA HELPERS ═══

export function getToolSchema(): AlfredToolSchema[] {
  return ALFRED_TOOLS.filter(t => {
    const safety = TOOL_SAFETY[t.function.name];
    return safety !== 'forbidden';
  });
}

export function isToolDangerous(name: string): boolean {
  return TOOL_SAFETY[name] === 'confirm';
}

// ═══ CLIENT STATE ═══

export interface ClientState {
  protocolStatus?: {
    mode: string;
    planName: string;
    total: number;
    completed: number;
    inProgress: number;
    failed: number;
    pending: number;
    taskSummary?: string;
  };
  projectFiles?: string;
  harvestInfo?: string;
}

// ═══ PATH & COMMAND SAFETY ═══

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//, /del\s+\/[fs]/, /format\s+c:/i,
  /mkfs/, /dd\s+if=/, /:(){ :\|:& };:/,
  />\s*\/dev\/sd/, /shutdown/, /reboot/,
];

function isPathSafe(filePath: string, workspace: string): boolean {
  const resolvedWorkspace = pathMod.resolve(workspace);
  const resolved = pathMod.resolve(resolvedWorkspace, filePath);
  return resolved.startsWith(resolvedWorkspace + pathMod.sep) || resolved === resolvedWorkspace;
}

function isCommandSafe(command: string): boolean {
  return !DANGEROUS_PATTERNS.some(p => p.test(command));
}

function expandBraces(cmd: string): string {
  let result = cmd;
  const braceRegex = /([^\s{]*)\{([^}]+)\}([^\s}]*)/g;
  let match;
  while ((match = braceRegex.exec(result)) !== null) {
    const prefix = match[1];
    const items = match[2].split(',').map(s => s.trim());
    const suffix = match[3];
    const expanded = items.map(item => `${prefix}${item}${suffix}`).join(' ');
    result = result.slice(0, match.index) + expanded + result.slice(match.index + match[0].length);
    braceRegex.lastIndex = 0;
  }
  result = result.replace(/mkdir\s+-p\s+(.+)/, (_, paths) => {
    const dirs = paths.trim().split(/\s+/);
    return dirs.map((d: string) => `New-Item -ItemType Directory -Force -Path "${d}"`).join('; ');
  });
  result = result.replace(/\btouch\s+(.+)/, (_, files) => {
    const fileList = files.trim().split(/\s+/);
    return fileList.map((f: string) => `New-Item -ItemType File -Force -Path "${f}"`).join('; ');
  });
  result = result.replace(/\s*&&\s*/g, '; ');
  result = result.replace(/\bcat\s+/g, 'Get-Content ');
  result = result.replace(/\bls\b(?!\s+-)/g, 'Get-ChildItem');
  result = result.replace(/\brm\s+-rf?\s+/g, 'Remove-Item -Recurse -Force ');
  result = result.replace(/\bcp\s+-r\s+/g, 'Copy-Item -Recurse ');
  result = result.replace(/\bmv\s+/g, 'Move-Item ');
  return result;
}

// ═══ SERVER-SIDE TOOL EXECUTION ═══

export async function executeToolServerSide(
  name: string,
  args: Record<string, unknown>,
  clientState?: ClientState,
  workspacePath?: string,
): Promise<ToolExecResult> {
  const workspace = workspacePath || process.cwd();

  switch (name) {
    // ────────────────────────────────────────────
    // FILE OPERATIONS (real fs)
    // ────────────────────────────────────────────

    case 'read_file': {
      const filePath = String(args.path || '');
      if (!filePath) return { success: false, message: 'path is required' };
      if (!isPathSafe(filePath, workspace)) return { success: false, message: 'Path outside workspace' };

      try {
        const fullPath = pathMod.resolve(workspace, filePath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        const numbered = lines.map((line, i) => `${i + 1}|${line}`).join('\n');
        const preview = numbered.length > 6000 ? numbered.slice(0, 6000) + '\n... (truncated)' : numbered;
        return {
          success: true,
          message: preview,
          data: { lines: lines.length, size: content.length, language: pathMod.extname(filePath).slice(1) },
        };
      } catch {
        return { success: false, message: `File not found: ${filePath}` };
      }
    }

    case 'create_file': {
      const filePath = String(args.path || '');
      const content = String(args.content ?? '');
      if (!filePath) return { success: false, message: 'path is required' };
      if (!isPathSafe(filePath, workspace)) return { success: false, message: 'Path outside workspace' };

      try {
        const fullPath = pathMod.resolve(workspace, filePath);
        fs.mkdirSync(pathMod.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
        return { success: true, message: `File created: ${filePath} (${content.length} bytes)`, data: { size: content.length } };
      } catch (e) {
        return { success: false, message: `Create failed: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case 'edit_file': {
      const filePath = String(args.path || '');
      const oldStr = args.old_string as string;
      const newStr = args.new_string as string;
      if (!filePath || oldStr === undefined || newStr === undefined) {
        return { success: false, message: 'path, old_string, and new_string are required' };
      }
      if (!isPathSafe(filePath, workspace)) return { success: false, message: 'Path outside workspace' };

      try {
        const fullPath = pathMod.resolve(workspace, filePath);
        let content = fs.readFileSync(fullPath, 'utf-8');
        if (!content.includes(oldStr)) {
          return { success: false, message: 'old_string not found in file. Content may have changed.' };
        }
        content = content.replace(oldStr, newStr);
        fs.writeFileSync(fullPath, content, 'utf-8');
        return { success: true, message: `File edited: ${filePath}`, data: { linesChanged: newStr.split('\n').length } };
      } catch (e) {
        return { success: false, message: `Edit failed: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case 'write_file': {
      const filePath = String(args.path || '');
      const content = String(args.content ?? '');
      if (!filePath) return { success: false, message: 'path is required' };
      if (!isPathSafe(filePath, workspace)) return { success: false, message: 'Path outside workspace' };

      try {
        const fullPath = pathMod.resolve(workspace, filePath);
        fs.mkdirSync(pathMod.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
        return { success: true, message: `File written: ${filePath} (${content.length} bytes)`, data: { size: content.length } };
      } catch (e) {
        return { success: false, message: `Write failed: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case 'delete_file': {
      const filePath = String(args.path || '');
      if (!filePath) return { success: false, message: 'path is required' };
      if (!isPathSafe(filePath, workspace)) return { success: false, message: 'Path outside workspace' };

      try {
        const fullPath = pathMod.resolve(workspace, filePath);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
          return { success: true, message: `Directory deleted: ${filePath}` };
        }
        fs.unlinkSync(fullPath);
        return { success: true, message: `File deleted: ${filePath}` };
      } catch (e) {
        return { success: false, message: `Delete failed: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case 'list_directory': {
      const dirPath = String(args.path || '.');
      if (!isPathSafe(dirPath, workspace)) return { success: false, message: 'Path outside workspace' };

      try {
        const fullPath = pathMod.resolve(workspace, dirPath);
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        const listing = entries
          .filter(e => !e.name.startsWith('.') || e.name === '.env' || e.name === '.gitignore')
          .map(e => {
            if (e.isDirectory()) return `dir  ${e.name}/`;
            try {
              const stats = fs.statSync(pathMod.join(fullPath, e.name));
              return `file ${e.name}  (${stats.size} bytes)`;
            } catch {
              return `file ${e.name}`;
            }
          })
          .join('\n');
        return { success: true, message: listing || '(empty directory)', data: { count: entries.length } };
      } catch {
        return { success: false, message: `Directory not found: ${dirPath}` };
      }
    }

    case 'search_code': {
      const query = String(args.query || '');
      const scope = String(args.scope || '.');
      if (!query) return { success: false, message: 'query is required' };

      try {
        const searchPath = pathMod.resolve(workspace, scope);
        const isWin = process.platform === 'win32';
        const cmd = isWin
          ? `findstr /S /N /C:"${query}" "${searchPath}\\*.*"`
          : `grep -rn "${query}" "${searchPath}" --include="*.{ts,tsx,js,jsx,py,rs,go,java,c,cpp,h,md,json,yaml,yml}" 2>/dev/null | head -100`;
        const result = execSync(cmd, { encoding: 'utf-8', timeout: 15000, maxBuffer: 1024 * 1024 });
        const trimmed = result.slice(0, 6000);
        return { success: true, message: trimmed || 'No results found' };
      } catch {
        return { success: true, message: 'No results found' };
      }
    }

    case 'glob_search': {
      const pattern = String(args.pattern || '');
      const basePath = String(args.path || '.');
      if (!pattern) return { success: false, message: 'pattern is required' };

      try {
        const fullPath = pathMod.resolve(workspace, basePath);
        const isWin = process.platform === 'win32';
        const cmd = isWin
          ? `dir /S /B "${fullPath}\\${pattern}" 2>nul`
          : `find "${fullPath}" -name "${pattern}" -type f 2>/dev/null | head -100`;
        const result = execSync(cmd, { encoding: 'utf-8', timeout: 10000, maxBuffer: 512 * 1024 });
        const files = result.trim().split('\n').filter(Boolean).map(f => pathMod.relative(workspace, f));
        return { success: true, message: files.join('\n') || 'No files found' };
      } catch {
        return { success: true, message: 'No files found' };
      }
    }

    case 'run_command': {
      let command = String(args.command || '');
      if (!command) return { success: false, message: 'command is required' };
      if (!isCommandSafe(command)) return { success: false, message: 'Command blocked by safety filter' };

      const isWin = process.platform === 'win32';
      if (isWin) command = expandBraces(command);

      try {
        const shellOpts: Record<string, unknown> = {
          cwd: workspace,
          encoding: 'utf-8',
          timeout: 30000,
          maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, FORCE_COLOR: '0' },
        };
        if (isWin) {
          shellOpts.shell = 'powershell.exe';
          command = `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force; ${command}`;
        }
        const result = execSync(command, shellOpts as Parameters<typeof execSync>[1]);
        return { success: true, message: (result as string).slice(0, 8000) };
      } catch (e: unknown) {
        const err = e as { stdout?: Buffer; stderr?: Buffer; status?: number };
        const stdout = err.stdout?.toString() || '';
        const stderr = err.stderr?.toString() || '';
        return { success: false, message: `Exit code ${err.status || 1}:\n${stdout}\n${stderr}`.slice(0, 8000) };
      }
    }

    // ────────────────────────────────────────────
    // GIT OPERATIONS (real execSync)
    // ────────────────────────────────────────────

    case 'git_commit': {
      const message = String(args.message || '');
      if (!message) return { success: false, message: 'Commit message is required' };

      try {
        execSync('git add -A', { cwd: workspace, encoding: 'utf-8', timeout: 15000 });
        const safeMsg = message.replace(/"/g, '\\"');
        const result = execSync(`git commit -m "${safeMsg}"`, { cwd: workspace, encoding: 'utf-8', timeout: 15000 });
        return { success: true, message: `Committed: ${result.trim().split('\n')[0]}` };
      } catch (e: unknown) {
        const err = e as { stdout?: Buffer; stderr?: Buffer };
        const out = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
        if (out.includes('nothing to commit')) return { success: true, message: 'Nothing to commit — working tree clean.' };
        return { success: false, message: `Git commit failed: ${out.slice(0, 500)}` };
      }
    }

    case 'git_push': {
      try {
        const result = execSync('git push origin HEAD', { cwd: workspace, encoding: 'utf-8', timeout: 30000 });
        return { success: true, message: `Pushed: ${result.trim() || 'Success'}` };
      } catch (e: unknown) {
        const err = e as { stdout?: Buffer; stderr?: Buffer };
        const out = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
        if (out.includes('Everything up-to-date')) return { success: true, message: 'Already up-to-date.' };
        return { success: false, message: `Git push failed: ${out.slice(0, 500)}` };
      }
    }

    // ────────────────────────────────────────────
    // WEB RESEARCH (unchanged — already works)
    // ────────────────────────────────────────────

    case 'browse_url': {
      const input = String(args.url || '');
      if (!input) return { success: false, message: 'URL is required' };

      let targetUrl = input;
      let isSearch = false;
      try {
        const parsed = new URL(input);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
      } catch {
        isSearch = true;
        targetUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input)}`;
      }

      try {
        const res = await fetch(targetUrl, {
          headers: { 'User-Agent': 'TitanAI-Alfred/1.0' },
          signal: AbortSignal.timeout(10000),
        });
        const html = await res.text();

        if (isSearch) {
          const results: string[] = [];
          const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
          let match;
          while ((match = snippetRegex.exec(html)) !== null && results.length < 5) {
            results.push(match[1].replace(/<[^>]+>/g, '').trim());
          }
          return {
            success: true,
            message: `Searched for "${input}":\n\n${results.length ? results.join('\n\n') : 'No results found.'}`,
          };
        }

        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        const title = titleMatch?.[1]?.trim() || targetUrl;
        const textContent = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 3000);
        return { success: true, message: `Fetched "${title}"`, data: { title, content: textContent } };
      } catch (err) {
        return { success: false, message: `Failed to fetch: ${err instanceof Error ? err.message : 'unknown error'}` };
      }
    }

    case 'web_search': {
      const query = String(args.query || '');
      if (!query) return { success: false, message: 'Query is required' };
      try {
        const encoded = encodeURIComponent(query);
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
          headers: { 'User-Agent': 'TitanAI-Alfred/1.0' },
          signal: AbortSignal.timeout(10000),
        });
        const html = await res.text();
        const results: string[] = [];
        const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        while ((match = snippetRegex.exec(html)) !== null && results.length < 5) {
          results.push(match[1].replace(/<[^>]+>/g, '').trim());
        }
        return {
          success: true,
          message: results.length ? results.join('\n\n') : `No results found for "${query}"`,
          data: { resultCount: results.length },
        };
      } catch (err) {
        return { success: false, message: `Search failed: ${err instanceof Error ? err.message : 'unknown error'}` };
      }
    }

    case 'research_topic': {
      const topic = String(args.topic || '');
      const depth = String(args.depth || 'quick');
      if (!topic) return { success: false, message: 'Topic is required' };
      const searchResult = await executeToolServerSide('web_search', { query: topic }, clientState, workspacePath);
      if (depth === 'deep') {
        const moreResult = await executeToolServerSide('web_search', { query: `${topic} latest advances 2025 2026` }, clientState, workspacePath);
        return {
          success: true,
          message: `[Primary]\n${searchResult.message}\n\n[Recent]\n${moreResult.message}`,
          data: { depth },
        };
      }
      return searchResult;
    }

    // ────────────────────────────────────────────
    // KNOWLEDGE (client action — stores on client)
    // ────────────────────────────────────────────

    case 'store_knowledge': {
      const content = String(args.content || '');
      const category = String(args.category || 'knowledge');
      const importance = parseInt(String(args.importance || '5'), 10);
      if (!content) return { success: false, message: 'Content is required' };
      return {
        success: true,
        message: `Knowledge stored: [${category}] "${content.slice(0, 80)}..." (importance: ${importance})`,
        clientAction: { action: 'store_knowledge', params: { content, category, importance: String(importance) } },
      };
    }

    case 'query_knowledge': {
      const query = String(args.query || '');
      const category = args.category ? String(args.category) : undefined;
      return {
        success: true,
        message: `Brain query for "${query}"${category ? ` [${category}]` : ''} dispatched to client.`,
        clientAction: { action: 'query_knowledge', params: { query, ...(category ? { category } : {}) } },
      };
    }

    // ────────────────────────────────────────────
    // PROTOCOL CONTROL (client actions)
    // ────────────────────────────────────────────

    case 'check_protocol_status': {
      const ps = clientState?.protocolStatus;
      if (ps && ps.total > 0) {
        return {
          success: true,
          message: `Mode: ${ps.mode} | Plan "${ps.planName}": ${ps.completed}/${ps.total} done, ${ps.inProgress} active, ${ps.failed} failed, ${ps.pending} pending.${ps.taskSummary ? '\nRecent tasks: ' + ps.taskSummary : ''}`,
          data: ps as unknown as Record<string, unknown>,
        };
      }
      return { success: true, message: 'No active plan or protocol running. All systems idle.' };
    }

    case 'scan_project': {
      const files = clientState?.projectFiles;
      if (files && files.length > 10) {
        return { success: true, message: `Project structure:\n${files}`, data: { fileCount: files.split('\n').length } };
      }
      // Fallback: scan workspace directory server-side
      try {
        const entries = fs.readdirSync(workspace, { withFileTypes: true });
        const tree = entries
          .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
          .map(e => e.isDirectory() ? `dir  ${e.name}/` : `file ${e.name}`)
          .join('\n');
        return { success: true, message: `Project structure:\n${tree}`, data: { fileCount: entries.length } };
      } catch {
        return { success: true, message: 'No project folder loaded.' };
      }
    }

    case 'analyze_codebase': {
      const forceRefresh = String(args.forceRefresh || '') === 'true';
      return {
        success: true,
        message: 'Codebase cartography scan initiated.',
        clientAction: { action: 'analyze_codebase', params: { forceRefresh: String(forceRefresh) } },
      };
    }

    case 'query_codebase': {
      const question = String(args.question || '');
      if (!question) return { success: false, message: 'A question is required.' };
      return {
        success: true,
        message: `Querying codebase intelligence: "${question}"`,
        clientAction: { action: 'query_codebase', params: { question } },
      };
    }

    case 'start_protocol': {
      const protocol = String(args.protocol || '');
      const goal = String(args.goal || '');
      const actionName = protocol === 'midnight' ? 'start_midnight' : `start_${protocol}`;
      return {
        success: true,
        message: `Starting ${protocol} protocol: ${goal}`,
        clientAction: { action: actionName, params: { description: goal, goal } },
      };
    }

    case 'stop_protocol': {
      const protocol = String(args.protocol || '');
      const actionName = protocol === 'midnight' ? 'stop_midnight' : `stop_${protocol}`;
      return { success: true, message: `Stopping ${protocol} protocol`, clientAction: { action: actionName, params: {} } };
    }

    case 'start_harvester':
      return { success: true, message: 'Starting Forge Harvester...', clientAction: { action: 'start_harvest', params: {} } };
    case 'stop_harvester':
      return { success: true, message: 'Stopping Forge Harvester.', clientAction: { action: 'stop_harvest', params: {} } };
    case 'check_harvest_status': {
      const hi = clientState?.harvestInfo;
      if (hi && hi.length > 5) return { success: true, message: `Harvest status: ${hi}` };
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/forge/harvest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status' }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          return { success: true, message: `Harvest: ${JSON.stringify(data).slice(0, 800)}`, data };
        }
      } catch { /* fall through */ }
      return { success: true, message: 'Harvester not running. Use start_harvester to begin.' };
    }

    case 'start_auto_learn':
      return { success: true, message: 'Auto-learner started.', clientAction: { action: 'start_auto_learn', params: {} } };
    case 'stop_auto_learn':
      return { success: true, message: 'Auto-learner stopped.', clientAction: { action: 'stop_auto_learn', params: {} } };
    case 'check_markets':
      return { success: true, message: 'Market check initiated.', clientAction: { action: 'check_markets', params: {} } };

    case 'switch_mode':
      return { success: true, message: `Switching to ${args.mode} mode`, clientAction: { action: 'switch_mode', params: { mode: String(args.mode || 'agent') } } };
    case 'start_plan':
      return { success: true, message: `Starting plan: ${args.goal}`, clientAction: { action: 'start_plan', params: { goal: String(args.goal || '') } } };
    case 'mute_voice':
      return { success: true, message: 'Toggling voice', clientAction: { action: 'mute_voice', params: {} } };
    case 'snooze_thoughts':
      return { success: true, message: 'Snoozing thoughts', clientAction: { action: 'snooze_thoughts', params: {} } };

    case 'evaluate_performance':
      return { success: true, message: 'Performance evaluation requested', clientAction: { action: 'evaluate_performance', params: {} } };

    // ────────────────────────────────────────────
    // MESSAGING (channel adapters)
    // ────────────────────────────────────────────

    case 'message_send': {
      const channel = String(args.channel || '');
      const target = String(args.target || '');
      const text = String(args.text || '');
      if (!channel || !target || !text) return { success: false, message: 'channel, target, and text are required' };

      try {
        const { channelManager } = await import('@/lib/channels/channel-adapter');
        const result = await channelManager.send({
          channel: channel as 'telegram' | 'slack' | 'discord',
          target,
          text,
        });
        if (result.success) {
          return { success: true, message: `Message sent via ${channel} to ${target} (id: ${result.messageId || 'ok'})` };
        }
        return { success: false, message: `Send failed: ${result.error || 'Unknown error'}` };
      } catch (err) {
        return { success: false, message: `Messaging error: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    // ────────────────────────────────────────────
    // SMART DEVICES (device bridge)
    // ────────────────────────────────────────────

    case 'device_command': {
      const deviceId = String(args.deviceId || '');
      const action = String(args.action || '');
      if (!deviceId || !action) return { success: false, message: 'deviceId and action are required' };

      let params: Record<string, unknown> | undefined;
      if (args.params) {
        try {
          params = typeof args.params === 'string' ? JSON.parse(args.params) : args.params as Record<string, unknown>;
        } catch { params = undefined; }
      }

      try {
        const { deviceBridge } = await import('@/lib/devices/device-bridge');
        type DA = Parameters<typeof deviceBridge.execute>[1];
        const result = await deviceBridge.execute(deviceId, action as DA, params);
        if (result.success) {
          return { success: true, message: result.output || `${action} executed on ${deviceId}`, data: result.data };
        }
        return { success: false, message: result.error || `Device command failed` };
      } catch (err) {
        return { success: false, message: `Device error: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    case 'device_list': {
      try {
        const { deviceBridge } = await import('@/lib/devices/device-bridge');
        const devices = await deviceBridge.listAll();
        if (devices.length === 0) return { success: true, message: 'No devices registered. Configure devices in Settings > Devices.' };
        const list = devices.map(d => `${d.id} | ${d.name} | ${d.type} | ${d.location} | ${d.online ? 'online' : 'offline'}`).join('\n');
        return { success: true, message: `Devices (${devices.length}):\n${list}`, data: { count: devices.length } };
      } catch (err) {
        return { success: false, message: `Device list error: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    case 'device_status': {
      const deviceId = String(args.deviceId || '');
      if (!deviceId) return { success: false, message: 'deviceId is required' };

      try {
        const { deviceBridge } = await import('@/lib/devices/device-bridge');
        const status = await deviceBridge.getStatus(deviceId);
        return { success: true, message: `Status for ${deviceId}: ${JSON.stringify(status).slice(0, 800)}`, data: status as Record<string, unknown> };
      } catch (err) {
        return { success: false, message: `Status error: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    // ────────────────────────────────────────────
    // SUBAGENT SESSIONS
    // ────────────────────────────────────────────

    case 'sessions_spawn': {
      const task = String(args.task || '');
      if (!task) return { success: false, message: 'task is required' };

      try {
        const { spawnAgent } = await import('@/lib/agents/session-spawn');
        const session = await spawnAgent({
          task,
          label: args.label ? String(args.label) : undefined,
          model: args.model ? String(args.model) : undefined,
        });
        if (session.status === 'completed') {
          return { success: true, message: `Agent completed: ${session.result?.slice(0, 2000) || 'Done'}`, data: { sessionId: session.id } };
        }
        return { success: false, message: `Agent ${session.status}: ${session.error || 'Unknown error'}`, data: { sessionId: session.id } };
      } catch (err) {
        return { success: false, message: `Spawn error: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    case 'sessions_list': {
      try {
        const { listSessions } = await import('@/lib/agents/session-spawn');
        const sessions = listSessions(10);
        if (sessions.length === 0) return { success: true, message: 'No recent sessions.' };
        const list = sessions.map(s => `${s.id} | ${s.label} | ${s.status} | ${s.result?.slice(0, 60) || s.error?.slice(0, 60) || ''}`).join('\n');
        return { success: true, message: `Recent sessions (${sessions.length}):\n${list}` };
      } catch (err) {
        return { success: false, message: `Sessions error: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    default:
      return { success: false, message: `Unknown tool: ${name}` };
  }
}
