export type MCPSource =
  | 'github'
  | 'azure-devops'
  | 'slack'
  | 'teams'
  | 'datadog'
  | 'sentry'
  | 'notion'
  | 'confluence';

export interface MCPResult {
  ok: boolean;
  source: MCPSource;
  data?: unknown;
  error?: string;
}

export interface MCPIntegrationConfig {
  githubToken?: string;
  azureToken?: string;
  slackWebhookUrl?: string;
  teamsWebhookUrl?: string;
  datadogApiKey?: string;
  sentryToken?: string;
  notionToken?: string;
  confluenceToken?: string;
}

export function createMCPBridge(config: MCPIntegrationConfig) {
  const enabled = {
    github: !!config.githubToken,
    'azure-devops': !!config.azureToken,
    slack: !!config.slackWebhookUrl,
    teams: !!config.teamsWebhookUrl,
    datadog: !!config.datadogApiKey,
    sentry: !!config.sentryToken,
    notion: !!config.notionToken,
    confluence: !!config.confluenceToken,
  } as Record<MCPSource, boolean>;

  async function queryContext(source: MCPSource, query: string): Promise<MCPResult> {
    if (!enabled[source]) {
      return {
        ok: false,
        source,
        error: `Integration ${source} is not enabled in environment configuration.`,
      };
    }

    return {
      ok: true,
      source,
      data: {
        protocol: 'json-rpc-2.0',
        action: 'queryContext',
        query,
        timestamp: Date.now(),
      },
    };
  }

  async function pushUpdate(source: MCPSource, payload: unknown): Promise<MCPResult> {
    if (!enabled[source]) {
      return {
        ok: false,
        source,
        error: `Integration ${source} is not enabled in environment configuration.`,
      };
    }

    return {
      ok: true,
      source,
      data: {
        protocol: 'json-rpc-2.0',
        action: 'pushUpdate',
        payload,
        timestamp: Date.now(),
      },
    };
  }

  function getEnabledSources() {
    return (Object.keys(enabled) as MCPSource[]).filter((k) => enabled[k]);
  }

  return {
    queryContext,
    pushUpdate,
    getEnabledSources,
  };
}
