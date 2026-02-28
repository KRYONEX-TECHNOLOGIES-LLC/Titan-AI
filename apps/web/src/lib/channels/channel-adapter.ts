/**
 * Titan Channel Adapters — unified messaging across Telegram, Slack, Discord, etc.
 *
 * Each adapter normalizes send/receive into a common interface so Alfred and
 * the tool registry can use `message_send` without caring about the platform.
 */

export interface ChannelMessage {
  id?: string;
  channel: ChannelType;
  target: string;
  text: string;
  media?: string;
  replyTo?: string;
  timestamp?: number;
  sender?: string;
}

export type ChannelType = 'telegram' | 'slack' | 'discord' | 'whatsapp' | 'sms';

export interface ChannelConfig {
  type: ChannelType;
  token: string;
  webhookUrl?: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface ChannelAdapter {
  type: ChannelType;
  send(message: ChannelMessage): Promise<{ success: boolean; messageId?: string; error?: string }>;
  isConfigured(): boolean;
}

const CHANNEL_CONFIGS_KEY = 'titan-channel-configs';

function loadConfigs(): ChannelConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CHANNEL_CONFIGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveConfigs(configs: ChannelConfig[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHANNEL_CONFIGS_KEY, JSON.stringify(configs));
  } catch { /* quota */ }
}

// ═══ Telegram Adapter ═══

class TelegramAdapter implements ChannelAdapter {
  type: ChannelType = 'telegram';

  private getToken(): string | null {
    const configs = loadConfigs();
    const cfg = configs.find(c => c.type === 'telegram' && c.enabled);
    return cfg?.token || null;
  }

  isConfigured(): boolean {
    return !!this.getToken();
  }

  async send(message: ChannelMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const token = this.getToken();
    if (!token) return { success: false, error: 'Telegram bot token not configured. Set it in Settings > Channels.' };

    try {
      const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;
      const body: Record<string, unknown> = {
        chat_id: message.target,
        text: message.text,
        parse_mode: 'Markdown',
      };
      if (message.replyTo) body.reply_to_message_id = message.replyTo;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        return { success: true, messageId: String(data.result?.message_id) };
      }
      return { success: false, error: data.description || 'Telegram API error' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Telegram send failed' };
    }
  }
}

// ═══ Slack Adapter ═══

class SlackAdapter implements ChannelAdapter {
  type: ChannelType = 'slack';

  private getToken(): string | null {
    const configs = loadConfigs();
    const cfg = configs.find(c => c.type === 'slack' && c.enabled);
    return cfg?.token || null;
  }

  isConfigured(): boolean {
    return !!this.getToken();
  }

  async send(message: ChannelMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const token = this.getToken();
    if (!token) return { success: false, error: 'Slack token not configured.' };

    try {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channel: message.target, text: message.text }),
      });
      const data = await res.json();
      if (data.ok) {
        return { success: true, messageId: data.ts };
      }
      return { success: false, error: data.error || 'Slack API error' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Slack send failed' };
    }
  }
}

// ═══ Discord Adapter ═══

class DiscordAdapter implements ChannelAdapter {
  type: ChannelType = 'discord';

  private getToken(): string | null {
    const configs = loadConfigs();
    const cfg = configs.find(c => c.type === 'discord' && c.enabled);
    return cfg?.token || null;
  }

  isConfigured(): boolean {
    return !!this.getToken();
  }

  async send(message: ChannelMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const token = this.getToken();
    if (!token) return { success: false, error: 'Discord token not configured.' };

    try {
      const res = await fetch(`https://discord.com/api/v10/channels/${message.target}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bot ${token}` },
        body: JSON.stringify({ content: message.text }),
      });
      const data = await res.json();
      if (data.id) {
        return { success: true, messageId: data.id };
      }
      return { success: false, error: data.message || 'Discord API error' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Discord send failed' };
    }
  }
}

export type ChannelListener = (message: ChannelMessage) => void;

// ═══ Channel Manager ═══

class ChannelManager {
  private adapters: Map<ChannelType, ChannelAdapter> = new Map();
  private listeners: Map<string, ChannelListener[]> = new Map();

  constructor() {
    this.adapters.set('telegram', new TelegramAdapter());
    this.adapters.set('slack', new SlackAdapter());
    this.adapters.set('discord', new DiscordAdapter());
  }

  getAdapter(type: ChannelType): ChannelAdapter | undefined {
    return this.adapters.get(type);
  }

  async send(message: ChannelMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const adapter = this.adapters.get(message.channel);
    if (!adapter) return { success: false, error: `No adapter for channel: ${message.channel}` };
    return adapter.send(message);
  }

  getConfigured(): ChannelType[] {
    return Array.from(this.adapters.entries())
      .filter(([, a]) => a.isConfigured())
      .map(([t]) => t);
  }

  registerAdapter(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  /** Subscribe to incoming messages on a channel. Returns an unsubscribe function. */
  listen(channel: string, callback: ChannelListener): () => void {
    const existing = this.listeners.get(channel) ?? [];
    existing.push(callback);
    this.listeners.set(channel, existing);

    return () => {
      const cbs = this.listeners.get(channel);
      if (!cbs) return;
      const idx = cbs.indexOf(callback);
      if (idx >= 0) cbs.splice(idx, 1);
      if (cbs.length === 0) this.listeners.delete(channel);
    };
  }

  /** Dispatch an incoming message to all listeners for that channel. */
  dispatch(channel: string, message: ChannelMessage): void {
    const cbs = this.listeners.get(channel);
    if (cbs) {
      for (const cb of cbs) {
        try { cb(message); } catch { /* listener error — don't break dispatch loop */ }
      }
    }
  }

  /** Create a new Slack channel via the Slack API. */
  async createChannel(name: string): Promise<{ success: boolean; channelId?: string; error?: string }> {
    const configs = loadConfigs();
    const cfg = configs.find(c => c.type === 'slack' && c.enabled);
    if (!cfg?.token) return { success: false, error: 'Slack token not configured.' };

    try {
      const res = await fetch('https://slack.com/api/conversations.create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.ok) return { success: true, channelId: data.channel?.id };
      return { success: false, error: data.error || 'Slack conversations.create failed' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'createChannel failed' };
    }
  }

  /** Reply in a Slack thread. */
  async postThread(channel: string, threadTs: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const configs = loadConfigs();
    const cfg = configs.find(c => c.type === 'slack' && c.enabled);
    if (!cfg?.token) return { success: false, error: 'Slack token not configured.' };

    try {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify({ channel, thread_ts: threadTs, text }),
      });
      const data = await res.json();
      if (data.ok) return { success: true, messageId: data.ts };
      return { success: false, error: data.error || 'Slack postThread failed' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'postThread failed' };
    }
  }

  // Config management
  setConfig(config: ChannelConfig): void {
    const configs = loadConfigs();
    const idx = configs.findIndex(c => c.type === config.type);
    if (idx >= 0) configs[idx] = config;
    else configs.push(config);
    saveConfigs(configs);
  }

  getConfig(type: ChannelType): ChannelConfig | undefined {
    return loadConfigs().find(c => c.type === type);
  }

  getAllConfigs(): ChannelConfig[] {
    return loadConfigs();
  }

  removeConfig(type: ChannelType): void {
    const configs = loadConfigs().filter(c => c.type !== type);
    saveConfigs(configs);
  }
}

export const channelManager = new ChannelManager();
