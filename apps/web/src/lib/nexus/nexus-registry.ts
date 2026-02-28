/**
 * Nexus Lab — Add-On Registry and Runtime
 *
 * Users and third parties build add-ons (skills + optional tools).
 * Add-ons are stored in localStorage and their skill instructions
 * are injected into Alfred/chat when enabled.
 *
 * Tool registration happens server-side via the voice API route,
 * NOT in this client-safe module (avoids child_process in bundle).
 */

export type AddonPricing = 'free' | 'paid';
export type AddonStatus = 'available' | 'installed' | 'enabled' | 'disabled';

export interface NexusToolDef {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: Array<{ name: string; type: string; description: string; required: boolean }>;
}

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
  tools: NexusToolDef[];
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
    this.saveToStorage();
    return true;
  }

  disable(addonId: string): boolean {
    const addon = this.addons.get(addonId);
    if (!addon) return false;
    addon.status = 'disabled';
    this.saveToStorage();
    return true;
  }

  uninstall(addonId: string): boolean {
    const addon = this.addons.get(addonId);
    if (!addon) return false;
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

  registerFromSkillMd(content: string, extraTools?: NexusToolDef[]): NexusAddon | null {
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
  {
    id: 'nexus-code-review',
    name: 'Code Review',
    description: 'Automated PR review with style checks and vulnerability scanning.',
    author: 'Kryonex Technologies',
    version: '1.0.0',
    pricing: 'free',
    category: 'devops',
    permissions: ['web'],
    skillInstructions: `When asked to review code or a pull request:
1. Use read_file to inspect the changed files. If a PR URL is provided, use browse_url to fetch the diff.
2. Check for: security vulnerabilities (SQL injection, XSS, hardcoded secrets), performance issues (N+1 queries, unbounded loops), style inconsistencies, missing error handling, missing tests.
3. Rate the overall quality on a scale of 1-10.
4. Present findings grouped by severity: Critical, Warning, Suggestion.
5. For each finding, show the file, line, issue, and a concrete fix.
6. Summarize: "X critical issues, Y warnings, Z suggestions. Overall quality: N/10."`,
    tools: [],
    status: 'available',
  },
  {
    id: 'nexus-seo-analyzer',
    name: 'SEO Analyzer',
    description: 'Analyze pages for SEO, meta tags, performance, and accessibility.',
    author: 'Kryonex Technologies',
    version: '1.0.0',
    pricing: 'free',
    category: 'research',
    permissions: ['web', 'browser'],
    skillInstructions: `When asked to analyze a page for SEO:
1. Use browse_url to fetch the page HTML.
2. Check for: title tag (50-60 chars ideal), meta description (150-160 chars), H1 tag presence, image alt attributes, canonical URL, Open Graph tags, robots.txt compliance, structured data (JSON-LD).
3. Check performance indicators: large images without lazy loading, render-blocking scripts, excessive DOM depth.
4. Check accessibility: color contrast, ARIA labels, form labels, keyboard navigation hints.
5. Score each category (SEO, Performance, Accessibility) out of 100.
6. Present a prioritized list of fixes with estimated impact (High/Medium/Low).`,
    tools: [],
    status: 'available',
  },
  {
    id: 'nexus-social-media',
    name: 'Social Media Manager',
    description: 'Schedule posts, track analytics, and manage multiple platforms.',
    author: 'Kryonex Technologies',
    version: '1.0.0',
    pricing: 'free',
    category: 'communication',
    permissions: ['web', 'browser', 'messaging'],
    skillInstructions: `When asked to manage social media:
1. Ask for: platform (Twitter/X, LinkedIn, Instagram, etc.), action (post, schedule, analyze, track).
2. For posting: help draft the content, suggest hashtags (3-5 relevant ones), recommend optimal posting time based on platform.
3. For scheduling: use browse_url to navigate to the platform's scheduling interface, or suggest tools like Buffer/Hootsuite.
4. For analytics: use web_search to find the account's public metrics, or browse_url to access analytics dashboards.
5. Always preview the post content before publishing: "Post: [content]. Platform: X. Schedule: 2pm EST. Proceed?"
6. Never post without explicit user confirmation.`,
    tools: [],
    status: 'available',
  },
  {
    id: 'nexus-data-scraper',
    name: 'Data Scraper',
    description: 'Extract structured data from websites with smart selectors.',
    author: 'Kryonex Technologies',
    version: '1.0.0',
    pricing: 'free',
    category: 'custom',
    permissions: ['web', 'browser'],
    skillInstructions: `When asked to scrape or extract data from a website:
1. Ask for: target URL, what data to extract (prices, emails, product names, etc.), output format (JSON, CSV, table).
2. Use browse_url to load the page. Use browser_get_text or browser_evaluate to extract content with CSS selectors or XPath.
3. For paginated data: detect "next page" buttons and iterate with browser_click + browser_get_text.
4. Clean and structure the extracted data into the requested format.
5. Present a preview of the first 5-10 rows before extracting the full dataset.
6. Respect robots.txt. Warn the user if the site disallows scraping. Add reasonable delays between requests.
7. NEVER scrape login-protected content without the user explicitly providing credentials.`,
    tools: [],
    status: 'available',
  },
];

for (const addon of BUILTIN_ADDONS) {
  if (!nexusRegistry.get(addon.id)) {
    nexusRegistry.register(addon);
  }
}
