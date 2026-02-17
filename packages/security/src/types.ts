/**
 * Titan AI Security - Type Definitions
 */

// Obfuscation configuration
export interface ObfuscationConfig {
  enabled: boolean;
  patterns: ObfuscationPattern[];
  preserveStructure: boolean;
}

// Obfuscation pattern
export interface ObfuscationPattern {
  type: 'path' | 'username' | 'hostname' | 'email' | 'custom';
  pattern?: RegExp;
  replacement: string;
}

// Threat detection result
export interface ThreatDetection {
  id: string;
  type: ThreatType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location?: {
    file?: string;
    line?: number;
    content?: string;
  };
  recommendation: string;
}

// Threat types
export type ThreatType =
  | 'prompt_injection'
  | 'jailbreak_attempt'
  | 'secret_exposure'
  | 'path_traversal'
  | 'command_injection'
  | 'xss'
  | 'sql_injection'
  | 'unsafe_eval';

// Trusted workspace configuration
export interface TrustedWorkspaceConfig {
  trustedPaths: string[];
  allowedTools: string[];
  deniedTools: string[];
  requireExplicitTrust: boolean;
  promptBeforeUntrusted: boolean;
}

// Workspace trust status
export interface WorkspaceTrust {
  path: string;
  trusted: boolean;
  trustLevel: 'full' | 'restricted' | 'untrusted';
  restrictions: string[];
  grantedAt?: number;
  grantedBy?: string;
}

// Tool authorization request
export interface ToolAuthorizationRequest {
  toolName: string;
  operation: string;
  target?: string;
  arguments?: Record<string, unknown>;
}

// Tool authorization result
export interface ToolAuthorizationResult {
  allowed: boolean;
  reason?: string;
  restrictions?: string[];
}

// Secret finding
export interface SecretFinding {
  type: SecretType;
  value: string;
  file: string;
  line: number;
  column: number;
  entropy?: number;
}

// Secret types
export type SecretType =
  | 'api_key'
  | 'password'
  | 'token'
  | 'private_key'
  | 'certificate'
  | 'aws_credentials'
  | 'gcp_credentials'
  | 'azure_credentials'
  | 'database_url'
  | 'jwt'
  | 'generic_secret';

// Security audit result
export interface SecurityAuditResult {
  timestamp: number;
  threats: ThreatDetection[];
  secrets: SecretFinding[];
  trustStatus: WorkspaceTrust;
  recommendations: string[];
}
