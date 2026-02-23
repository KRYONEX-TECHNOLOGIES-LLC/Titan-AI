/**
 * Command parser for terminal commands
 */

import type { ParsedCommand } from './types';

export class CommandParser {
  /**
   * Parse a shell command string
   */
  parse(command: string): ParsedCommand {
    const raw = command.trim();
    
    // Extract pipes
    const pipes = this.extractPipes(raw);
    
    // Extract redirects
    const redirects = this.extractRedirects(raw);
    
    // Get the main command (first part before pipes/redirects)
    const mainPart = raw.split(/[|<>]/).shift()?.trim() || raw;
    
    // Parse command and arguments
    const tokens = this.tokenize(mainPart);
    const cmd = tokens[0] || '';
    const args = tokens.slice(1);
    
    // Parse flags
    const flags = this.parseFlags(args);
    
    return {
      raw,
      command: cmd,
      args: args.filter(a => !a.startsWith('-')),
      flags,
      pipes,
      redirects,
    };
  }

  /**
   * Tokenize a command string respecting quotes
   */
  private tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote: string | null = null;
    let escape = false;

    for (const char of input) {
      if (escape) {
        current += char;
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if ((char === '"' || char === "'") && !inQuote) {
        inQuote = char;
        continue;
      }

      if (char === inQuote) {
        inQuote = null;
        continue;
      }

      if (char === ' ' && !inQuote) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }

      current += char;
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  /**
   * Extract piped commands
   */
  private extractPipes(command: string): string[] {
    // Simple pipe extraction (doesn't handle quotes)
    const parts = command.split('|');
    if (parts.length <= 1) return [];
    
    return parts.slice(1).map(p => (p.trim().split(/[<>]/)[0] ?? '').trim());
  }

  /**
   * Extract redirects
   */
  private extractRedirects(command: string): { type: 'in' | 'out' | 'append' | 'err'; target: string }[] {
    const redirects: { type: 'in' | 'out' | 'append' | 'err'; target: string }[] = [];

    // Output append (>>)
    const appendMatch = command.match(/>>\s*(\S+)/g);
    if (appendMatch) {
      for (const match of appendMatch) {
        const target = match.replace(/>>\s*/, '');
        redirects.push({ type: 'append', target });
      }
    }

    // Stderr redirect (2>)
    const errMatch = command.match(/2>\s*(\S+)/g);
    if (errMatch) {
      for (const match of errMatch) {
        const target = match.replace(/2>\s*/, '');
        redirects.push({ type: 'err', target });
      }
    }

    // Output redirect (>)
    const outMatch = command.match(/(?<!>|2)>\s*(\S+)/g);
    if (outMatch) {
      for (const match of outMatch) {
        const target = match.replace(/>\s*/, '');
        redirects.push({ type: 'out', target });
      }
    }

    // Input redirect (<)
    const inMatch = command.match(/<\s*(\S+)/g);
    if (inMatch) {
      for (const match of inMatch) {
        const target = match.replace(/<\s*/, '');
        redirects.push({ type: 'in', target });
      }
    }

    return redirects;
  }

  /**
   * Parse flags from arguments
   */
  private parseFlags(args: string[]): Record<string, string | boolean> {
    const flags: Record<string, string | boolean> = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg?.startsWith('--') && arg.includes('=')) {
        const [key, value] = arg.slice(2).split('=');
        if (key) {
          flags[key] = value ?? true;
        }
        continue;
      }

      // Long flag (--flag)
      if (arg?.startsWith('--')) {
        const key = arg.slice(2);
        // Check if next arg is a value
        if (i + 1 < args.length && !args[i + 1]?.startsWith('-')) {
          flags[key] = args[++i];
        } else {
          flags[key] = true;
        }
        continue;
      }

      // Short flag (-f)
      if (arg?.startsWith('-') && arg.length === 2) {
        const key = arg.slice(1);
        // Check if next arg is a value
        if (i + 1 < args.length && !args[i + 1]?.startsWith('-')) {
          flags[key] = args[++i];
        } else {
          flags[key] = true;
        }
        continue;
      }

      // Combined short flags (-abc)
      if (arg?.startsWith('-') && arg.length > 2) {
        const chars = arg.slice(1).split('');
        for (const char of chars) {
          flags[char] = true;
        }
      }
    }

    return flags;
  }

  /**
   * Check if command is dangerous
   */
  isDangerous(command: string): { dangerous: boolean; reason?: string } {
    const parsed = this.parse(command);
    const cmd = parsed.command.toLowerCase();

    const dangerousCommands: Record<string, string> = {
      'rm': 'File deletion command',
      'del': 'File deletion command',
      'rmdir': 'Directory deletion command',
      'format': 'Disk format command',
      'mkfs': 'Filesystem creation command',
      'dd': 'Low-level disk write command',
      ':(){:|:&};:': 'Fork bomb',
      'chmod': 'Permission change command',
      'chown': 'Ownership change command',
      'shutdown': 'System shutdown command',
      'reboot': 'System reboot command',
      'kill': 'Process termination command',
      'killall': 'Bulk process termination command',
    };

    if (dangerousCommands[cmd]) {
      return { dangerous: true, reason: dangerousCommands[cmd] };
    }

    // Check for dangerous flags
    if (cmd === 'rm' && (parsed.flags['r'] || parsed.flags['rf'] || parsed.flags['f'])) {
      return { dangerous: true, reason: 'Recursive or forced file deletion' };
    }

    // Check for sudo/admin
    if (cmd === 'sudo' || cmd === 'runas') {
      return { dangerous: true, reason: 'Elevated privilege command' };
    }

    return { dangerous: false };
  }

  /**
   * Suggest similar commands for typos
   */
  suggestCorrections(typo: string): string[] {
    const commonCommands = [
      'ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'grep', 'find',
      'git', 'npm', 'node', 'python', 'pip', 'docker', 'curl', 'wget',
      'echo', 'touch', 'chmod', 'chown', 'tar', 'zip', 'unzip',
      'ssh', 'scp', 'rsync', 'vim', 'nano', 'less', 'more', 'head', 'tail',
    ];

    return commonCommands
      .map(cmd => ({ cmd, distance: this.levenshteinDistance(typo, cmd) }))
      .filter(item => item.distance <= 2)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .map(item => item.cmd);
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}

/**
 * Creates a command parser instance
 */
export function createCommandParser(): CommandParser {
  return new CommandParser();
}
