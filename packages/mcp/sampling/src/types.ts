// MCP Sampling Types
// packages/mcp/sampling/src/types.ts

export interface SamplingRequest {
  id: string;
  messages: SamplingMessage[];
  modelPreferences?: ModelPreferences;
  systemPrompt?: string;
  includeContext?: ContextInclusion;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  metadata?: Record<string, unknown>;
}

export interface SamplingMessage {
  role: 'user' | 'assistant' | 'system';
  content: SamplingContent;
}

export type SamplingContent = TextContent | ImageContent | ResourceContent;

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  data: string; // base64
  mimeType: string;
}

export interface ResourceContent {
  type: 'resource';
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string; // base64
  };
}

export interface ModelPreferences {
  hints?: ModelHint[];
  costPriority?: number; // 0-1, 0 = prefer cheap, 1 = prefer capable
  speedPriority?: number; // 0-1, 0 = no rush, 1 = fastest
  intelligencePriority?: number; // 0-1
}

export interface ModelHint {
  name?: string; // e.g., "claude-4.6-sonnet"
}

export type ContextInclusion = 'none' | 'thisServer' | 'allServers';

export interface SamplingResponse {
  id: string;
  requestId: string;
  model: string;
  stopReason: 'endTurn' | 'stopSequence' | 'maxTokens';
  content: SamplingContent;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  metadata?: Record<string, unknown>;
}

export interface SamplingProvider {
  handleSamplingRequest(request: SamplingRequest): Promise<SamplingResponse>;
}

export interface SubAgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  modelPreferences?: ModelPreferences;
  capabilities: string[];
  maxConcurrent?: number;
}

export interface SubAgentTask {
  id: string;
  agentId: string;
  request: SamplingRequest;
  status: 'pending' | 'running' | 'completed' | 'failed';
  response?: SamplingResponse;
  error?: Error;
  startTime?: number;
  endTime?: number;
}
