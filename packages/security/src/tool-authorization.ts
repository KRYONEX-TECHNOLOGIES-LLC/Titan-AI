/**
 * Titan AI Security - Tool Authorization
 * Control which tools agents can use
 */

import type { ToolAuthorizationRequest, ToolAuthorizationResult } from './types.js';

export interface AuthorizationPolicy {
  name: string;
  tools: string[];
  operations?: string[];
  allowedPaths?: string[];
  deniedPaths?: string[];
  requireConfirmation?: boolean;
  maxCalls?: number;
}

export class ToolAuthorizer {
  private policies: Map<string, AuthorizationPolicy> = new Map();
  private callCounts: Map<string, number> = new Map();
  private pendingConfirmations: Set<string> = new Set();

  /**
   * Add an authorization policy
   */
  addPolicy(policy: AuthorizationPolicy): void {
    this.policies.set(policy.name, policy);
  }

  /**
   * Remove a policy
   */
  removePolicy(name: string): void {
    this.policies.delete(name);
  }

  /**
   * Authorize a tool call
   */
  authorize(request: ToolAuthorizationRequest): ToolAuthorizationResult {
    // Check against all policies
    for (const policy of this.policies.values()) {
      const result = this.checkPolicy(request, policy);
      if (!result.allowed) {
        return result;
      }
    }

    // Check call limits
    const limitResult = this.checkCallLimits(request);
    if (!limitResult.allowed) {
      return limitResult;
    }

    // Record call
    const key = `${request.toolName}:${request.operation}`;
    this.callCounts.set(key, (this.callCounts.get(key) ?? 0) + 1);

    return { allowed: true };
  }

  /**
   * Check request against a policy
   */
  private checkPolicy(
    request: ToolAuthorizationRequest,
    policy: AuthorizationPolicy
  ): ToolAuthorizationResult {
    // Check if tool is in policy
    if (!policy.tools.includes(request.toolName) && !policy.tools.includes('*')) {
      return { allowed: true }; // Policy doesn't apply to this tool
    }

    // Check operation if specified
    if (policy.operations && policy.operations.length > 0) {
      if (!policy.operations.includes(request.operation) && !policy.operations.includes('*')) {
        return {
          allowed: false,
          reason: `Operation '${request.operation}' not allowed for tool '${request.toolName}'`,
        };
      }
    }

    // Check path restrictions
    if (request.target) {
      // Check denied paths
      if (policy.deniedPaths?.some(p => request.target!.includes(p))) {
        return {
          allowed: false,
          reason: `Path '${request.target}' is denied`,
        };
      }

      // Check allowed paths
      if (policy.allowedPaths && policy.allowedPaths.length > 0) {
        if (!policy.allowedPaths.some(p => request.target!.includes(p))) {
          return {
            allowed: false,
            reason: `Path '${request.target}' not in allowed paths`,
            restrictions: policy.allowedPaths,
          };
        }
      }
    }

    // Check confirmation requirement
    if (policy.requireConfirmation) {
      const confirmKey = `${request.toolName}:${request.operation}:${request.target ?? ''}`;
      if (!this.pendingConfirmations.has(confirmKey)) {
        return {
          allowed: false,
          reason: 'Operation requires user confirmation',
          restrictions: ['confirmation_required'],
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check call limits
   */
  private checkCallLimits(request: ToolAuthorizationRequest): ToolAuthorizationResult {
    for (const policy of this.policies.values()) {
      if (!policy.maxCalls) continue;
      if (!policy.tools.includes(request.toolName)) continue;

      const key = `${request.toolName}:${request.operation}`;
      const count = this.callCounts.get(key) ?? 0;

      if (count >= policy.maxCalls) {
        return {
          allowed: false,
          reason: `Maximum call limit (${policy.maxCalls}) reached for ${request.toolName}`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Confirm a pending operation
   */
  confirm(toolName: string, operation: string, target?: string): void {
    const key = `${toolName}:${operation}:${target ?? ''}`;
    this.pendingConfirmations.add(key);
  }

  /**
   * Clear confirmation
   */
  clearConfirmation(toolName: string, operation: string, target?: string): void {
    const key = `${toolName}:${operation}:${target ?? ''}`;
    this.pendingConfirmations.delete(key);
  }

  /**
   * Reset call counts
   */
  resetCallCounts(): void {
    this.callCounts.clear();
  }

  /**
   * Get call statistics
   */
  getCallStats(): Record<string, number> {
    return Object.fromEntries(this.callCounts);
  }
}

/**
 * Create default security policy
 */
export function createDefaultPolicy(): AuthorizationPolicy {
  return {
    name: 'default',
    tools: ['*'],
    operations: ['read', 'search', 'list'],
    deniedPaths: [
      '/etc/shadow',
      '/etc/passwd',
      '.ssh/',
      '.gnupg/',
      'credentials',
      'secrets',
    ],
    requireConfirmation: false,
  };
}

/**
 * Create strict policy for untrusted workspaces
 */
export function createStrictPolicy(): AuthorizationPolicy {
  return {
    name: 'strict',
    tools: ['read-file', 'search', 'list-files'],
    operations: ['read'],
    deniedPaths: [
      '.env',
      '.git/config',
      'node_modules',
    ],
    requireConfirmation: true,
    maxCalls: 100,
  };
}
