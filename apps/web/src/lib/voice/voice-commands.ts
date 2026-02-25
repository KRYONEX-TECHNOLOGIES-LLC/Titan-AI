'use client';

export interface VoiceCommand {
  pattern: RegExp;
  action: string;
  description: string;
  extract?: (match: RegExpMatchArray) => Record<string, string>;
}

export interface VoiceCommandResult {
  matched: boolean;
  action: string;
  params: Record<string, string>;
  description: string;
  originalText: string;
}

const COMMANDS: VoiceCommand[] = [
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?start\s+midnight(?:\s+mode)?\b/i,
    action: 'start_midnight',
    description: 'Start Midnight Mode autonomous build',
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?stop\s+midnight(?:\s+mode)?\b/i,
    action: 'stop_midnight',
    description: 'Stop Midnight Mode',
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?scan\s+(?:the\s+)?project\b/i,
    action: 'scan_project',
    description: 'Scan the current project codebase',
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:what(?:'s| is)\s+the\s+)?status\b/i,
    action: 'check_status',
    description: 'Check current plan/project status',
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?start\s+(?:the\s+)?harvest(?:er)?\b/i,
    action: 'start_harvest',
    description: 'Start Forge harvester',
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?stop\s+(?:the\s+)?harvest(?:er)?\b/i,
    action: 'stop_harvest',
    description: 'Stop Forge harvester',
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?take\s+a?\s*screenshot\b/i,
    action: 'take_screenshot',
    description: 'Capture viewport screenshot',
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?switch\s+to\s+(plan|chat|agent|midnight)\s*(?:mode)?\b/i,
    action: 'switch_mode',
    description: 'Switch chat mode',
    extract: (m) => ({ mode: m[1].toLowerCase() }),
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?start\s+plan(?:\s+mode)?\b/i,
    action: 'start_plan',
    description: 'Start Plan Mode execution',
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?search\s+(?:the\s+)?(?:web|internet|online)\s+(?:for\s+)?(.+)/i,
    action: 'search_web',
    description: 'Search the web',
    extract: (m) => ({ query: m[1].trim() }),
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?read\s+(?:file\s+)?(.+\.\w+)\b/i,
    action: 'read_file',
    description: 'Read a project file',
    extract: (m) => ({ path: m[1].trim() }),
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:be\s+)?quiet\b/i,
    action: 'mute_voice',
    description: 'Mute Alfred voice',
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:snooze|pause)\s+(?:thoughts?|suggestions?)\b/i,
    action: 'snooze_thoughts',
    description: 'Snooze proactive thoughts',
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:what|show|tell)\s+(?:me\s+)?(?:your\s+)?ideas?\b/i,
    action: 'show_ideas',
    description: 'Show Alfred\'s latest ideas',
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:how\s+(?:are\s+)?you|what(?:'ve| have)\s+you\s+learned)\b/i,
    action: 'show_evolution',
    description: 'Show evolution/growth stats',
  },
];

export function parseVoiceCommand(text: string): VoiceCommandResult {
  for (const cmd of COMMANDS) {
    const match = text.match(cmd.pattern);
    if (match) {
      return {
        matched: true,
        action: cmd.action,
        params: cmd.extract ? cmd.extract(match) : {},
        description: cmd.description,
        originalText: text,
      };
    }
  }
  return {
    matched: false,
    action: 'conversation',
    params: {},
    description: 'Normal conversation',
    originalText: text,
  };
}

export function getAvailableCommands(): Array<{ action: string; description: string }> {
  return COMMANDS.map(c => ({ action: c.action, description: c.description }));
}
