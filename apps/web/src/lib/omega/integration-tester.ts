import type { IntegrationTestResult, ProjectAutopsy, ToolCallFn } from './omega-model';

function countPassed(output: string): number | undefined {
  const m = output.match(/(\d+)\s+passed/i);
  return m ? Number(m[1]) : undefined;
}

function countFailed(output: string): number | undefined {
  const m = output.match(/(\d+)\s+failed/i);
  return m ? Number(m[1]) : undefined;
}

export async function runIntegrationTest(
  autopsy: ProjectAutopsy,
  executeToolCall: ToolCallFn,
): Promise<IntegrationTestResult> {
  const command =
    autopsy.testCommand ||
    (autopsy.projectType === 'python' ? 'pytest' : 'npm test');

  const result = await executeToolCall('run_command', { command });
  const output = (result.output || result.error || '').slice(0, 20_000);

  return {
    success: result.success,
    command,
    output,
    testsPassed: countPassed(output),
    testsFailed: countFailed(output),
  };
}
