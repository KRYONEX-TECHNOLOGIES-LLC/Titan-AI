/**
 * Titan AI Security - Injection Detector
 * Detect prompt injection and jailbreak attempts
 */

import type { ThreatDetection, ThreatType } from './types.js';

export interface InjectionDetectorConfig {
  strictMode: boolean;
  customPatterns?: Array<{ pattern: RegExp; type: ThreatType; description: string }>;
}

export class InjectionDetector {
  private config: InjectionDetectorConfig;

  // Known injection patterns
  private static readonly INJECTION_PATTERNS: Array<{
    pattern: RegExp;
    type: ThreatType;
    severity: ThreatDetection['severity'];
    description: string;
  }> = [
    // Prompt injection attempts
    {
      pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
      type: 'prompt_injection',
      severity: 'high',
      description: 'Attempt to override previous instructions',
    },
    {
      pattern: /disregard\s+(all\s+)?(previous|prior|system)\s+/i,
      type: 'prompt_injection',
      severity: 'high',
      description: 'Attempt to disregard system instructions',
    },
    {
      pattern: /you\s+are\s+now\s+(a|an|the)\s+/i,
      type: 'jailbreak_attempt',
      severity: 'medium',
      description: 'Attempt to redefine AI identity',
    },
    {
      pattern: /pretend\s+(you\s+are|to\s+be)\s+/i,
      type: 'jailbreak_attempt',
      severity: 'medium',
      description: 'Role-playing manipulation attempt',
    },
    {
      pattern: /\[system\]|\[SYSTEM\]|<system>|<SYSTEM>/,
      type: 'prompt_injection',
      severity: 'critical',
      description: 'Fake system message injection',
    },
    {
      pattern: /bypass\s+(safety|security|filter|restriction)/i,
      type: 'jailbreak_attempt',
      severity: 'critical',
      description: 'Explicit bypass attempt',
    },

    // Command injection
    {
      pattern: /;\s*(rm|del|format|shutdown|reboot)\s+/i,
      type: 'command_injection',
      severity: 'critical',
      description: 'Dangerous command injection',
    },
    {
      pattern: /\$\(.*\)|`.*`|\|\s*sh\b|\|\s*bash\b/,
      type: 'command_injection',
      severity: 'high',
      description: 'Shell command substitution',
    },

    // Path traversal
    {
      pattern: /\.\.[/\\]/,
      type: 'path_traversal',
      severity: 'medium',
      description: 'Path traversal attempt',
    },

    // Unsafe eval
    {
      pattern: /eval\s*\(|Function\s*\(|setTimeout\s*\([^,]*,/,
      type: 'unsafe_eval',
      severity: 'high',
      description: 'Dynamic code execution',
    },

    // SQL injection patterns
    {
      pattern: /'\s*(OR|AND)\s+'?\d+'\s*=\s*'?\d+/i,
      type: 'sql_injection',
      severity: 'high',
      description: 'SQL injection attempt',
    },
    {
      pattern: /UNION\s+(ALL\s+)?SELECT/i,
      type: 'sql_injection',
      severity: 'high',
      description: 'SQL UNION injection',
    },
  ];

  constructor(config: Partial<InjectionDetectorConfig> = {}) {
    this.config = {
      strictMode: false,
      ...config,
    };
  }

  /**
   * Scan text for injection attempts
   */
  scan(text: string): ThreatDetection[] {
    const threats: ThreatDetection[] = [];
    let id = 0;

    // Check built-in patterns
    for (const { pattern, type, severity, description } of InjectionDetector.INJECTION_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        threats.push({
          id: `threat-${++id}`,
          type,
          severity,
          description,
          location: {
            content: match[0],
          },
          recommendation: this.getRecommendation(type),
        });
      }
    }

    // Check custom patterns
    if (this.config.customPatterns) {
      for (const { pattern, type, description } of this.config.customPatterns) {
        const match = text.match(pattern);
        if (match) {
          threats.push({
            id: `threat-${++id}`,
            type,
            severity: 'medium',
            description,
            location: {
              content: match[0],
            },
            recommendation: this.getRecommendation(type),
          });
        }
      }
    }

    // Additional checks in strict mode
    if (this.config.strictMode) {
      const strictThreats = this.strictModeChecks(text);
      threats.push(...strictThreats.map((t, i) => ({ ...t, id: `threat-${++id}` })));
    }

    return threats;
  }

  /**
   * Check if text is safe (no threats detected)
   */
  isSafe(text: string): boolean {
    const threats = this.scan(text);
    return threats.length === 0;
  }

  /**
   * Get highest severity threat
   */
  getHighestSeverity(threats: ThreatDetection[]): ThreatDetection['severity'] | null {
    const severityOrder: ThreatDetection['severity'][] = ['critical', 'high', 'medium', 'low'];
    
    for (const severity of severityOrder) {
      if (threats.some(t => t.severity === severity)) {
        return severity;
      }
    }

    return null;
  }

  /**
   * Sanitize text by removing detected threats
   */
  sanitize(text: string): string {
    let result = text;

    for (const { pattern } of InjectionDetector.INJECTION_PATTERNS) {
      result = result.replace(pattern, '[REDACTED]');
    }

    return result;
  }

  /**
   * Additional checks for strict mode
   */
  private strictModeChecks(text: string): Omit<ThreatDetection, 'id'>[] {
    const threats: Omit<ThreatDetection, 'id'>[] = [];

    // Check for excessive special characters
    const specialCharRatio = (text.match(/[<>{}[\]|;$`]/g)?.length ?? 0) / text.length;
    if (specialCharRatio > 0.1) {
      threats.push({
        type: 'prompt_injection',
        severity: 'low',
        description: 'Unusual concentration of special characters',
        recommendation: 'Review content for potential injection attempts',
      });
    }

    // Check for base64-encoded content that might hide malicious payloads
    const base64Pattern = /(?:[A-Za-z0-9+/]{4}){10,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/;
    if (base64Pattern.test(text)) {
      threats.push({
        type: 'prompt_injection',
        severity: 'low',
        description: 'Potentially encoded content detected',
        recommendation: 'Decode and inspect base64 content',
      });
    }

    return threats;
  }

  /**
   * Get recommendation for threat type
   */
  private getRecommendation(type: ThreatType): string {
    const recommendations: Record<ThreatType, string> = {
      prompt_injection: 'Sanitize user input and maintain strict context boundaries',
      jailbreak_attempt: 'Reject the request and log the attempt',
      secret_exposure: 'Remove sensitive data and use environment variables',
      path_traversal: 'Validate and sanitize file paths',
      command_injection: 'Use parameterized commands and whitelist allowed operations',
      xss: 'Escape HTML and use Content Security Policy',
      sql_injection: 'Use parameterized queries',
      unsafe_eval: 'Avoid dynamic code execution',
    };

    return recommendations[type] ?? 'Review and sanitize input';
  }
}
