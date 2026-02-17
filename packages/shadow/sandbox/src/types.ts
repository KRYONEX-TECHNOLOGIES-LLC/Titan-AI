// Shadow Sandbox Types
// packages/shadow/sandbox/src/types.ts

export interface SandboxConfig {
  type: SandboxType;
  id: string;
  name: string;
  resources: ResourceLimits;
  network: NetworkConfig;
  mounts: MountConfig[];
  env: Record<string, string>;
  timeout: number;
  capabilities: string[];
}

export type SandboxType = 'docker' | 'kata' | 'wasm' | 'process';

export interface ResourceLimits {
  cpuCores: number;
  memoryMb: number;
  diskMb: number;
  pids: number;
  networkBandwidthMbps?: number;
}

export interface NetworkConfig {
  enabled: boolean;
  allowedHosts?: string[];
  blockedPorts?: number[];
  dnsServers?: string[];
}

export interface MountConfig {
  hostPath: string;
  containerPath: string;
  readOnly: boolean;
}

export interface SandboxState {
  id: string;
  type: SandboxType;
  status: SandboxStatus;
  createdAt: number;
  startedAt?: number;
  stoppedAt?: number;
  resourceUsage?: ResourceUsage;
  lastError?: string;
}

export type SandboxStatus = 'created' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export interface ResourceUsage {
  cpuPercent: number;
  memoryMb: number;
  diskMb: number;
  networkRxBytes: number;
  networkTxBytes: number;
}

export interface ExecutionRequest {
  command: string[];
  workdir?: string;
  env?: Record<string, string>;
  stdin?: string;
  timeout?: number;
}

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  killed: boolean;
  resourceUsage?: ResourceUsage;
}

export interface SandboxProvider {
  readonly type: SandboxType;
  
  create(config: SandboxConfig): Promise<string>;
  start(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  destroy(id: string): Promise<void>;
  
  execute(id: string, request: ExecutionRequest): Promise<ExecutionResult>;
  getState(id: string): Promise<SandboxState>;
  
  isAvailable(): Promise<boolean>;
}

export interface HardwareIsolationConfig {
  seccompProfile: string;
  apparmorProfile?: string;
  readOnlyRootfs: boolean;
  noNewPrivileges: boolean;
  dropCapabilities: string[];
}
