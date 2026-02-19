export interface Session {
  id: string;
  name: string;
  time: string;
  messages: ChatMessage[];
  changedFiles: ChangedFile[];
}

export interface FileTab {
  name: string;
  icon: string;
  color: string;
  modified?: boolean;
}

export interface ChangedFile {
  name: string;
  additions: number;
  deletions: number;
  icon: string;
  color: string;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  time?: string;
  streaming?: boolean;
  streamingModel?: string;
  streamingProviderModel?: string;
  streamingProvider?: string;
  thinking?: string;
  thinkingTime?: number;
  isError?: boolean;
  retryMessage?: string;
}

export interface SearchResult {
  file: string;
  line: number;
  content: string;
  match: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  tier: 'frontier' | 'standard' | 'economy' | 'local';
  contextWindow: number;
  supportsThinking: boolean;
  supportsVision: boolean;
  costPer1MInput: number;
  costPer1MOutput: number;
}

export interface PendingDiff {
  file: string;
  oldContent: string;
  newContent: string;
  decorationIds: string[];
}
