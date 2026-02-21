import { scanForThreats } from '@/lib/security';
import type { SupremeAgentRole } from './supreme-model';

export interface AuthorizationEntry {
  timestamp: number;
  sessionId: string;
  agentId: string;
  role: SupremeAgentRole;
  tool: string;
  args: Record<string, unknown>;
  approved: boolean;
  reason: string;
}

export interface AuthorizationResult {
  approved: boolean;
  reason: string;
  threats?: string[];
}

const SAFE_TOOLS = new Set([
  'read_file',
  'list_directory',
  'grep_search',
  'glob_search',
  'read_lints',
  'semantic_search',
]);

const READ_ONLY_TOOLS = new Set([
  'read_file',
  'list_directory',
  'grep_search',
  'glob_search',
  'read_lints',
  'semantic_search',
  'web_search',
  'web_fetch',
]);

export function createPermissionManager() {
  const auditLog: AuthorizationEntry[] = [];

  function authorizeToolCall(
    sessionId: string,
    agentId: string,
    role: SupremeAgentRole,
    tool: string,
    args: Record<string, unknown>,
  ): AuthorizationResult {
    const threats = scanForThreats(JSON.stringify({ tool, args }));
    if (threats.length > 0) {
      const reason = `Blocked by threat scanner (${threats.map((t) => t.type).join(', ')})`;
      auditLog.push({
        timestamp: Date.now(),
        sessionId,
        agentId,
        role,
        tool,
        args,
        approved: false,
        reason,
      });
      return { approved: false, reason, threats: threats.map((t) => t.description) };
    }

    if (role === 'OVERSEER' && !SAFE_TOOLS.has(tool)) {
      const reason = `Overseer may authorize only safe tools. Rejected: ${tool}`;
      auditLog.push({
        timestamp: Date.now(),
        sessionId,
        agentId,
        role,
        tool,
        args,
        approved: false,
        reason,
      });
      return { approved: false, reason };
    }

    if ((role === 'PRIMARY_WORKER' || role === 'SECONDARY_WORKER') && !READ_ONLY_TOOLS.has(tool)) {
      const reason = `Workers are restricted to read-only tools. Rejected: ${tool}`;
      auditLog.push({
        timestamp: Date.now(),
        sessionId,
        agentId,
        role,
        tool,
        args,
        approved: false,
        reason,
      });
      return { approved: false, reason };
    }

    const reason = 'Authorized';
    auditLog.push({
      timestamp: Date.now(),
      sessionId,
      agentId,
      role,
      tool,
      args,
      approved: true,
      reason,
    });
    return { approved: true, reason };
  }

  function validateExecution(
    sessionId: string,
    agentId: string,
    tool: string,
    args: Record<string, unknown>,
  ): boolean {
    return auditLog.some(
      (entry) =>
        entry.sessionId === sessionId &&
        entry.agentId === agentId &&
        entry.tool === tool &&
        JSON.stringify(entry.args) === JSON.stringify(args) &&
        entry.approved,
    );
  }

  function issueShortLivedToken(agentId: string, ttlMs = 5 * 60 * 1000) {
    const expiresAt = Date.now() + ttlMs;
    const token = Buffer.from(`${agentId}:${expiresAt}:${Math.random().toString(36).slice(2)}`).toString(
      'base64',
    );
    return { token, expiresAt };
  }

  function verifyShortLivedToken(token: string) {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const [, expiresAtRaw] = decoded.split(':');
      const expiresAt = Number(expiresAtRaw);
      if (!expiresAt || Number.isNaN(expiresAt)) return false;
      return Date.now() < expiresAt;
    } catch {
      return false;
    }
  }

  function getAuditLog() {
    return [...auditLog];
  }

  return {
    authorizeToolCall,
    validateExecution,
    issueShortLivedToken,
    verifyShortLivedToken,
    getAuditLog,
  };
}
