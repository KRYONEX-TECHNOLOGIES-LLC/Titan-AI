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

const OPT_WAKE = /(?:(?:alfred|titan)[,.]?\s+)?/;
function wake(core: string): RegExp {
  return new RegExp(`\\b${OPT_WAKE.source}${core}`, 'i');
}

const COMMANDS: VoiceCommand[] = [
  // ── Protocol control ──
  {
    pattern: wake(String.raw`start\s+midnight(?:\s+mode)?`),
    action: 'start_midnight',
    description: 'Start Midnight Mode autonomous build',
  },
  {
    pattern: wake(String.raw`stop\s+midnight(?:\s+mode)?`),
    action: 'stop_midnight',
    description: 'Stop Midnight Mode',
  },
  {
    pattern: wake(String.raw`scan\s+(?:the\s+)?project\b`),
    action: 'scan_project',
    description: 'Scan the current project codebase',
  },
  {
    pattern: wake(String.raw`(?:what(?:'s| is)\s+the\s+)?status\b`),
    action: 'check_status',
    description: 'Check current plan/project status',
  },
  {
    pattern: wake(String.raw`start\s+(?:the\s+)?harvest(?:er)?\b`),
    action: 'start_harvest',
    description: 'Start Forge harvester',
  },
  {
    pattern: wake(String.raw`stop\s+(?:the\s+)?harvest(?:er)?\b`),
    action: 'stop_harvest',
    description: 'Stop Forge harvester',
  },
  {
    pattern: wake(String.raw`take\s+a?\s*screenshot\b`),
    action: 'take_screenshot',
    description: 'Capture viewport screenshot',
  },
  {
    pattern: wake(String.raw`switch\s+to\s+(plan|chat|agent|midnight)\s*(?:mode)?\b`),
    action: 'switch_mode',
    description: 'Switch chat mode',
    extract: (m) => ({ mode: m[1].toLowerCase() }),
  },
  {
    pattern: wake(String.raw`start\s+plan(?:\s+mode)?\b`),
    action: 'start_plan',
    description: 'Start Plan Mode execution',
  },

  // ── YouTube-specific lookups (must be BEFORE generic web_search) ──
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:look\s*up|find|search|show)\s+(?:(?:this|that|a|some)\s+)?(?:on\s+)?youtube\s+(?:for\s+|about\s+)?(.+)/i,
    action: 'web_search',
    description: 'Search YouTube for a video',
    extract: (m) => ({ query: `youtube ${m[1].trim()}` }),
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:find|get|show)\s+(?:me\s+)?(?:a\s+)?youtube\s+(?:video|tutorial|clip)\s+(?:about|on|for)\s+(.+)/i,
    action: 'web_search',
    description: 'Find a YouTube video',
    extract: (m) => ({ query: `youtube ${m[1].trim()}` }),
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:play|watch|pull\s+up)\s+(?:a?\s+)?(?:youtube\s+)?(?:video|tutorial|clip)\s+(?:about|on|for)\s+(.+)/i,
    action: 'web_search',
    description: 'Pull up a YouTube video',
    extract: (m) => ({ query: `youtube ${m[1].trim()}` }),
  },

  // ── Web search (fixed: was "search_web", now "web_search") ──
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?search\s+(?:the\s+)?(?:web|internet|online)\s+(?:for\s+)?(.+)/i,
    action: 'web_search',
    description: 'Search the web',
    extract: (m) => ({ query: m[1].trim() }),
  },

  // ── Natural language research/lookup patterns ──
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:research|investigate|dig\s+into|look\s+into)\s+(.+)/i,
    action: 'web_search',
    description: 'Research a topic on the web',
    extract: (m) => ({ query: m[1].trim() }),
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:find|get|grab)\s+(?:me\s+)?(?:info(?:rmation)?\s+(?:on|about)\s+)?(.+)/i,
    action: 'web_search',
    description: 'Find information on the web',
    extract: (m) => ({ query: m[1].trim() }),
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:show\s+me|pull\s+up|display)\s+(.+)/i,
    action: 'web_search',
    description: 'Show or display search results on canvas',
    extract: (m) => {
      const text = m[1].trim();
      if (/^https?:\/\//i.test(text)) return { url: text, query: '' };
      return { query: text, url: '' };
    },
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:google|look\s+up|search\s+for)\s+(.+)/i,
    action: 'web_search',
    description: 'Google / look up something',
    extract: (m) => ({ query: m[1].trim() }),
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:what\s+(?:is|are)\s+|who\s+(?:is|are)\s+|how\s+(?:does|do|to)\s+)(.+)/i,
    action: 'web_search',
    description: 'Answer a factual question via web search',
    extract: (m) => ({ query: m[0].trim() }),
  },

  // ── File operations ──
  {
    pattern: wake(String.raw`read\s+(?:file\s+)?(.+\.\w+)\b`),
    action: 'read_file',
    description: 'Read a project file',
    extract: (m) => ({ path: m[1].trim() }),
  },

  // ── Voice control ──
  {
    pattern: wake(String.raw`(?:be\s+)?quiet\b`),
    action: 'mute_voice',
    description: 'Mute Alfred voice',
  },
  {
    pattern: wake(String.raw`(?:snooze|pause)\s+(?:thoughts?|suggestions?)\b`),
    action: 'snooze_thoughts',
    description: 'Snooze proactive thoughts',
  },
  {
    pattern: wake(String.raw`(?:what|show|tell)\s+(?:me\s+)?(?:your\s+)?ideas?\b`),
    action: 'show_ideas',
    description: 'Show Alfred\'s latest ideas',
  },
  {
    pattern: wake(String.raw`(?:how\s+(?:are\s+)?you|what(?:'ve| have)\s+you\s+learned)\b`),
    action: 'show_evolution',
    description: 'Show evolution/growth stats',
  },
  {
    pattern: wake(String.raw`(?:proceed|go\s+ahead|do\s+it|make\s+it\s+(?:so|happen)|execute|confirmed?)\b`),
    action: 'proceed',
    description: 'Confirm and execute pending action',
  },
  {
    pattern: wake(String.raw`(?:what\s+do\s+you\s+think|your\s+(?:thoughts?|opinion|take)|analyze\s+this)\b`),
    action: 'request_analysis',
    description: 'Ask Alfred for analysis or opinion',
  },
  {
    pattern: wake(String.raw`(?:check|how\s+(?:are|is)\s+(?:the\s+)?market|stock|crypto|bitcoin|finance)\b`),
    action: 'check_markets',
    description: 'Check financial markets',
  },

  // ── URL browsing (detects actual URLs) ──
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:open|browse|visit|go\s+to|navigate\s+to|fetch)\s+(?:the\s+)?(?:url\s+|site\s+|page\s+)?(https?:\/\/\S+)/i,
    action: 'browse_web',
    description: 'Browse a specific URL',
    extract: (m) => ({ url: m[1].trim() }),
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:open|browse|visit|go\s+to)\s+(?:the\s+)?(?:url\s+|site\s+|page\s+)?(\S+\.(?:com|org|net|io|dev|ai|co)\S*)/i,
    action: 'browse_web',
    description: 'Browse a website by domain',
    extract: (m) => ({ url: m[1].trim().startsWith('http') ? m[1].trim() : `https://${m[1].trim()}` }),
  },

  // ── Knowledge ──
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:search|find|query)\s+(?:the\s+)?(?:brain|knowledge|memory)\s+(?:for\s+)?(.+)/i,
    action: 'search_knowledge',
    description: 'Search brain knowledge base',
    extract: (m) => ({ query: m[1].trim() }),
  },

  // ── Auto-learn ──
  {
    pattern: wake(String.raw`(?:start|begin|enable)\s+(?:auto[- ]?learn(?:ing|er)?|background\s+learn(?:ing)?)\b`),
    action: 'start_auto_learn',
    description: 'Start autonomous background learning',
  },
  {
    pattern: wake(String.raw`(?:stop|disable|pause)\s+(?:auto[- ]?learn(?:ing|er)?|background\s+learn(?:ing)?)\b`),
    action: 'stop_auto_learn',
    description: 'Stop autonomous background learning',
  },

  // ── Canvas mode switching ──
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:show|switch\s+to|open)\s+(?:the\s+)?(?:screen|display|web\s*view)\b/i,
    action: 'canvas_mode',
    description: 'Switch canvas to Screen mode',
    extract: () => ({ canvasMode: 'screen' }),
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:show|switch\s+to|open)\s+(?:the\s+)?(?:code|editor|diff)\s*(?:view|canvas|preview)?\b/i,
    action: 'canvas_mode',
    description: 'Switch canvas to Code mode',
    extract: () => ({ canvasMode: 'code' }),
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:show|switch\s+to|open)\s+(?:the\s+)?terminal\s*(?:view|canvas)?\b/i,
    action: 'canvas_mode',
    description: 'Switch canvas to Terminal mode',
    extract: () => ({ canvasMode: 'terminal' }),
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:show|switch\s+to|open)\s+(?:the\s+)?(?:files?|tree)\s*(?:view|canvas)?\b/i,
    action: 'canvas_mode',
    description: 'Switch canvas to Files mode',
    extract: () => ({ canvasMode: 'files' }),
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:show|switch\s+to|open)\s+(?:the\s+)?(?:vibe\s*code|sandbox|playground)\b/i,
    action: 'canvas_mode',
    description: 'Switch canvas to Vibe Code sandbox',
    extract: () => ({ canvasMode: 'vibe' }),
  },
  {
    pattern: /\b(?:(?:alfred|titan)[,.]?\s+)?(?:show|switch\s+to|open)\s+(?:the\s+)?(?:dashboard|stats|metrics)\b/i,
    action: 'canvas_mode',
    description: 'Switch canvas to Dashboard mode',
    extract: () => ({ canvasMode: 'dashboard' }),
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
