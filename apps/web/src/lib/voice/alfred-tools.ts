/**
 * Alfred Tool-Calling System — LLM-driven function calling.
 *
 * Defines 26 tools in OpenAI function-calling format,
 * safety tiers, and server-side execution handlers.
 */

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
// Tier 1 (instant)  — no confirmation needed
// Tier 2 (confirm)  — requires user "proceed" before execution
// Tier 3 (forbidden) — refused outright

export const TOOL_SAFETY: Record<string, ToolSafety> = {
  browse_url: 'instant',
  web_search: 'instant',
  query_knowledge: 'instant',
  store_knowledge: 'instant',
  check_protocol_status: 'instant',
  check_harvest_status: 'instant',
  evaluate_performance: 'instant',
  read_file: 'instant',
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

  start_protocol: 'confirm',
  stop_protocol: 'confirm',
  start_harvester: 'confirm',
  stop_harvester: 'confirm',
  start_auto_learn: 'confirm',
  stop_auto_learn: 'confirm',
  git_commit: 'confirm',
  git_push: 'confirm',
  run_command: 'confirm',

  delete_file: 'forbidden',
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

  // ── IDE operations ──
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file in the project.',
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
      name: 'search_code',
      description: 'Search the codebase for a pattern or keyword.',
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
      name: 'run_command',
      description: 'Run a shell command in the project directory. Use with caution.',
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
      description: 'Run full codebase cartography: dependency graph, hotspot detection, architecture analysis, complexity metrics, and AI-powered insights. Returns architecture summary, risk assessment, and refactoring suggestions.',
      parameters: {
        type: 'object',
        properties: {
          forceRefresh: { type: 'string', description: 'Set to "true" to force a fresh scan even if cached results exist' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_codebase',
      description: 'Ask a natural language question about the codebase architecture, dependencies, complexity, or patterns. Uses cartography data and LLM intelligence to answer.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question about the codebase (e.g. "What are the most complex files?", "Show me circular dependencies", "What patterns does this project use?")' },
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
          url: { type: 'string', description: 'The URL to fetch and extract content from' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for information on a topic. Returns summarized results.',
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

  // ── Brain / knowledge operations ──
  {
    type: 'function',
    function: {
      name: 'store_knowledge',
      description: 'Store a piece of knowledge, skill, or observation in the brain.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The knowledge content to store' },
          category: { type: 'string', enum: ['knowledge', 'skill', 'idea', 'observation', 'mistake', 'finance', 'strategy', 'culture', 'research'], description: 'Category for the entry' },
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

  // ── Scraper / harvester control ──
  {
    type: 'function',
    function: {
      name: 'start_harvester',
      description: 'Start the Forge Harvester with 100 parallel workers to scrape knowledge sources.',
      parameters: {
        type: 'object',
        properties: {
          sources: { type: 'string', description: 'Comma-separated source types to harvest (leave empty for all)' },
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
      description: 'Check the status of the Forge Harvester — how many items collected, active workers, etc.',
      parameters: { type: 'object', properties: {} },
    },
  },

  // ── Self-improvement ──
  {
    type: 'function',
    function: {
      name: 'evaluate_performance',
      description: 'Evaluate recent conversation performance — review what worked, what failed, what knowledge gaps exist.',
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
      description: 'Start the autonomous background learning engine that researches topics and feeds knowledge into the brain.',
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

  // ── Git operations (confirm required) ──
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Create a git commit with the specified message. ALWAYS verify build passes first.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message (format: "vX.Y.Z: description")' },
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
];

// ═══ GET TOOL SCHEMA (filtered — excludes forbidden tools) ═══

export function getToolSchema(): AlfredToolSchema[] {
  return ALFRED_TOOLS.filter(t => {
    const safety = TOOL_SAFETY[t.function.name];
    return safety !== 'forbidden';
  });
}

export function isToolDangerous(name: string): boolean {
  return TOOL_SAFETY[name] === 'confirm';
}

// ═══ CLIENT STATE (sent from browser for tools that need local data) ═══

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

// ═══ SERVER-SIDE TOOL EXECUTION ═══

export async function executeToolServerSide(
  name: string,
  args: Record<string, unknown>,
  clientState?: ClientState,
): Promise<ToolExecResult> {
  switch (name) {
    case 'browse_url': {
      const input = String(args.url || '');
      if (!input) return { success: false, message: 'URL is required' };

      // Check if input is a valid URL — if not, auto-fallback to web_search
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
          const linkRegex = /<a class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
          const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
          let match;
          while ((match = snippetRegex.exec(html)) !== null && results.length < 5) {
            results.push(match[1].replace(/<[^>]+>/g, '').trim());
          }
          const links: string[] = [];
          while ((match = linkRegex.exec(html)) !== null && links.length < 5) {
            links.push(match[1]);
          }
          return {
            success: true,
            message: `Searched for "${input}":\n\n${results.length ? results.join('\n\n') : 'No results found.'}`,
            data: { query: input, resultCount: results.length, topLinks: links },
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
      const searchResult = await executeToolServerSide('web_search', { query: topic });
      if (depth === 'deep') {
        const moreResult = await executeToolServerSide('web_search', { query: `${topic} latest advances 2025 2026` });
        return {
          success: true,
          message: `[Primary]\n${searchResult.message}\n\n[Recent]\n${moreResult.message}`,
          data: { depth },
        };
      }
      return searchResult;
    }

    case 'store_knowledge': {
      const content = String(args.content || '');
      const category = String(args.category || 'knowledge');
      const importance = parseInt(String(args.importance || '5'), 10);
      if (!content) return { success: false, message: 'Content is required' };
      return {
        success: true,
        message: `Knowledge stored: [${category}] "${content.slice(0, 80)}..." (importance: ${importance})`,
        clientAction: {
          action: 'store_knowledge',
          params: { content, category, importance: String(importance) },
        },
      };
    }

    case 'query_knowledge': {
      const query = String(args.query || '');
      const category = args.category ? String(args.category) : undefined;
      return {
        success: true,
        message: `Brain query for "${query}"${category ? ` [${category}]` : ''} dispatched to client. Results will be in the next context update.`,
        clientAction: {
          action: 'query_knowledge',
          params: { query, ...(category ? { category } : {}) },
        },
      };
    }

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
        return {
          success: true,
          message: `Project structure:\n${files}`,
          data: { fileCount: files.split('\n').length },
        };
      }
      return { success: true, message: 'No project folder is currently loaded in the IDE. Ask the user to open a folder first.' };
    }

    case 'analyze_codebase': {
      const forceRefresh = String(args.forceRefresh || '') === 'true';
      return {
        success: true,
        message: 'Codebase cartography scan initiated. Results will be available momentarily.',
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
      return {
        success: true,
        message: `Stopping ${protocol} protocol`,
        clientAction: { action: actionName, params: {} },
      };
    }

    case 'start_harvester':
      return { success: true, message: 'Starting Forge Harvester with 100 parallel workers...', clientAction: { action: 'start_harvest', params: {} } };
    case 'stop_harvester':
      return { success: true, message: 'Stopping Forge Harvester.', clientAction: { action: 'stop_harvest', params: {} } };
    case 'check_harvest_status': {
      const hi = clientState?.harvestInfo;
      if (hi && hi.length > 5) {
        return { success: true, message: `Harvest status: ${hi}` };
      }
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
      } catch { /* API call failed, return default */ }
      return { success: true, message: 'Harvester status unavailable — it may not be running. Use start_harvester to begin.' };
    }
    case 'start_auto_learn':
      return { success: true, message: 'Auto-learner started — will research topics in background and store findings.', clientAction: { action: 'start_auto_learn', params: {} } };
    case 'stop_auto_learn':
      return { success: true, message: 'Auto-learner stopped.', clientAction: { action: 'stop_auto_learn', params: {} } };
    case 'check_markets':
      return { success: true, message: 'Market check initiated — results will populate from auto-learner.', clientAction: { action: 'check_markets', params: {} } };

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

    case 'read_file':
      return { success: true, message: `File read requested: ${args.path}`, clientAction: { action: 'read_file', params: { path: String(args.path || '') } } };
    case 'search_code':
      return { success: true, message: `Code search: ${args.query}`, clientAction: { action: 'search_code', params: { query: String(args.query || ''), scope: String(args.scope || '') } } };
    case 'run_command':
      return { success: true, message: `Command: ${args.command}`, clientAction: { action: 'run_command', params: { command: String(args.command || '') } } };

    case 'git_commit':
      return { success: true, message: `Git commit: ${args.message}`, clientAction: { action: 'git_commit', params: { message: String(args.message || '') } } };
    case 'git_push':
      return { success: true, message: 'Git push', clientAction: { action: 'git_push', params: {} } };

    default:
      return { success: false, message: `Unknown tool: ${name}` };
  }
}
