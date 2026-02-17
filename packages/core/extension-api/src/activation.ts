/**
 * Extension Activation
 *
 * Activation event handling
 */

export type ActivationEvent =
  | '*'
  | 'onStartupFinished'
  | `onLanguage:${string}`
  | `onCommand:${string}`
  | `onDebug:${string}`
  | `onDebugInitialConfiguration`
  | `onDebugResolve:${string}`
  | `onView:${string}`
  | `onUri`
  | `onWebviewPanel:${string}`
  | `onCustomEditor:${string}`
  | `onFileSystem:${string}`
  | `workspaceContains:${string}`
  | `onAI:${string}`
  | `onMCP:${string}`;

/**
 * Parse activation event
 */
export function parseActivationEvent(event: string): {
  type: string;
  value?: string;
} {
  if (event === '*' || event === 'onStartupFinished' || event === 'onUri' || event === 'onDebugInitialConfiguration') {
    return { type: event };
  }

  const colonIndex = event.indexOf(':');
  if (colonIndex === -1) {
    return { type: event };
  }

  return {
    type: event.slice(0, colonIndex),
    value: event.slice(colonIndex + 1),
  };
}

/**
 * Check if activation event matches
 */
export function matchesActivationEvent(
  extensionEvents: string[],
  currentEvent: string
): boolean {
  // Wildcard matches everything
  if (extensionEvents.includes('*')) {
    return true;
  }

  // Direct match
  if (extensionEvents.includes(currentEvent)) {
    return true;
  }

  // Parse and match
  const { type, value } = parseActivationEvent(currentEvent);

  for (const event of extensionEvents) {
    const parsed = parseActivationEvent(event);

    if (parsed.type === type) {
      // No value means match all of this type
      if (!parsed.value) {
        return true;
      }

      // Glob matching for workspaceContains
      if (type === 'workspaceContains' && parsed.value && value) {
        if (matchGlob(value, parsed.value)) {
          return true;
        }
      }

      // Exact value match
      if (parsed.value === value) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Simple glob matching
 */
function matchGlob(path: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.');

  return new RegExp(`^${regexPattern}$`).test(path);
}

/**
 * Generate activation events from contributions
 */
export function generateActivationEvents(
  contributions: Record<string, unknown>
): string[] {
  const events: string[] = [];

  // Commands
  if (Array.isArray(contributions.commands)) {
    for (const cmd of contributions.commands as Array<{ command: string }>) {
      events.push(`onCommand:${cmd.command}`);
    }
  }

  // Languages
  if (Array.isArray(contributions.languages)) {
    for (const lang of contributions.languages as Array<{ id: string }>) {
      events.push(`onLanguage:${lang.id}`);
    }
  }

  // Views
  if (contributions.views && typeof contributions.views === 'object') {
    const views = contributions.views as Record<string, Array<{ id: string }>>;
    for (const container of Object.values(views)) {
      for (const view of container) {
        events.push(`onView:${view.id}`);
      }
    }
  }

  // AI Providers
  if (Array.isArray(contributions.aiProviders)) {
    for (const provider of contributions.aiProviders as Array<{ id: string }>) {
      events.push(`onAI:${provider.id}`);
    }
  }

  // MCP Servers
  if (Array.isArray(contributions.mcpServers)) {
    for (const server of contributions.mcpServers as Array<{ id: string }>) {
      events.push(`onMCP:${server.id}`);
    }
  }

  return events;
}
