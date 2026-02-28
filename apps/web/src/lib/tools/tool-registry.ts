/**
 * Titan Unified Tool Registry
 *
 * Central registry of all tools available to Alfred, chat, plan, and protocols.
 * Inspired by OpenClaw's tool system but unified across all Titan surfaces.
 * Supports tool profiles, allow/deny, and Nexus add-on registration.
 */

export type ToolCategory =
  | 'fs'
  | 'runtime'
  | 'memory'
  | 'web'
  | 'browser'
  | 'messaging'
  | 'automation'
  | 'sessions'
  | 'devices'
  | 'protocol'
  | 'git'
  | 'knowledge'
  | 'nexus';

export type ToolProfile = 'full' | 'coding' | 'messaging' | 'minimal' | 'readonly';

export type SafetyTier = 1 | 2 | 3;

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  safetyTier: SafetyTier;
  parameters: ToolParameter[];
  handler?: (args: Record<string, unknown>) => Promise<ToolResult>;
  source: 'builtin' | 'system-control' | 'nexus';
  enabled: boolean;
  requiresConfirmation: boolean;
}

export interface ToolResult {
  success: boolean;
  output: string;
  data?: unknown;
  error?: string;
}

const PROFILE_ALLOWLISTS: Record<ToolProfile, ToolCategory[]> = {
  full: ['fs', 'runtime', 'memory', 'web', 'browser', 'messaging', 'automation', 'sessions', 'devices', 'protocol', 'git', 'knowledge', 'nexus'],
  coding: ['fs', 'runtime', 'memory', 'web', 'git', 'knowledge', 'sessions'],
  messaging: ['messaging', 'memory', 'knowledge'],
  minimal: ['memory', 'knowledge'],
  readonly: ['memory', 'knowledge', 'web'],
};

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private activeProfile: ToolProfile = 'full';
  private denyList: Set<string> = new Set();
  private allowOverrides: Set<string> = new Set();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
  }

  unregister(toolId: string): void {
    this.tools.delete(toolId);
  }

  setProfile(profile: ToolProfile): void {
    this.activeProfile = profile;
  }

  deny(toolId: string): void {
    this.denyList.add(toolId);
  }

  allow(toolId: string): void {
    this.allowOverrides.add(toolId);
  }

  getAvailable(): ToolDefinition[] {
    const allowedCategories = PROFILE_ALLOWLISTS[this.activeProfile];
    return Array.from(this.tools.values()).filter(t => {
      if (!t.enabled) return false;
      if (this.denyList.has(t.id)) return false;
      if (this.allowOverrides.has(t.id)) return true;
      return allowedCategories.includes(t.category);
    });
  }

  get(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  getByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getAvailable().filter(t => t.category === category);
  }

  async execute(toolId: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(toolId);
    if (!tool) return { success: false, output: '', error: `Unknown tool: ${toolId}` };
    if (!tool.enabled) return { success: false, output: '', error: `Tool disabled: ${toolId}` };
    if (this.denyList.has(toolId)) return { success: false, output: '', error: `Tool denied: ${toolId}` };

    const allowedCategories = PROFILE_ALLOWLISTS[this.activeProfile];
    if (!allowedCategories.includes(tool.category) && !this.allowOverrides.has(toolId)) {
      return { success: false, output: '', error: `Tool "${toolId}" not allowed under "${this.activeProfile}" profile` };
    }

    if (!tool.handler) {
      return { success: false, output: '', error: `Tool "${toolId}" has no handler registered` };
    }

    try {
      return await tool.handler(args);
    } catch (err) {
      return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
    }
  }

  toSchemaList(): Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
    return this.getAvailable().map(t => ({
      type: 'function' as const,
      function: {
        name: t.id,
        description: t.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            t.parameters.map(p => [p.name, { type: p.type, description: p.description, ...(p.default !== undefined ? { default: p.default } : {}) }])
          ),
          required: t.parameters.filter(p => p.required).map(p => p.name),
        },
      },
    }));
  }

  serializeForPrompt(): string {
    const available = this.getAvailable();
    if (available.length === 0) return '';
    const groups = new Map<ToolCategory, ToolDefinition[]>();
    for (const t of available) {
      const list = groups.get(t.category) || [];
      list.push(t);
      groups.set(t.category, list);
    }
    const lines: string[] = ['[AVAILABLE TOOLS]'];
    for (const [cat, tools] of groups) {
      lines.push(`\n${cat.toUpperCase()}:`);
      for (const t of tools) {
        const params = t.parameters.map(p => `${p.name}${p.required ? '*' : ''}`).join(', ');
        const tier = t.safetyTier === 1 ? '' : t.safetyTier === 2 ? ' [confirm]' : ' [FORBIDDEN]';
        lines.push(`  ${t.id}(${params})${tier} — ${t.description}`);
      }
    }
    return lines.join('\n');
  }

  getStats(): { total: number; enabled: number; byCategory: Record<string, number> } {
    const all = Array.from(this.tools.values());
    const byCategory: Record<string, number> = {};
    for (const t of all) {
      byCategory[t.category] = (byCategory[t.category] || 0) + 1;
    }
    return { total: all.length, enabled: all.filter(t => t.enabled).length, byCategory };
  }
}

