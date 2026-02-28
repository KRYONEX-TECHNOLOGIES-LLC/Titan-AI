/**
 * Nexus Lab — Add-On Registry and Runtime
 *
 * Users and third parties build add-ons (skills + optional tools).
 * Add-ons are loaded into the unified tool registry and their skill
 * instructions are injected into Alfred/chat when enabled.
 *
 * Add-on format:
 *   - SKILL.md  (YAML frontmatter + markdown instructions)
 *   - Optional tool definitions (JSON)
 *   - Optional UI components
 */

import { titanToolRegistry, type ToolDefinition, type ToolResult } from '../tools/tool-registry';

export type AddonPricing = 'free' | 'paid';
export type AddonStatus = 'available' | 'installed' | 'enabled' | 'disabled';

export interface NexusAddon {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  pricing: AddonPricing;
  price?: number;
  category: string;
  icon?: string;
  permissions: string[];
  skillInstructions: string;
  tools: ToolDefinition[];
  status: AddonStatus;
  installedAt?: number;
  rating?: number;
  downloads?: number;
}

export interface NexusSkillMd {
  name: string;
  description: string;
  author: string;
  version: string;
  permissions: string[];
  tools?: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    parameters: Array<{ name: string; type: string; description: string; required: boolean }>;
  }>;
  instructions: string;
}

const ADDON_STORAGE_KEY = 'titan-nexus-addons';

