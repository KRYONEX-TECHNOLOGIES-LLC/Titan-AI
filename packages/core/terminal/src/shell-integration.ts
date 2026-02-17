/**
 * Shell integration for command detection and tracking
 */

import { EventEmitter } from 'events';
import type { ShellIntegrationConfig, CommandExecution } from './types';

export class ShellIntegration extends EventEmitter {
  private config: ShellIntegrationConfig;
  private currentCommand: Partial<CommandExecution> | null = null;
  private commandHistory: CommandExecution[] = [];
  private outputBuffer: string = '';
  private cwdCache: Map<string, string> = new Map();
  private commandIdCounter: number = 0;

  constructor(config: Partial<ShellIntegrationConfig> = {}) {
    super();
    this.config = {
      enableCommandDetection: true,
      enableCwdTracking: true,
      enableGitIntegration: true,
      promptPattern: /[$#%>]\s*$/,
      ...config,
    };
  }

  /**
   * Process incoming terminal data
   */
  processData(terminalId: string, data: string): void {
    this.outputBuffer += data;

    // Detect command start (user pressed Enter after typing)
    if (this.config.enableCommandDetection && data.includes('\r') || data.includes('\n')) {
      this.detectCommandStart(terminalId);
    }

    // Detect command end (prompt reappears)
    if (this.config.promptPattern && this.config.promptPattern.test(this.outputBuffer)) {
      this.detectCommandEnd(terminalId);
    }

    // Track CWD changes
    if (this.config.enableCwdTracking) {
      this.detectCwdChange(terminalId);
    }
  }

  private detectCommandStart(terminalId: string): void {
    // Extract the command from the buffer before the newline
    const lines = this.outputBuffer.split(/\r?\n/);
    const lastLine = lines[lines.length - 2] || '';
    
    // Remove prompt characters
    const command = lastLine.replace(/^.*[$#%>]\s*/, '').trim();
    
    if (command) {
      const id = `cmd-${++this.commandIdCounter}`;
      this.currentCommand = {
        id,
        terminalId,
        command,
        startedAt: new Date(),
        output: '',
        errorOutput: '',
        isRunning: true,
      };
      
      this.emit('command:start', this.currentCommand);
    }
  }

  private detectCommandEnd(terminalId: string): void {
    if (!this.currentCommand || this.currentCommand.terminalId !== terminalId) {
      return;
    }

    // Extract output from buffer
    const output = this.extractCommandOutput();
    
    const execution: CommandExecution = {
      id: this.currentCommand.id!,
      terminalId: this.currentCommand.terminalId!,
      command: this.currentCommand.command!,
      startedAt: this.currentCommand.startedAt!,
      endedAt: new Date(),
      exitCode: this.detectExitCode(output),
      output,
      errorOutput: this.extractErrorOutput(output),
      isRunning: false,
    };

    this.commandHistory.push(execution);
    this.emit('command:end', execution);
    
    this.currentCommand = null;
    this.outputBuffer = '';
  }

  private extractCommandOutput(): string {
    // Remove the command line and prompt from the buffer
    const lines = this.outputBuffer.split(/\r?\n/);
    
    // Remove first line (command) and last line (new prompt)
    const outputLines = lines.slice(1, -1);
    return outputLines.join('\n');
  }

  private extractErrorOutput(output: string): string {
    const errorPatterns = [
      /error:/gi,
      /failed:/gi,
      /exception:/gi,
      /fatal:/gi,
      /warning:/gi,
    ];

    const lines = output.split('\n');
    const errorLines = lines.filter(line => 
      errorPatterns.some(pattern => pattern.test(line))
    );

    return errorLines.join('\n');
  }

  private detectExitCode(output: string): number | undefined {
    // Look for common exit code patterns
    const exitCodeMatch = output.match(/exit(?:ed)?\s*(?:with)?\s*(?:code|status)?\s*[:=]?\s*(\d+)/i);
    if (exitCodeMatch) {
      return parseInt(exitCodeMatch[1], 10);
    }

    // Check for error indicators
    if (/error|failed|fatal/i.test(output)) {
      return 1;
    }

    return undefined;
  }

  private detectCwdChange(terminalId: string): void {
    // Look for CD commands
    const cdMatch = this.outputBuffer.match(/cd\s+(.+?)(?:\r|\n|$)/);
    if (cdMatch) {
      const newCwd = cdMatch[1].trim();
      this.cwdCache.set(terminalId, newCwd);
      this.emit('cwd:changed', { terminalId, cwd: newCwd });
    }
  }

  getCurrentCommand(): Partial<CommandExecution> | null {
    return this.currentCommand;
  }

  getCommandHistory(terminalId?: string, limit?: number): CommandExecution[] {
    let history = this.commandHistory;
    
    if (terminalId) {
      history = history.filter(cmd => cmd.terminalId === terminalId);
    }
    
    if (limit) {
      history = history.slice(-limit);
    }
    
    return history;
  }

  getLastCommand(terminalId?: string): CommandExecution | undefined {
    const history = this.getCommandHistory(terminalId);
    return history[history.length - 1];
  }

  getCwd(terminalId: string): string | undefined {
    return this.cwdCache.get(terminalId);
  }

  clearHistory(terminalId?: string): void {
    if (terminalId) {
      this.commandHistory = this.commandHistory.filter(cmd => cmd.terminalId !== terminalId);
    } else {
      this.commandHistory = [];
    }
    this.emit('history:cleared', { terminalId });
  }

  setPromptPattern(pattern: RegExp): void {
    this.config.promptPattern = pattern;
  }
}

/**
 * Creates a shell integration instance
 */
export function createShellIntegration(config?: Partial<ShellIntegrationConfig>): ShellIntegration {
  return new ShellIntegration(config);
}
