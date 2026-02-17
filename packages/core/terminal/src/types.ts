/**
 * Terminal types
 */

export interface TerminalOptions {
  name?: string;
  shell?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export interface TerminalInstance {
  id: string;
  name: string;
  pid: number;
  shell: string;
  cwd: string;
  isRunning: boolean;
  createdAt: Date;
}

export interface TerminalOutput {
  terminalId: string;
  data: string;
  timestamp: Date;
  isError: boolean;
}

export interface CommandExecution {
  id: string;
  terminalId: string;
  command: string;
  startedAt: Date;
  endedAt?: Date;
  exitCode?: number;
  output: string;
  errorOutput: string;
  isRunning: boolean;
}

export interface ShellIntegrationConfig {
  enableCommandDetection: boolean;
  enableCwdTracking: boolean;
  enableGitIntegration: boolean;
  promptPattern?: RegExp;
}

export interface ParsedCommand {
  raw: string;
  command: string;
  args: string[];
  flags: Record<string, string | boolean>;
  pipes: string[];
  redirects: { type: 'in' | 'out' | 'append' | 'err'; target: string }[];
}

export interface AIHookConfig {
  enableAutoFix: boolean;
  enableCommandSuggestions: boolean;
  enableOutputAnalysis: boolean;
  maxOutputCapture: number;
  confidenceThreshold: number;
}

export interface TerminalError {
  type: 'syntax' | 'command_not_found' | 'permission' | 'runtime' | 'unknown';
  message: string;
  command?: string;
  suggestion?: string;
  exitCode?: number;
}

export interface CapturedOutput {
  terminalId: string;
  commandId: string;
  fullOutput: string;
  strippedOutput: string;
  lines: string[];
  errors: TerminalError[];
  capturedAt: Date;
}
