/**
 * Security Bridge - Injection Detection for Chat API
 * Wraps the @titan/security package patterns for use in the web app
 */

type ThreatType = 'prompt_injection' | 'jailbreak_attempt' | 'command_injection' | 'sql_injection' | 'path_traversal' | 'data_exfiltration';
type Severity = 'low' | 'medium' | 'high' | 'critical';

interface ThreatDetection {
  type: ThreatType;
  severity: Severity;
  description: string;
  matchedPattern: string;
  position: number;
}

const INJECTION_PATTERNS: Array<{
  pattern: RegExp;
  type: ThreatType;
  severity: Severity;
  description: string;
}> = [
  { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i, type: 'prompt_injection', severity: 'high', description: 'Attempt to override previous instructions' },
  { pattern: /disregard\s+(all\s+)?(previous|prior|system)\s+/i, type: 'prompt_injection', severity: 'high', description: 'Attempt to disregard system instructions' },
  { pattern: /you\s+are\s+now\s+(a|an|the)\s+/i, type: 'jailbreak_attempt', severity: 'medium', description: 'Attempt to redefine AI identity' },
  { pattern: /pretend\s+(you('re|\s+are)|to\s+be)\s+/i, type: 'jailbreak_attempt', severity: 'medium', description: 'Attempt to alter AI behavior' },
  { pattern: /\b(rm\s+-rf|del\s+\/[fs]|format\s+c:)/i, type: 'command_injection', severity: 'critical', description: 'Destructive command injection' },
  { pattern: /;\s*(DROP|DELETE|TRUNCATE|ALTER)\s+(TABLE|DATABASE|INDEX)/i, type: 'sql_injection', severity: 'critical', description: 'SQL injection attempt' },
  { pattern: /(\.\.\/(\.\.\/){2,}|\/etc\/(passwd|shadow|hosts))/i, type: 'path_traversal', severity: 'high', description: 'Path traversal attempt' },
  { pattern: /(process\.env|__dirname|__filename)\s*\[/i, type: 'data_exfiltration', severity: 'high', description: 'Environment variable access attempt' },
  { pattern: /\b(eval|exec|Function)\s*\(\s*("|'|`)/i, type: 'command_injection', severity: 'high', description: 'Code evaluation attempt' },
];

export function scanForThreats(input: string): ThreatDetection[] {
  const threats: ThreatDetection[] = [];

  for (const { pattern, type, severity, description } of INJECTION_PATTERNS) {
    const match = input.match(pattern);
    if (match) {
      threats.push({
        type,
        severity,
        description,
        matchedPattern: match[0],
        position: match.index || 0,
      });
    }
  }

  return threats;
}

export function isHighSeverityThreat(threats: ThreatDetection[]): boolean {
  return threats.some(t => t.severity === 'critical' || t.severity === 'high');
}

/**
 * Path Obfuscation for LLM requests
 */
export class PathObfuscator {
  private mappings = new Map<string, string>();
  private reverse = new Map<string, string>();
  private counter = 0;

  obfuscate(path: string): string {
    if (this.mappings.has(path)) return this.mappings.get(path)!;
    const obfuscated = `f${++this.counter}`;
    this.mappings.set(path, obfuscated);
    this.reverse.set(obfuscated, path);
    return obfuscated;
  }

  deobfuscate(token: string): string {
    return this.reverse.get(token) || token;
  }

  obfuscateContent(content: string): string {
    let result = content;
    // Replace common path patterns
    result = result.replace(/(?:\/home\/\w+|C:\\Users\\\w+)/g, '<USER_HOME>');
    result = result.replace(/(?:\/[a-zA-Z0-9_.-]+){3,}/g, (match) => this.obfuscate(match));
    return result;
  }
}
