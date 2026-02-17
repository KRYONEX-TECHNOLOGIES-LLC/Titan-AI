/**
 * Titan AI Security - Secrets Scanner
 * Detect exposed secrets in code
 */

import type { SecretFinding, SecretType } from './types.js';

export interface SecretsScannerConfig {
  customPatterns?: Array<{ type: SecretType; pattern: RegExp }>;
  entropyThreshold?: number;
}

export class SecretsScanner {
  private config: SecretsScannerConfig;

  // Known secret patterns
  private static readonly SECRET_PATTERNS: Array<{
    type: SecretType;
    pattern: RegExp;
    entropy?: number;
  }> = [
    // API Keys
    { type: 'api_key', pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi },
    { type: 'api_key', pattern: /sk-[a-zA-Z0-9]{48}/g }, // OpenAI
    { type: 'api_key', pattern: /sk-ant-[a-zA-Z0-9-]{95}/g }, // Anthropic

    // AWS
    { type: 'aws_credentials', pattern: /AKIA[0-9A-Z]{16}/g },
    { type: 'aws_credentials', pattern: /aws[_-]?secret[_-]?access[_-]?key\s*[:=]\s*['"]?([a-zA-Z0-9/+=]{40})['"]?/gi },

    // Private Keys
    { type: 'private_key', pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g },
    { type: 'private_key', pattern: /-----BEGIN\s+(?:EC\s+)?PRIVATE\s+KEY-----/g },

    // Tokens
    { type: 'token', pattern: /(?:bearer|token|auth)\s*[:=]\s*['"]?([a-zA-Z0-9_.-]{20,})['"]?/gi },
    { type: 'jwt', pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g },

    // Database URLs
    { type: 'database_url', pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^\s"']+/gi },

    // Generic secrets
    { type: 'password', pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"]?([^\s'"]{8,})['"]?/gi },
    { type: 'generic_secret', pattern: /(?:secret|credential|private)\s*[:=]\s*['"]?([^\s'"]{10,})['"]?/gi },

    // GCP
    { type: 'gcp_credentials', pattern: /"private_key":\s*"-----BEGIN.*-----/g },

    // Azure
    { type: 'azure_credentials', pattern: /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[^;]+/gi },
  ];

  constructor(config: SecretsScannerConfig = {}) {
    this.config = {
      entropyThreshold: 4.0,
      ...config,
    };
  }

  /**
   * Scan file content for secrets
   */
  scanContent(content: string, filePath: string): SecretFinding[] {
    const findings: SecretFinding[] = [];
    const lines = content.split('\n');

    // Check each pattern
    for (const { type, pattern } of SecretsScanner.SECRET_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;

      let match;
      while ((match = pattern.exec(content)) !== null) {
        const location = this.getLocation(content, match.index);
        const value = match[1] ?? match[0];

        // Check entropy for generic patterns
        if (type === 'generic_secret' || type === 'password') {
          const entropy = this.calculateEntropy(value);
          if (entropy < (this.config.entropyThreshold ?? 4.0)) {
            continue;
          }
        }

        findings.push({
          type,
          value: this.maskSecret(value),
          file: filePath,
          line: location.line,
          column: location.column,
          entropy: this.calculateEntropy(value),
        });
      }
    }

    // Check custom patterns
    if (this.config.customPatterns) {
      for (const { type, pattern } of this.config.customPatterns) {
        pattern.lastIndex = 0;

        let match;
        while ((match = pattern.exec(content)) !== null) {
          const location = this.getLocation(content, match.index);

          findings.push({
            type,
            value: this.maskSecret(match[0]),
            file: filePath,
            line: location.line,
            column: location.column,
          });
        }
      }
    }

    return this.deduplicateFindings(findings);
  }

  /**
   * Check if content contains secrets
   */
  hasSecrets(content: string): boolean {
    for (const { pattern } of SecretsScanner.SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Redact secrets from content
   */
  redactSecrets(content: string): string {
    let result = content;

    for (const { pattern } of SecretsScanner.SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      result = result.replace(pattern, match => '[REDACTED]');
    }

    return result;
  }

  /**
   * Get line and column from index
   */
  private getLocation(content: string, index: number): { line: number; column: number } {
    const lines = content.substring(0, index).split('\n');
    return {
      line: lines.length,
      column: (lines[lines.length - 1]?.length ?? 0) + 1,
    };
  }

  /**
   * Mask secret value for safe display
   */
  private maskSecret(value: string): string {
    if (value.length <= 8) {
      return '****';
    }
    return value.substring(0, 4) + '...' + value.substring(value.length - 4);
  }

  /**
   * Calculate Shannon entropy
   */
  private calculateEntropy(str: string): number {
    const freq: Record<string, number> = {};
    for (const char of str) {
      freq[char] = (freq[char] ?? 0) + 1;
    }

    let entropy = 0;
    const len = str.length;

    for (const count of Object.values(freq)) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Remove duplicate findings
   */
  private deduplicateFindings(findings: SecretFinding[]): SecretFinding[] {
    const seen = new Set<string>();
    return findings.filter(f => {
      const key = `${f.file}:${f.line}:${f.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
