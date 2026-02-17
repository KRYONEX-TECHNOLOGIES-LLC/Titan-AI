/**
 * Terminal output capture and processing
 */

import { EventEmitter } from 'events';
import type { CapturedOutput, TerminalError } from './types';

// Dynamic import for strip-ansi (ESM module)
let stripAnsi: (text: string) => string;

async function loadStripAnsi(): Promise<void> {
  if (!stripAnsi) {
    const module = await import('strip-ansi');
    stripAnsi = module.default;
  }
}

export interface OutputCaptureConfig {
  maxBufferSize: number;
  stripAnsiCodes: boolean;
  detectErrors: boolean;
}

export class OutputCapture extends EventEmitter {
  private config: OutputCaptureConfig;
  private buffers: Map<string, string> = new Map();
  private captures: Map<string, CapturedOutput[]> = new Map();

  constructor(config: Partial<OutputCaptureConfig> = {}) {
    super();
    this.config = {
      maxBufferSize: 1024 * 1024, // 1MB
      stripAnsiCodes: true,
      detectErrors: true,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    await loadStripAnsi();
  }

  appendOutput(terminalId: string, commandId: string, data: string): void {
    const key = `${terminalId}:${commandId}`;
    const existing = this.buffers.get(key) || '';
    let newBuffer = existing + data;

    // Truncate if exceeds max size
    if (newBuffer.length > this.config.maxBufferSize) {
      newBuffer = newBuffer.slice(-this.config.maxBufferSize);
    }

    this.buffers.set(key, newBuffer);
  }

  async finalize(terminalId: string, commandId: string): Promise<CapturedOutput> {
    const key = `${terminalId}:${commandId}`;
    const fullOutput = this.buffers.get(key) || '';
    
    let strippedOutput = fullOutput;
    if (this.config.stripAnsiCodes && stripAnsi) {
      strippedOutput = stripAnsi(fullOutput);
    }

    const lines = strippedOutput.split('\n');
    const errors = this.config.detectErrors ? this.detectErrors(strippedOutput) : [];

    const captured: CapturedOutput = {
      terminalId,
      commandId,
      fullOutput,
      strippedOutput,
      lines,
      errors,
      capturedAt: new Date(),
    };

    // Store in captures
    const terminalCaptures = this.captures.get(terminalId) || [];
    terminalCaptures.push(captured);
    this.captures.set(terminalId, terminalCaptures);

    // Clear buffer
    this.buffers.delete(key);

    this.emit('captured', captured);
    return captured;
  }

  private detectErrors(output: string): TerminalError[] {
    const errors: TerminalError[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const error = this.parseErrorLine(line);
      if (error) {
        errors.push(error);
      }
    }

    return errors;
  }

  private parseErrorLine(line: string): TerminalError | null {
    // Command not found
    if (/command not found|is not recognized|not found/i.test(line)) {
      const commandMatch = line.match(/['"]?(\w+)['"]?\s*(?:command not found|is not recognized)/i);
      return {
        type: 'command_not_found',
        message: line.trim(),
        command: commandMatch?.[1],
        suggestion: commandMatch?.[1] ? `Check if '${commandMatch[1]}' is installed and in PATH` : undefined,
      };
    }

    // Permission denied
    if (/permission denied|access denied|forbidden/i.test(line)) {
      return {
        type: 'permission',
        message: line.trim(),
        suggestion: 'Try running with elevated privileges or check file permissions',
      };
    }

    // Syntax error
    if (/syntax error|unexpected token|parsing error/i.test(line)) {
      return {
        type: 'syntax',
        message: line.trim(),
        suggestion: 'Check the command syntax',
      };
    }

    // Runtime errors
    if (/error:|fatal:|exception:|failed:/i.test(line)) {
      return {
        type: 'runtime',
        message: line.trim(),
      };
    }

    return null;
  }

  getCaptures(terminalId: string, limit?: number): CapturedOutput[] {
    const captures = this.captures.get(terminalId) || [];
    if (limit) {
      return captures.slice(-limit);
    }
    return captures;
  }

  getLastCapture(terminalId: string): CapturedOutput | undefined {
    const captures = this.captures.get(terminalId) || [];
    return captures[captures.length - 1];
  }

  searchOutput(terminalId: string, pattern: string | RegExp): CapturedOutput[] {
    const captures = this.captures.get(terminalId) || [];
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    
    return captures.filter(capture => regex.test(capture.strippedOutput));
  }

  getErrors(terminalId: string): TerminalError[] {
    const captures = this.captures.get(terminalId) || [];
    return captures.flatMap(c => c.errors);
  }

  clearCaptures(terminalId: string): void {
    this.captures.delete(terminalId);
    
    // Clear related buffers
    for (const key of this.buffers.keys()) {
      if (key.startsWith(`${terminalId}:`)) {
        this.buffers.delete(key);
      }
    }

    this.emit('cleared', { terminalId });
  }

  getBufferSize(terminalId: string, commandId: string): number {
    const key = `${terminalId}:${commandId}`;
    return this.buffers.get(key)?.length || 0;
  }
}

/**
 * Creates an output capture instance
 */
export async function createOutputCapture(config?: Partial<OutputCaptureConfig>): Promise<OutputCapture> {
  const capture = new OutputCapture(config);
  await capture.initialize();
  return capture;
}
