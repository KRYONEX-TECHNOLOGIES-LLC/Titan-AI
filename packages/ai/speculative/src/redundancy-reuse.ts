/**
 * Titan AI Speculative - Redundancy Reuse
 * Identify and reuse existing code segments
 */

import type { RedundancyAnalysis, ReusableSegment } from './types.js';

export interface RedundancyConfig {
  threshold: number;
  minSegmentLength: number;
  maxSegments: number;
}

export class RedundancyAnalyzer {
  private config: RedundancyConfig;

  constructor(config: Partial<RedundancyConfig> = {}) {
    this.config = {
      threshold: 0.7,
      minSegmentLength: 10,
      maxSegments: 20,
      ...config,
    };
  }

  /**
   * Analyze code for reusable segments
   */
  analyze(code: string): RedundancyAnalysis {
    const segments = this.findReusableSegments(code);

    const totalCharacters = code.length;
    const reusableCharacters = segments.reduce(
      (sum, seg) => sum + seg.content.length,
      0
    );

    return {
      reusableSegments: segments,
      totalCharacters,
      reusableCharacters,
      reusabilityRatio: totalCharacters > 0 ? reusableCharacters / totalCharacters : 0,
    };
  }

  /**
   * Find segments that are likely to be reused
   */
  private findReusableSegments(code: string): ReusableSegment[] {
    const segments: ReusableSegment[] = [];

    // Find repeated patterns
    const patterns = this.findRepeatedPatterns(code);
    for (const pattern of patterns) {
      const matches = this.findPatternOccurrences(code, pattern);
      if (matches.length > 1) {
        segments.push(...matches);
      }
    }

    // Find common code structures
    const structures = this.findCommonStructures(code);
    segments.push(...structures);

    // Deduplicate overlapping segments
    const deduped = this.deduplicateSegments(segments);

    // Sort by confidence and limit
    return deduped
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxSegments);
  }

  /**
   * Find repeated patterns in code
   */
  private findRepeatedPatterns(code: string): string[] {
    const patterns: Map<string, number> = new Map();
    const minLength = this.config.minSegmentLength;

    // Sliding window to find repeated substrings
    for (let length = minLength; length <= Math.min(100, code.length / 2); length++) {
      for (let i = 0; i <= code.length - length; i++) {
        const substr = code.slice(i, i + length);

        // Skip if mostly whitespace
        if (substr.trim().length < minLength / 2) continue;

        const count = patterns.get(substr) ?? 0;
        patterns.set(substr, count + 1);
      }
    }

    // Return patterns that appear multiple times
    return Array.from(patterns.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[0].length * b[1] - a[0].length * a[1])
      .slice(0, 50)
      .map(([pattern]) => pattern);
  }

  /**
   * Find occurrences of a pattern
   */
  private findPatternOccurrences(code: string, pattern: string): ReusableSegment[] {
    const segments: ReusableSegment[] = [];
    let index = 0;

    while (true) {
      const found = code.indexOf(pattern, index);
      if (found === -1) break;

      segments.push({
        start: found,
        end: found + pattern.length,
        content: pattern,
        confidence: this.calculatePatternConfidence(pattern),
      });

      index = found + 1;
    }

    return segments;
  }

  /**
   * Find common code structures
   */
  private findCommonStructures(code: string): ReusableSegment[] {
    const segments: ReusableSegment[] = [];

    // Find function signatures
    const funcRegex = /(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)=>)/g;
    let match;
    while ((match = funcRegex.exec(code)) !== null) {
      if (match[0].length >= this.config.minSegmentLength) {
        segments.push({
          start: match.index,
          end: match.index + match[0].length,
          content: match[0],
          confidence: 0.8,
        });
      }
    }

    // Find import statements
    const importRegex = /import\s+.*?from\s+['"][^'"]+['"]/g;
    while ((match = importRegex.exec(code)) !== null) {
      segments.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[0],
        confidence: 0.9,
      });
    }

    // Find type definitions
    const typeRegex = /(?:interface|type)\s+\w+\s*(?:<[^>]*>)?\s*(?:=|{)/g;
    while ((match = typeRegex.exec(code)) !== null) {
      if (match[0].length >= this.config.minSegmentLength) {
        segments.push({
          start: match.index,
          end: match.index + match[0].length,
          content: match[0],
          confidence: 0.85,
        });
      }
    }

    return segments;
  }

  /**
   * Calculate confidence for a pattern
   */
  private calculatePatternConfidence(pattern: string): number {
    let confidence = 0.5;

    // Higher confidence for longer patterns
    confidence += Math.min(0.2, pattern.length / 100);

    // Higher confidence for structured code
    if (pattern.includes('{')) confidence += 0.1;
    if (pattern.includes('function') || pattern.includes('const')) confidence += 0.1;
    if (pattern.includes('return')) confidence += 0.05;

    // Lower confidence for highly variable content
    const variableRatio = (pattern.match(/\w+/g)?.length ?? 0) / pattern.length;
    if (variableRatio > 0.5) confidence -= 0.1;

    return Math.max(0.3, Math.min(0.95, confidence));
  }

  /**
   * Remove overlapping segments
   */
  private deduplicateSegments(segments: ReusableSegment[]): ReusableSegment[] {
    const sorted = segments.sort((a, b) => a.start - b.start);
    const result: ReusableSegment[] = [];

    for (const segment of sorted) {
      const overlapping = result.find(
        existing =>
          (segment.start >= existing.start && segment.start < existing.end) ||
          (segment.end > existing.start && segment.end <= existing.end)
      );

      if (!overlapping) {
        result.push(segment);
      } else if (segment.confidence > overlapping.confidence) {
        // Replace with higher confidence segment
        const index = result.indexOf(overlapping);
        result[index] = segment;
      }
    }

    return result;
  }

  /**
   * Check if a segment can be reused
   */
  canReuse(segment: ReusableSegment): boolean {
    return segment.confidence >= this.config.threshold;
  }

  /**
   * Get reusability score for code
   */
  getReusabilityScore(code: string): number {
    const analysis = this.analyze(code);
    return analysis.reusabilityRatio;
  }
}
