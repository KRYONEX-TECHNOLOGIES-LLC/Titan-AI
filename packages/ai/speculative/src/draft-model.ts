/**
 * Titan AI Speculative - Draft Model
 * Fast local model for speculative token generation
 */

import type { DraftPrediction, BlockType } from './types.js';

export interface DraftModelConfig {
  model: string;
  speculativeCount: number;
  temperature?: number;
  topP?: number;
  topK?: number;
}

export interface DraftRequest {
  prefix: string;
  suffix?: string;
  language: string;
  blockType: BlockType;
  speculativeCount?: number;
}

export class DraftModel {
  private config: DraftModelConfig;
  private ollamaBaseUrl: string;

  constructor(config: DraftModelConfig) {
    this.config = {
      temperature: 0.2, // Low temperature for more deterministic predictions
      topP: 0.9,
      topK: 40,
      ...config,
    };
    this.ollamaBaseUrl = 'http://localhost:11434';
  }

  /**
   * Generate draft prediction
   */
  async predict(request: DraftRequest): Promise<DraftPrediction> {
    const startTime = Date.now();
    const speculativeCount = request.speculativeCount ?? this.config.speculativeCount;

    try {
      // Build prompt based on block type
      const prompt = this.buildPrompt(request);

      // Call Ollama for fast local inference
      const response = await this.callOllama(prompt, speculativeCount);

      // Tokenize response
      const tokens = this.tokenize(response, speculativeCount);

      // Calculate confidence scores
      const confidence = this.calculateConfidence(tokens, request.language);

      return {
        tokens,
        confidence,
        blockType: request.blockType,
        speculativeCount,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      // Return empty prediction on error
      return {
        tokens: [],
        confidence: [],
        blockType: request.blockType,
        speculativeCount,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Build prompt for draft model
   */
  private buildPrompt(request: DraftRequest): string {
    const { prefix, suffix, language } = request;

    // Use fill-in-the-middle format if suffix provided
    if (suffix) {
      return `<fim_prefix>${prefix}<fim_suffix>${suffix}<fim_middle>`;
    }

    // Standard completion
    return prefix;
  }

  /**
   * Call Ollama for inference
   */
  private async callOllama(prompt: string, maxTokens: number): Promise<string> {
    const response = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        stream: false,
        options: {
          temperature: this.config.temperature,
          top_p: this.config.topP,
          top_k: this.config.topK,
          num_predict: maxTokens * 4, // Request more to get enough tokens
          stop: ['\n\n', '```', '<fim_', '</s>'],
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json() as { response: string };
    return data.response;
  }

  /**
   * Tokenize response into speculative tokens
   */
  private tokenize(text: string, maxTokens: number): string[] {
    // Simple tokenization by splitting on common boundaries
    // In production, use the actual tokenizer for the model
    const tokens: string[] = [];
    let current = '';

    for (const char of text) {
      current += char;

      // Split on word boundaries, operators, etc.
      if (this.isTokenBoundary(char, current)) {
        if (current.trim()) {
          tokens.push(current);
        }
        current = '';

        if (tokens.length >= maxTokens) {
          break;
        }
      }
    }

    // Add remaining
    if (current.trim() && tokens.length < maxTokens) {
      tokens.push(current);
    }

    return tokens.slice(0, maxTokens);
  }

  /**
   * Check if character is a token boundary
   */
  private isTokenBoundary(char: string, current: string): boolean {
    // Whitespace
    if (/\s/.test(char)) return true;

    // Operators and punctuation
    if (/[(){}[\];,.<>:=+\-*/&|!?@#$%^~`]/.test(char)) {
      return current.length > 1;
    }

    // After alphanumeric to operator transition
    if (current.length > 1) {
      const prev = current[current.length - 2];
      if (/[a-zA-Z0-9_]/.test(prev) && /[^a-zA-Z0-9_]/.test(char)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate confidence scores for tokens
   */
  private calculateConfidence(tokens: string[], language: string): number[] {
    return tokens.map((token, index) => {
      let confidence = 0.7; // Base confidence

      // Higher confidence for common patterns
      if (this.isCommonPattern(token, language)) {
        confidence += 0.2;
      }

      // Lower confidence for later tokens (more speculative)
      confidence -= index * 0.02;

      // Clamp to valid range
      return Math.max(0.1, Math.min(0.99, confidence));
    });
  }

  /**
   * Check if token is a common pattern
   */
  private isCommonPattern(token: string, language: string): boolean {
    const commonPatterns: Record<string, string[]> = {
      typescript: ['const', 'let', 'function', 'return', 'async', 'await', '=>', '{}', '()', ';'],
      javascript: ['const', 'let', 'function', 'return', 'async', 'await', '=>', '{}', '()', ';'],
      python: ['def', 'return', 'if', 'else', 'for', 'in', ':', 'self', 'None', 'True', 'False'],
      rust: ['fn', 'let', 'mut', 'impl', 'pub', 'struct', 'enum', '->', '=>', ';'],
      go: ['func', 'var', 'return', 'if', 'for', 'range', 'err', 'nil', ':=', '{}'],
    };

    const patterns = commonPatterns[language] ?? [];
    return patterns.some(p => token.includes(p));
  }

  /**
   * Set Ollama base URL
   */
  setBaseUrl(url: string): void {
    this.ollamaBaseUrl = url;
  }

  /**
   * Check if draft model is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) return false;

      const data = await response.json() as { models: Array<{ name: string }> };
      return data.models.some(m => m.name === this.config.model);
    } catch {
      return false;
    }
  }

  /**
   * Get model info
   */
  async getModelInfo(): Promise<{ name: string; size: number; quantization: string } | null> {
    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: this.config.model }),
      });

      if (!response.ok) return null;

      const data = await response.json() as {
        modelfile: string;
        parameters: string;
        details: { parameter_size: string; quantization_level: string };
      };

      return {
        name: this.config.model,
        size: parseInt(data.details.parameter_size) || 0,
        quantization: data.details.quantization_level || 'unknown',
      };
    } catch {
      return null;
    }
  }
}
