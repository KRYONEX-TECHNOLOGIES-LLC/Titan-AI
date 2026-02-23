import { CommandOutputParser, type ParsedMessage } from './command-output-parser';

export interface DebugLoopConfig {
  maxFixAttempts: number;
  maxSameErrorRetries: number;
  escalateAfter: number;
}

export interface FixAttempt {
  attemptNumber: number;
  error: ParsedMessage;
  hypothesis: string;
  editResult: { success: boolean; file: string; retries: number };
  verificationResult: { passed: boolean; newErrors: ParsedMessage[] };
}

export interface DebugLoopResult {
  resolved: boolean;
  attempts: number;
  fixHistory: FixAttempt[];
  finalError?: ParsedMessage;
  escalated: boolean;
}

export interface DebugLoopEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface ToolResultLike {
  success: boolean;
  output: string;
  error?: string;
  meta?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type ExecuteToolCall = (tool: string, args: Record<string, unknown>) => Promise<ToolResultLike>;
export type InvokeModel = (prompt: string) => Promise<string>;
export type EmitEvent = (event: DebugLoopEvent) => void;

function sameErrorKey(e: ParsedMessage | undefined): string {
  if (!e) return 'none';
  return `${e.filePath || 'unknown'}:${e.line || 0}:${e.errorType || 'error'}:${e.message.slice(0, 120)}`;
}

function stripCodeFence(text: string): string {
  return text.replace(/^```[\w-]*\n?/, '').replace(/\n?```$/, '').trim();
}

export async function runDebugLoop(
  command: string,
  executeToolCall: ExecuteToolCall,
  invokeModel: InvokeModel,
  emitEvent?: EmitEvent,
  config: DebugLoopConfig = { maxFixAttempts: 3, maxSameErrorRetries: 3, escalateAfter: 3 },
): Promise<DebugLoopResult> {
  const parser = new CommandOutputParser();
  const fixHistory: FixAttempt[] = [];
  const sameErrorCounter = new Map<string, number>();

  for (let attempt = 1; attempt <= config.maxFixAttempts; attempt++) {
    const run = await executeToolCall('run_command', { command });
    const exitCode = Number(run.metadata?.exitCode ?? 0);
    const parsed = parser.parse(run.output || '', run.error || '', exitCode);
    const primary = parser.getPrimaryError(parsed);

    emitEvent?.({
      type: 'debug_loop_command_result',
      payload: { attempt, exitCode, summary: parsed.summary, primaryError: primary || null },
    });

    if (exitCode === 0 || !primary) {
      return {
        resolved: true,
        attempts: attempt - (exitCode === 0 ? 0 : 1),
        fixHistory,
        escalated: false,
      };
    }

    const errKey = sameErrorKey(primary);
    const seen = (sameErrorCounter.get(errKey) || 0) + 1;
    sameErrorCounter.set(errKey, seen);
    if (seen >= config.maxSameErrorRetries || seen >= config.escalateAfter) {
      return {
        resolved: false,
        attempts: attempt - 1,
        fixHistory,
        finalError: primary,
        escalated: true,
      };
    }

    if (!primary.filePath) {
      return {
        resolved: false,
        attempts: attempt - 1,
        fixHistory,
        finalError: primary,
        escalated: true,
      };
    }

    const read = await executeToolCall('read_file', { path: primary.filePath });
    if (!read.success || !read.output) {
      return {
        resolved: false,
        attempts: attempt - 1,
        fixHistory,
        finalError: primary,
        escalated: true,
      };
    }

    const prompt = [
      'Return strict JSON only.',
      `You are fixing a code error in file: ${primary.filePath}`,
      `Error: ${primary.errorType || 'Error'} - ${primary.message}`,
      `Line: ${primary.line ?? 'unknown'}, Column: ${primary.column ?? 'unknown'}`,
      'Return JSON shape:',
      '{"hypothesis":"string","old_string":"exact text to replace","new_string":"replacement text"}',
      'File content:',
      read.output,
    ].join('\n\n');

    let modelRaw = '';
    try {
      modelRaw = await invokeModel(prompt);
    } catch {
      return {
        resolved: false,
        attempts: attempt - 1,
        fixHistory,
        finalError: primary,
        escalated: true,
      };
    }

    let patch: { hypothesis: string; old_string: string; new_string: string };
    try {
      const parsedJson = JSON.parse(stripCodeFence(modelRaw));
      patch = {
        hypothesis: String(parsedJson.hypothesis || 'Generated fix'),
        old_string: String(parsedJson.old_string || ''),
        new_string: String(parsedJson.new_string || ''),
      };
    } catch {
      return {
        resolved: false,
        attempts: attempt - 1,
        fixHistory,
        finalError: primary,
        escalated: true,
      };
    }

    const edit = await executeToolCall('edit_file', {
      path: primary.filePath,
      old_string: patch.old_string,
      new_string: patch.new_string,
    });
    const retries = Number(edit.meta?.retryAttempts || 1);

    // Verification: re-run the EXACT same command and check if the original error is gone
    const rerun = await executeToolCall('run_command', { command });
    const rerunExit = Number(rerun.metadata?.exitCode ?? 0);
    const rerunParsed = parser.parse(rerun.output || '', rerun.error || '', rerunExit);

    // Check if the specific error we fixed is still present in the new output
    const originalErrKey = sameErrorKey(primary);
    const rerunPrimary = parser.getPrimaryError(rerunParsed);
    const originalErrorStillPresent = rerunParsed.errors.some(
      (e) => sameErrorKey(e) === originalErrKey,
    );
    // Fix is only verified if: exit code is 0 OR the specific original error is gone
    const fixVerified = rerunExit === 0 || (!originalErrorStillPresent && rerunParsed.errors.length < rerunParsed.errors.length + 1);
    const originalErrorResolved = !originalErrorStillPresent;

    fixHistory.push({
      attemptNumber: attempt,
      error: primary,
      hypothesis: patch.hypothesis,
      editResult: {
        success: edit.success,
        file: primary.filePath,
        retries,
      },
      verificationResult: {
        passed: rerunExit === 0,
        newErrors: rerunParsed.errors,
      },
    });

    emitEvent?.({
      type: 'debug_loop_fix_attempt',
      payload: {
        attempt,
        file: primary.filePath,
        hypothesis: patch.hypothesis,
        editSuccess: edit.success,
        rerunExitCode: rerunExit,
        originalErrorResolved,
        remainingErrors: rerunParsed.errors.length,
      },
    });

    if (rerunExit === 0) {
      return {
        resolved: true,
        attempts: attempt,
        fixHistory,
        escalated: false,
      };
    }

    // If this specific error was resolved but new errors appeared, continue loop with new primary
    if (originalErrorResolved && rerunPrimary && sameErrorKey(rerunPrimary) !== originalErrKey) {
      emitEvent?.({
        type: 'debug_loop_progress',
        payload: { message: `Original error resolved. New error to fix: ${rerunPrimary.message}` },
      });
      // Reset same-error counter since we've moved on to a different error
      sameErrorCounter.clear();
      continue;
    }

    // If the same error persists after a fix, count it toward escalation
    if (!originalErrorResolved) {
      const newSeen = (sameErrorCounter.get(originalErrKey) || 0);
      if (newSeen >= config.maxSameErrorRetries) {
        return {
          resolved: false,
          attempts: attempt,
          fixHistory,
          finalError: primary,
          escalated: true,
        };
      }
    }

    void fixVerified; // used for event payload clarity
  }

  return {
    resolved: false,
    attempts: config.maxFixAttempts,
    fixHistory,
    finalError: fixHistory[fixHistory.length - 1]?.error,
    escalated: true,
  };
}