class NexusRegistry {
  private addons: Map<string, NexusAddon> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(ADDON_STORAGE_KEY);
      if (raw) {
        const list: NexusAddon[] = JSON.parse(raw);
        for (const addon of list) {
          this.addons.set(addon.id, addon);
          if (addon.status === 'enabled') {
            this.activateTools(addon);
          }
        }
      }
    } catch { /* ignore corrupt storage */ }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(ADDON_STORAGE_KEY, JSON.stringify(Array.from(this.addons.values())));
    } catch { /* quota */ }
  }

  private activateTools(addon: NexusAddon): void {
    for (const tool of addon.tools) {
      titanToolRegistry.register({
        ...tool,
        source: 'nexus',
        enabled: true,
        requiresConfirmation: true,
        safetyTier: 2,
        category: (tool.category as ToolDefinition['category']) || 'nexus',
      });
    }
  }

  private deactivateTools(addon: NexusAddon): void {
    for (const tool of addon.tools) {
      titanToolRegistry.unregister(tool.id);
    }
  }

  register(addon: NexusAddon): void {
    this.addons.set(addon.id, addon);
    this.saveToStorage();
  }

  install(addonId: string): boolean {
    const addon = this.addons.get(addonId);
    if (!addon) return false;
    addon.status = 'installed';
    addon.installedAt = Date.now();
    this.saveToStorage();
    return true;
  }

  enable(addonId: string): boolean {
    const addon = this.addons.get(addonId);
    if (!addon || addon.status === 'available') return false;
    addon.status = 'enabled';
    this.activateTools(addon);
    this.saveToStorage();
    return true;
  }

  disable(addonId: string): boolean {
    const addon = this.addons.get(addonId);
    if (!addon) return false;
    addon.status = 'disabled';
    this.deactivateTools(addon);
    this.saveToStorage();
    return true;
  }

  uninstall(addonId: string): boolean {
    const addon = this.addons.get(addonId);
    if (!addon) return false;
    this.deactivateTools(addon);
    this.addons.delete(addonId);
    this.saveToStorage();
    return true;
  }

  getAll(): NexusAddon[] {
    return Array.from(this.addons.values());
  }

  getEnabled(): NexusAddon[] {
    return this.getAll().filter(a => a.status === 'enabled');
  }

  getInstalled(): NexusAddon[] {
    return this.getAll().filter(a => a.status !== 'available');
  }

  get(addonId: string): NexusAddon | undefined {
    return this.addons.get(addonId);
  }

  getSkillInstructions(): string {
    const enabled = this.getEnabled();
    if (enabled.length === 0) return '';
    const parts = enabled.map(a => `[NEXUS: ${a.name}]\n${a.skillInstructions}`);
    return parts.join('\n\n');
  }

  parseSkillMd(content: string): NexusSkillMd | null {
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (!frontmatterMatch) return null;

    const yaml = frontmatterMatch[1];
    const instructions = frontmatterMatch[2].trim();

    const getField = (key: string): string => {
      const m = yaml.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
      return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
    };

    const getList = (key: string): string[] => {
      const m = yaml.match(new RegExp(`^${key}:\\s*\\[([^\\]]+)\\]`, 'm'));
      if (m) return m[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      const lines: string[] = [];
      const blockMatch = yaml.match(new RegExp(`^${key}:\\s*\n((?:\\s+-\\s+.+\n?)+)`, 'm'));
      if (blockMatch) {
        for (const line of blockMatch[1].split('\n')) {
          const lm = line.match(/^\s+-\s+(.+)/);
          if (lm) lines.push(lm[1].trim().replace(/^["']|["']$/g, ''));
        }
      }
      return lines;
    };

    return {
      name: getField('name'),
      description: getField('description'),
      author: getField('author'),
      version: getField('version') || '1.0.0',
      permissions: getList('permissions'),
      instructions,
    };
  }

  registerFromSkillMd(content: string, extraTools?: ToolDefinition[]): NexusAddon | null {
    const parsed = this.parseSkillMd(content);
    if (!parsed) return null;

    const id = `nexus-${parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const addon: NexusAddon = {
      id,
      name: parsed.name,
      description: parsed.description,
      author: parsed.author,
      version: parsed.version,
      pricing: 'free',
      category: 'general',
      permissions: parsed.permissions,
      skillInstructions: parsed.instructions,
      tools: extraTools || [],
      status: 'installed',
      installedAt: Date.now(),
    };
    this.register(addon);
    return addon;
  }
}

export const nexusRegistry = new NexusRegistry();

// ═══ Built-in Example Add-Ons (shipped with Titan) ═══

const BUILTIN_ADDONS: NexusAddon[] = [
  {
    id: 'nexus-trading-bot',
    name: 'Trading Bot',
    description: 'AI-powered trading bot with hardcoded risk management. Supports crypto and stock markets via broker APIs.',
    author: 'Kryonex Technologies',
    version: '1.0.0',
    pricing: 'free',
    category: 'finance',
    permissions: ['messaging', 'web', 'automation'],
    skillInstructions: `You can create and manage trading bots for users.
When asked to create a trading bot:
1. Ask for: asset type (crypto/stock), strategy (momentum, mean-reversion, breakout), risk tolerance (conservative/moderate/aggressive), broker.
2. Configure hardcoded risk limits: max 2% position size per trade, 5% daily loss limit, 10% weekly loss limit, circuit breaker after 3 consecutive losses.
3. Set up via cron_schedule for recurring checks or webhook triggers.
4. Always require human-in-the-loop confirmation for trades over $500 via message_send.
5. Track expected vs actual outcomes; bench underperforming strategies after 3 consecutive losses.`,
    tools: [],
    status: 'available',
  },
  {
    id: 'nexus-home-assistant',
    name: 'Home Assistant Bridge',
    description: 'Control smart home devices via Home Assistant: lights, thermostats, cameras, locks, sensors.',
    author: 'Kryonex Technologies',
    version: '1.0.0',
    pricing: 'free',
    category: 'home',
    permissions: ['devices'],
    skillInstructions: `You can control smart home devices through the device_command tool.
Supported actions: on, off, toggle, set_temp, set_brightness, set_color, lock, unlock, snapshot, arm, disarm.
Always confirm destructive actions (unlock doors, disarm security) with the user.
When querying device status, present data clearly: "Living room is 72°F, thermostat set to 70°F."
For cameras, use device_command with action "snapshot" to capture an image.`,
    tools: [],
    status: 'available',
  },
  {
    id: 'nexus-food-delivery',
    name: 'Food & Delivery',
    description: 'Order food, groceries, and delivery through popular services.',
    author: 'Kryonex Technologies',
    version: '1.0.0',
    pricing: 'free',
    category: 'lifestyle',
    permissions: ['web', 'browser', 'messaging'],
    skillInstructions: `When a user asks to order food or groceries:
1. Ask for preferences: cuisine, restaurant (or "surprise me"), dietary restrictions, budget.
2. Use web_search to find options, then web_fetch or browse_url to get menus/prices.
3. Present top 3 options with prices.
4. After user selects: navigate to the ordering page via browse_url.
5. ALWAYS confirm the order summary and total before placing: "Order: 1x Margherita Pizza ($14), 1x Caesar Salad ($9). Total: $23. Proceed?"
6. Never place an order without explicit user confirmation.`,
    tools: [],
    status: 'available',
  },
  {
    id: 'nexus-travel',
    name: 'Travel & Tickets',
    description: 'Search and book flights, hotels, and event tickets.',
    author: 'Kryonex Technologies',
    version: '1.0.0',
    pricing: 'free',
    category: 'travel',
    permissions: ['web', 'browser'],
    skillInstructions: `When asked to book flights, hotels, or event tickets:
1. Gather: destination, dates, budget, preferences (airline, hotel class, seat preference).
2. Use web_search to find options from multiple sources.
3. Present top 3-5 options with prices, times, and ratings.
4. After user selects: use browse_url to navigate to the booking page.
5. ALWAYS show a final summary before booking: "Flight: NYC→LAX, Delta, Mar 15 6:00am, $329. Proceed?"
6. Never complete a purchase without explicit confirmation.`,
    tools: [],
    status: 'available',
  },
  {
    id: 'nexus-movie-picker',
    name: 'Movie & Entertainment',
    description: 'Find movies, shows, and entertainment based on preferences and mood.',
    author: 'Kryonex Technologies',
    version: '1.0.0',
    pricing: 'free',
    category: 'entertainment',
    permissions: ['web'],
    skillInstructions: `When asked to pick a movie or show:
1. Ask about: mood (fun, intense, emotional, scary), genre preference, platform (Netflix, theaters, etc.), who's watching (solo, date night, family).
2. Use web_search to find top-rated options matching criteria.
3. Present 3-5 picks with: title, year, rating, brief synopsis (2 sentences), where to watch.
4. If user wants to watch at a theater: find nearby showtimes via web_search.
5. Remember user's past picks and ratings to improve future recommendations.`,
    tools: [],
    status: 'available',
  },
];

for (const addon of BUILTIN_ADDONS) {
  if (!nexusRegistry.get(addon.id)) {
    nexusRegistry.register(addon);
  }
}