export const titanToolRegistry = new ToolRegistry();

// ═══ Register built-in tools ═══

const BUILTIN_TOOLS: ToolDefinition[] = [
  // ── FS ──
  { id: 'read_file', name: 'Read File', description: 'Read a file from the workspace', category: 'fs', safetyTier: 1, parameters: [{ name: 'path', type: 'string', description: 'File path', required: true }], source: 'builtin', enabled: true, requiresConfirmation: false },
  { id: 'create_file', name: 'Create File', description: 'Create a new file with content', category: 'fs', safetyTier: 2, parameters: [{ name: 'path', type: 'string', description: 'File path', required: true }, { name: 'content', type: 'string', description: 'File content', required: true }], source: 'builtin', enabled: true, requiresConfirmation: false },
  { id: 'edit_file', name: 'Edit File', description: 'Edit a file by replacing a string', category: 'fs', safetyTier: 2, parameters: [{ name: 'path', type: 'string', description: 'File path', required: true }, { name: 'old_string', type: 'string', description: 'String to replace', required: true }, { name: 'new_string', type: 'string', description: 'Replacement', required: true }], source: 'builtin', enabled: true, requiresConfirmation: false },
  { id: 'delete_file', name: 'Delete File', description: 'Delete a file or directory', category: 'fs', safetyTier: 2, parameters: [{ name: 'path', type: 'string', description: 'Path', required: true }], source: 'builtin', enabled: true, requiresConfirmation: true },
  { id: 'list_directory', name: 'List Directory', description: 'List files and directories', category: 'fs', safetyTier: 1, parameters: [{ name: 'path', type: 'string', description: 'Directory path', required: false, default: '.' }], source: 'builtin', enabled: true, requiresConfirmation: false },

  // ── Runtime ──
  { id: 'run_command', name: 'Run Command', description: 'Run a shell command', category: 'runtime', safetyTier: 2, parameters: [{ name: 'command', type: 'string', description: 'Shell command', required: true }, { name: 'cwd', type: 'string', description: 'Working directory', required: false }], source: 'builtin', enabled: true, requiresConfirmation: true },

  // ── Web ──
  { id: 'web_search', name: 'Web Search', description: 'Search the web for information', category: 'web', safetyTier: 1, parameters: [{ name: 'query', type: 'string', description: 'Search query', required: true }, { name: 'count', type: 'number', description: 'Number of results (1-10)', required: false, default: 5 }], source: 'builtin', enabled: true, requiresConfirmation: false },
  { id: 'web_fetch', name: 'Web Fetch', description: 'Fetch and extract content from a URL', category: 'web', safetyTier: 1, parameters: [{ name: 'url', type: 'string', description: 'URL to fetch', required: true }, { name: 'maxChars', type: 'number', description: 'Max chars to return', required: false, default: 30000 }], source: 'builtin', enabled: true, requiresConfirmation: false },
  { id: 'browse_url', name: 'Browse URL', description: 'Open and browse a URL in the browser', category: 'browser', safetyTier: 1, parameters: [{ name: 'url', type: 'string', description: 'URL', required: true }], source: 'builtin', enabled: true, requiresConfirmation: false },

  // ── Memory ──
  { id: 'memory_search', name: 'Memory Search', description: 'Search Titan persistent memory and Brain', category: 'memory', safetyTier: 1, parameters: [{ name: 'query', type: 'string', description: 'Search query', required: true }], source: 'builtin', enabled: true, requiresConfirmation: false },
  { id: 'store_knowledge', name: 'Store Knowledge', description: 'Store new knowledge in the Brain', category: 'knowledge', safetyTier: 1, parameters: [{ name: 'content', type: 'string', description: 'Knowledge content', required: true }, { name: 'category', type: 'string', description: 'Category', required: false, default: 'knowledge' }, { name: 'importance', type: 'number', description: 'Importance 1-10', required: false, default: 5 }], source: 'builtin', enabled: true, requiresConfirmation: false },
  { id: 'query_knowledge', name: 'Query Knowledge', description: 'Query the Brain for stored knowledge', category: 'knowledge', safetyTier: 1, parameters: [{ name: 'query', type: 'string', description: 'Query', required: true }, { name: 'category', type: 'string', description: 'Filter by category', required: false }], source: 'builtin', enabled: true, requiresConfirmation: false },

  // ── Protocol ──
  { id: 'start_protocol', name: 'Start Protocol', description: 'Launch a Titan protocol (phoenix, supreme, midnight, sniper)', category: 'protocol', safetyTier: 2, parameters: [{ name: 'protocol', type: 'string', description: 'Protocol name', required: true }, { name: 'goal', type: 'string', description: 'Goal/task description', required: true }], source: 'system-control', enabled: true, requiresConfirmation: true },
  { id: 'stop_protocol', name: 'Stop Protocol', description: 'Stop a running protocol', category: 'protocol', safetyTier: 2, parameters: [{ name: 'protocol', type: 'string', description: 'Protocol name', required: true }], source: 'system-control', enabled: true, requiresConfirmation: true },
  { id: 'check_protocol_status', name: 'Protocol Status', description: 'Check running protocol status', category: 'protocol', safetyTier: 1, parameters: [], source: 'system-control', enabled: true, requiresConfirmation: false },

  // ── Git ──
  { id: 'git_commit', name: 'Git Commit', description: 'Create a git commit', category: 'git', safetyTier: 2, parameters: [{ name: 'message', type: 'string', description: 'Commit message', required: true }], source: 'builtin', enabled: true, requiresConfirmation: true },
  { id: 'git_push', name: 'Git Push', description: 'Push to remote', category: 'git', safetyTier: 2, parameters: [], source: 'builtin', enabled: true, requiresConfirmation: true },

  // ── Automation ──
  { id: 'cron_schedule', name: 'Schedule Task', description: 'Schedule a recurring or one-time task', category: 'automation', safetyTier: 2, parameters: [{ name: 'schedule', type: 'string', description: 'Cron expression or "once" with delay', required: true }, { name: 'task', type: 'string', description: 'Task description', required: true }, { name: 'toolChain', type: 'array', description: 'Sequence of tool calls', required: false }], source: 'builtin', enabled: true, requiresConfirmation: true },

  // ── Sessions (spawn subagents) ──
  { id: 'sessions_spawn', name: 'Spawn Agent', description: 'Spawn a subagent with a task (one-shot or session)', category: 'sessions', safetyTier: 2, parameters: [{ name: 'task', type: 'string', description: 'Task for the subagent', required: true }, { name: 'label', type: 'string', description: 'Label for the session', required: false }, { name: 'model', type: 'string', description: 'Model to use', required: false }, { name: 'agentId', type: 'string', description: 'Agent ID to use', required: false }], source: 'builtin', enabled: true, requiresConfirmation: true },
  { id: 'sessions_list', name: 'List Sessions', description: 'List active and recent agent sessions', category: 'sessions', safetyTier: 1, parameters: [], source: 'builtin', enabled: true, requiresConfirmation: false },
  { id: 'sessions_send', name: 'Send to Session', description: 'Send a message to another session', category: 'sessions', safetyTier: 2, parameters: [{ name: 'sessionId', type: 'string', description: 'Session ID', required: true }, { name: 'message', type: 'string', description: 'Message', required: true }], source: 'builtin', enabled: true, requiresConfirmation: false },

  // ── Messaging ──
  { id: 'message_send', name: 'Send Message', description: 'Send a message via Telegram, Slack, Discord, etc.', category: 'messaging', safetyTier: 2, parameters: [{ name: 'channel', type: 'string', description: 'Channel type (telegram, slack, discord)', required: true }, { name: 'target', type: 'string', description: 'Chat/channel ID', required: true }, { name: 'text', type: 'string', description: 'Message text', required: true }, { name: 'media', type: 'string', description: 'Optional media URL', required: false }], source: 'builtin', enabled: true, requiresConfirmation: true },

  // ── Devices ──
  { id: 'device_command', name: 'Device Command', description: 'Send a command to a smart device (thermostat, camera, light, lock)', category: 'devices', safetyTier: 2, parameters: [{ name: 'deviceId', type: 'string', description: 'Device ID', required: true }, { name: 'action', type: 'string', description: 'Action (on, off, set_temp, snapshot, etc.)', required: true }, { name: 'params', type: 'object', description: 'Action parameters', required: false }], source: 'builtin', enabled: true, requiresConfirmation: true },
  { id: 'device_list', name: 'List Devices', description: 'List registered smart devices', category: 'devices', safetyTier: 1, parameters: [], source: 'builtin', enabled: true, requiresConfirmation: false },
  { id: 'device_status', name: 'Device Status', description: 'Get status of a smart device', category: 'devices', safetyTier: 1, parameters: [{ name: 'deviceId', type: 'string', description: 'Device ID', required: true }], source: 'builtin', enabled: true, requiresConfirmation: false },

  // ── Harvester / learning ──
  { id: 'start_harvester', name: 'Start Harvester', description: 'Start the Forge knowledge harvester', category: 'knowledge', safetyTier: 2, parameters: [], source: 'system-control', enabled: true, requiresConfirmation: true },
  { id: 'stop_harvester', name: 'Stop Harvester', description: 'Stop the Forge knowledge harvester', category: 'knowledge', safetyTier: 2, parameters: [], source: 'system-control', enabled: true, requiresConfirmation: true },
  { id: 'check_harvest_status', name: 'Harvest Status', description: 'Check harvester status and stats', category: 'knowledge', safetyTier: 1, parameters: [], source: 'system-control', enabled: true, requiresConfirmation: false },

  // ── IDE ──
  { id: 'scan_project', name: 'Scan Project', description: 'Scan the codebase for structure analysis', category: 'fs', safetyTier: 1, parameters: [], source: 'system-control', enabled: true, requiresConfirmation: false },
  { id: 'search_code', name: 'Search Code', description: 'Search codebase for a pattern', category: 'fs', safetyTier: 1, parameters: [{ name: 'query', type: 'string', description: 'Search pattern', required: true }], source: 'builtin', enabled: true, requiresConfirmation: false },
  { id: 'analyze_codebase', name: 'Analyze Codebase', description: 'Full codebase analysis: dependencies, hotspots, complexity', category: 'fs', safetyTier: 1, parameters: [{ name: 'forceRefresh', type: 'boolean', description: 'Force re-scan', required: false }], source: 'builtin', enabled: true, requiresConfirmation: false },
  { id: 'query_codebase', name: 'Query Codebase', description: 'Ask a natural language question about the codebase', category: 'fs', safetyTier: 1, parameters: [{ name: 'question', type: 'string', description: 'Question', required: true }], source: 'builtin', enabled: true, requiresConfirmation: false },

  // ── Self-improvement ──
  { id: 'evaluate_performance', name: 'Evaluate Performance', description: 'Evaluate recent AI performance and extract strategies', category: 'knowledge', safetyTier: 1, parameters: [], source: 'system-control', enabled: true, requiresConfirmation: false },
  { id: 'start_auto_learn', name: 'Start Auto-Learn', description: 'Start background autonomous learning', category: 'knowledge', safetyTier: 2, parameters: [], source: 'system-control', enabled: true, requiresConfirmation: true },
  { id: 'stop_auto_learn', name: 'Stop Auto-Learn', description: 'Stop autonomous learning', category: 'knowledge', safetyTier: 2, parameters: [], source: 'system-control', enabled: true, requiresConfirmation: true },

  // ── Other ──
  { id: 'research_topic', name: 'Research Topic', description: 'Deep-research a topic from multiple web sources', category: 'web', safetyTier: 1, parameters: [{ name: 'topic', type: 'string', description: 'Topic', required: true }, { name: 'depth', type: 'string', description: 'Depth: quick, medium, deep', required: false, default: 'medium' }], source: 'builtin', enabled: true, requiresConfirmation: false },
  { id: 'check_markets', name: 'Check Markets', description: 'Check financial market data', category: 'web', safetyTier: 1, parameters: [], source: 'system-control', enabled: true, requiresConfirmation: false },
  { id: 'switch_mode', name: 'Switch Mode', description: 'Switch chat mode (agent, chat, plan)', category: 'protocol', safetyTier: 1, parameters: [{ name: 'mode', type: 'string', description: 'Mode name', required: true }], source: 'system-control', enabled: true, requiresConfirmation: false },
  { id: 'start_plan', name: 'Start Plan', description: 'Start Plan Mode with a goal', category: 'protocol', safetyTier: 2, parameters: [{ name: 'goal', type: 'string', description: 'Plan goal', required: true }], source: 'system-control', enabled: true, requiresConfirmation: true },
  { id: 'mute_voice', name: 'Mute Voice', description: 'Mute Alfred voice output', category: 'protocol', safetyTier: 1, parameters: [], source: 'system-control', enabled: true, requiresConfirmation: false },
  { id: 'snooze_thoughts', name: 'Snooze Thoughts', description: 'Snooze ambient thought engine', category: 'protocol', safetyTier: 1, parameters: [], source: 'system-control', enabled: true, requiresConfirmation: false },
];

for (const tool of BUILTIN_TOOLS) {
  titanToolRegistry.register(tool);
}
