/**
 * Titan AI Security - Trusted Workspace
 * Manage workspace trust and permissions
 */

import type { TrustedWorkspaceConfig, WorkspaceTrust, ToolAuthorizationResult } from './types.js';

export class TrustedWorkspaceManager {
  private config: TrustedWorkspaceConfig;
  private trustCache: Map<string, WorkspaceTrust> = new Map();

  constructor(config: Partial<TrustedWorkspaceConfig> = {}) {
    this.config = {
      trustedPaths: [],
      allowedTools: [],
      deniedTools: [],
      requireExplicitTrust: true,
      promptBeforeUntrusted: true,
      ...config,
    };
  }

  /**
   * Check if a workspace is trusted
   */
  isTrusted(workspacePath: string): boolean {
    const cached = this.trustCache.get(workspacePath);
    if (cached) return cached.trusted;

    // Check against trusted paths
    for (const trustedPath of this.config.trustedPaths) {
      if (workspacePath.startsWith(trustedPath)) {
        return true;
      }
    }

    return !this.config.requireExplicitTrust;
  }

  /**
   * Get trust status for a workspace
   */
  getTrustStatus(workspacePath: string): WorkspaceTrust {
    const cached = this.trustCache.get(workspacePath);
    if (cached) return cached;

    const trusted = this.isTrusted(workspacePath);
    const restrictions = this.getRestrictions(workspacePath);

    const status: WorkspaceTrust = {
      path: workspacePath,
      trusted,
      trustLevel: trusted ? 'full' : (restrictions.length > 0 ? 'restricted' : 'untrusted'),
      restrictions,
    };

    return status;
  }

  /**
   * Grant trust to a workspace
   */
  grantTrust(workspacePath: string, grantedBy?: string): void {
    const trust: WorkspaceTrust = {
      path: workspacePath,
      trusted: true,
      trustLevel: 'full',
      restrictions: [],
      grantedAt: Date.now(),
      grantedBy,
    };

    this.trustCache.set(workspacePath, trust);

    if (!this.config.trustedPaths.includes(workspacePath)) {
      this.config.trustedPaths.push(workspacePath);
    }
  }

  /**
   * Revoke trust from a workspace
   */
  revokeTrust(workspacePath: string): void {
    this.trustCache.delete(workspacePath);
    this.config.trustedPaths = this.config.trustedPaths.filter(p => p !== workspacePath);
  }

  /**
   * Check if a tool is allowed
   */
  isToolAllowed(toolName: string, workspacePath: string): ToolAuthorizationResult {
    // Check denied list first
    if (this.config.deniedTools.includes(toolName)) {
      return {
        allowed: false,
        reason: 'Tool is explicitly denied',
      };
    }

    // Check workspace trust
    const trust = this.getTrustStatus(workspacePath);

    if (!trust.trusted) {
      // Untrusted workspace - restrict dangerous tools
      const dangerousTools = ['terminal', 'shell', 'exec', 'run', 'delete'];
      if (dangerousTools.some(d => toolName.toLowerCase().includes(d))) {
        return {
          allowed: false,
          reason: 'Dangerous tools not allowed in untrusted workspace',
          restrictions: ['Requires workspace trust'],
        };
      }
    }

    // Check allowed list if specified
    if (this.config.allowedTools.length > 0 && !this.config.allowedTools.includes(toolName)) {
      return {
        allowed: false,
        reason: 'Tool not in allowed list',
      };
    }

    return { allowed: true };
  }

  /**
   * Get restrictions for a workspace
   */
  private getRestrictions(workspacePath: string): string[] {
    const restrictions: string[] = [];

    if (!this.isTrusted(workspacePath)) {
      restrictions.push('Terminal execution disabled');
      restrictions.push('File deletion requires confirmation');
      restrictions.push('Network access restricted');
    }

    return restrictions;
  }

  /**
   * Add tool to allowed list
   */
  allowTool(toolName: string): void {
    if (!this.config.allowedTools.includes(toolName)) {
      this.config.allowedTools.push(toolName);
    }
    this.config.deniedTools = this.config.deniedTools.filter(t => t !== toolName);
  }

  /**
   * Add tool to denied list
   */
  denyTool(toolName: string): void {
    if (!this.config.deniedTools.includes(toolName)) {
      this.config.deniedTools.push(toolName);
    }
    this.config.allowedTools = this.config.allowedTools.filter(t => t !== toolName);
  }

  /**
   * Get all trusted paths
   */
  getTrustedPaths(): string[] {
    return [...this.config.trustedPaths];
  }

  /**
   * Clear all cached trust
   */
  clearCache(): void {
    this.trustCache.clear();
  }
}
