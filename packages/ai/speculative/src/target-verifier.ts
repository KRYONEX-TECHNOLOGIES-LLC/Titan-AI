/**
 * Titan AI Speculative - Target Verifier
 * Verifies draft predictions with frontier model
 */

import type { VerificationResult, TokenCorrection } from './types.js';

export interface TargetVerifierConfig {
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export class TargetVerifier {
  private config: TargetVerifierConfig;

  constructor(config: TargetVerifierConfig) {
    this.config = {
      baseUrl: 'https://api.anthropic.com/v1',
      ...config,
    };
  }

  /**
   * Verify draft tokens against target model
   */
  async verify(
    prefix: string,
    draftTokens: string[],
    suffix?: string
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    if (draftTokens.length === 0) {
      return {
        accepted: [],
        acceptanceRate: 0,
        finalOutput: '',
        reusedTokens: 0,
        generatedTokens: 0,
        corrections: [],
        latencyMs: 0,
      };
    }

    // Build prompt for verification
    const draftText = draftTokens.join('');
    const verificationPrompt = this.buildVerificationPrompt(prefix, draftText, suffix);

    try {
      // Get target model's completion
      const targetOutput = await this.callTargetModel(verificationPrompt);

      // Compare draft with target output
      const { accepted, corrections } = this.compareOutputs(draftTokens, targetOutput);

      // Calculate statistics
      const acceptanceRate = accepted.filter(Boolean).length / accepted.length;
      const reusedTokens = accepted.filter(Boolean).length;
      const generatedTokens = accepted.length - reusedTokens + (corrections.length > 0 ? 1 : 0);

      // Build final output
      const finalOutput = this.buildFinalOutput(draftTokens, targetOutput, accepted);

      return {
        accepted,
        acceptanceRate,
        finalOutput,
        reusedTokens,
        generatedTokens,
        corrections,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      // On error, reject all draft tokens
      return {
        accepted: draftTokens.map(() => false),
        acceptanceRate: 0,
        finalOutput: '',
        reusedTokens: 0,
        generatedTokens: 0,
        corrections: [],
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Build prompt for verification
   */
  private buildVerificationPrompt(
    prefix: string,
    draft: string,
    suffix?: string
  ): string {
    if (suffix) {
      return `Continue this code. The text between <draft> tags is a suggested completion - verify and correct if needed.

${prefix}<draft>${draft}</draft>${suffix}

Complete the code naturally, using the draft as a starting point but correcting any errors:`;
    }

    return `Continue this code. The text between <draft> tags is a suggested completion - verify and correct if needed.

${prefix}<draft>${draft}</draft>

Complete the code naturally, using the draft as a starting point but correcting any errors:`;
  }

  /**
   * Call target model for verification
   */
  private async callTargetModel(prompt: string): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Target model error: ${response.status}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const textContent = data.content.find(c => c.type === 'text');
    return textContent?.text ?? '';
  }

  /**
   * Compare draft tokens with target output
   */
  private compareOutputs(
    draftTokens: string[],
    targetOutput: string
  ): { accepted: boolean[]; corrections: TokenCorrection[] } {
    const accepted: boolean[] = [];
    const corrections: TokenCorrection[] = [];

    let targetIndex = 0;
    let draftPosition = 0;

    for (let i = 0; i < draftTokens.length; i++) {
      const draftToken = draftTokens[i];
      const targetSlice = targetOutput.slice(targetIndex, targetIndex + draftToken.length * 2);

      // Check for exact match
      if (targetSlice.startsWith(draftToken)) {
        accepted.push(true);
        targetIndex += draftToken.length;
      } else {
        // Check for fuzzy match (ignoring whitespace differences)
        const normalizedDraft = draftToken.trim();
        const normalizedTarget = targetSlice.trim();

        if (normalizedTarget.startsWith(normalizedDraft)) {
          accepted.push(true);
          targetIndex += draftToken.length;
        } else {
          accepted.push(false);

          // Find what the target model generated instead
          const nextToken = this.extractNextToken(targetSlice);
          if (nextToken && nextToken !== draftToken) {
            corrections.push({
              position: draftPosition,
              draft: draftToken,
              corrected: nextToken,
            });
          }
          targetIndex += nextToken?.length ?? 0;
        }
      }

      draftPosition += draftToken.length;
    }

    return { accepted, corrections };
  }

  /**
   * Extract next token from target output
   */
  private extractNextToken(text: string): string {
    // Simple extraction - take until whitespace or operator
    const match = text.match(/^(\S+)/);
    return match?.[1] ?? '';
  }

  /**
   * Build final output from draft and target
   */
  private buildFinalOutput(
    draftTokens: string[],
    targetOutput: string,
    accepted: boolean[]
  ): string {
    // Find the longest prefix of accepted tokens
    let lastAcceptedIndex = -1;
    for (let i = 0; i < accepted.length; i++) {
      if (accepted[i]) {
        lastAcceptedIndex = i;
      } else {
        break; // Stop at first rejection
      }
    }

    if (lastAcceptedIndex === -1) {
      // No tokens accepted, use target output
      return this.extractRelevantOutput(targetOutput, draftTokens[0]);
    }

    // Use accepted draft tokens
    const acceptedText = draftTokens.slice(0, lastAcceptedIndex + 1).join('');

    // If all accepted, return draft
    if (lastAcceptedIndex === draftTokens.length - 1) {
      return acceptedText;
    }

    // Append corrected portion from target
    const remainingTarget = this.extractRelevantOutput(
      targetOutput.slice(acceptedText.length),
      draftTokens[lastAcceptedIndex + 1]
    );

    return acceptedText + remainingTarget;
  }

  /**
   * Extract relevant output from target
   */
  private extractRelevantOutput(output: string, hint: string): string {
    // Find the most relevant portion
    const lines = output.split('\n');

    // Take first meaningful line
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('#')) {
        return trimmed;
      }
    }

    return output.split('\n')[0] ?? '';
  }

  /**
   * Update API configuration
   */
  setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
  }

  /**
   * Update base URL
   */
  setBaseUrl(url: string): void {
    this.config.baseUrl = url;
  }
}
