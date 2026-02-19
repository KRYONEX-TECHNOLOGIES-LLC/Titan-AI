/**
 * Self-Healing Agent API - Code-Run-Fix Cycle
 * Implements the self-healing verification loop from the Titan AI v2 vision.
 * 
 * Flow:
 * 1. Agent executes code/commands in terminal
 * 2. Captures terminal output (stdout/stderr)
 * 3. If error detected, feeds back to agent as context
 * 4. Agent iterates on fix automatically
 * 5. Continues until success or max retries (circuit breaker)
 */

import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';

interface HealRequest {
  command: string;
  cwd?: string;
  maxRetries?: number;
  model?: string;
  context?: string;
}

interface HealStep {
  iteration: number;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  errorType?: string;
  fix?: string;
  timestamp: number;
}

const ERROR_PATTERNS: Array<{ pattern: RegExp; type: string; suggestion: string }> = [
  { pattern: /ModuleNotFoundError|Cannot find module|Module not found/i, type: 'missing_dependency', suggestion: 'Install missing module with npm/pip' },
  { pattern: /SyntaxError|Unexpected token/i, type: 'syntax_error', suggestion: 'Fix syntax error in the indicated file and line' },
  { pattern: /TypeError|is not a function|is not defined/i, type: 'type_error', suggestion: 'Check variable types and function signatures' },
  { pattern: /ENOENT|No such file or directory/i, type: 'file_not_found', suggestion: 'Create the missing file or directory' },
  { pattern: /EADDRINUSE|address already in use/i, type: 'port_in_use', suggestion: 'Kill the process using the port or use a different port' },
  { pattern: /permission denied|EACCES/i, type: 'permission_error', suggestion: 'Check file permissions' },
  { pattern: /ERR_REQUIRE_ESM|require\(\) of ES Module/i, type: 'esm_error', suggestion: 'Convert require() to import or add "type": "module" to package.json' },
  { pattern: /build failed|compilation error|compile error/i, type: 'build_error', suggestion: 'Review build errors and fix source code' },
  { pattern: /test.*fail|assertion.*error|expect.*received/i, type: 'test_failure', suggestion: 'Fix the failing test or update expected values' },
];

function detectErrorType(output: string): { type: string; suggestion: string } | null {
  for (const { pattern, type, suggestion } of ERROR_PATTERNS) {
    if (pattern.test(output)) {
      return { type, suggestion };
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body: HealRequest = await request.json();
    const { command, cwd, maxRetries = 3, context } = body;

    if (!command?.trim()) {
      return NextResponse.json({ error: 'Command is required' }, { status: 400 });
    }

    const workingDir = cwd ? path.resolve(process.cwd(), cwd) : process.cwd();
    const steps: HealStep[] = [];
    let currentCommand = command;
    let healed = false;

    for (let i = 0; i < maxRetries + 1; i++) {
      const step: HealStep = {
        iteration: i,
        command: currentCommand,
        exitCode: 0,
        stdout: '',
        stderr: '',
        timestamp: Date.now(),
      };

      try {
        const result = execSync(currentCommand, {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 60000,
          maxBuffer: 5 * 1024 * 1024,
          env: { ...process.env, FORCE_COLOR: '0' },
        });

        step.stdout = result.slice(0, 5000);
        step.exitCode = 0;
        steps.push(step);
        healed = true;
        break;
      } catch (e: any) {
        step.exitCode = e.status || 1;
        step.stdout = (e.stdout?.toString() || '').slice(0, 5000);
        step.stderr = (e.stderr?.toString() || '').slice(0, 5000);

        const errorInfo = detectErrorType(step.stdout + step.stderr);
        if (errorInfo) {
          step.errorType = errorInfo.type;
          step.fix = errorInfo.suggestion;
        }

        steps.push(step);

        // If we have retries left and it's a fixable error, try auto-fix
        if (i < maxRetries && errorInfo) {
          if (errorInfo.type === 'missing_dependency') {
            const moduleMatch = (step.stdout + step.stderr).match(/(?:Cannot find module|Module not found)[:\s]*['"]([^'"]+)['"]/);
            if (moduleMatch) {
              currentCommand = `npm install ${moduleMatch[1]} && ${command}`;
              continue;
            }
          }
          // For other error types, we'd need the AI agent to analyze and propose a fix
          // Return the error context so the chat system can handle it
          break;
        }
      }
    }

    return NextResponse.json({
      success: healed,
      steps,
      totalIterations: steps.length,
      circuitBreaker: !healed && steps.length > maxRetries,
      lastError: !healed ? steps[steps.length - 1]?.errorType : undefined,
      context: !healed
        ? `Command failed after ${steps.length} attempts. Last error: ${steps[steps.length - 1]?.stderr?.slice(0, 500)}`
        : undefined,
    });
  } catch (error) {
    console.error('Self-healing error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
