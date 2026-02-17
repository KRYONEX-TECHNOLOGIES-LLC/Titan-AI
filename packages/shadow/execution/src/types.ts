// Shadow Execution Types
// packages/shadow/execution/src/types.ts

export interface ExecutionConfig {
  workdir: string;
  timeout: number;
  env?: Record<string, string>;
  sandboxType?: 'docker' | 'wasm' | 'process';
  isolationLevel?: 'none' | 'process' | 'container' | 'vm';
}

export interface ExecutionTask {
  id: string;
  type: ExecutionType;
  command: string[];
  config: ExecutionConfig;
  status: ExecutionStatus;
  result?: ExecutionResult;
  startedAt?: number;
  completedAt?: number;
}

export type ExecutionType = 'test' | 'lint' | 'build' | 'script' | 'command';
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  artifacts?: ExecutionArtifact[];
  coverage?: CoverageReport;
  diagnostics?: Diagnostic[];
}

export interface ExecutionArtifact {
  name: string;
  path: string;
  type: string;
  size: number;
}

export interface CoverageReport {
  lines: CoverageMetric;
  statements: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
  files: FileCoverage[];
}

export interface CoverageMetric {
  total: number;
  covered: number;
  percentage: number;
}

export interface FileCoverage {
  path: string;
  lines: CoverageMetric;
  statements: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
  uncoveredLines: number[];
}

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  rule?: string;
  source?: string;
}

export interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration: number;
  error?: string;
  stackTrace?: string;
}

export interface TestSuiteResult {
  name: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}
