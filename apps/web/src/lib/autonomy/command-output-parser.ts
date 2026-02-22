export interface ParsedMessage {
  filePath: string | null;
  line: number | null;
  column: number | null;
  errorCode: string | null;
  errorType: string | null;
  message: string;
  rawLine: string;
}

export interface ParsedCommandOutput {
  exitCode: number;
  errors: ParsedMessage[];
  warnings: ParsedMessage[];
  summary: string;
}

function toNumber(v?: string): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pushUnique(target: ParsedMessage[], item: ParsedMessage) {
  const key = `${item.filePath}:${item.line}:${item.column}:${item.message}`;
  const exists = target.some((x) => `${x.filePath}:${x.line}:${x.column}:${x.message}` === key);
  if (!exists) target.push(item);
}

export class CommandOutputParser {
  parse(stdout: string, stderr: string, exitCode: number): ParsedCommandOutput {
    const merged = `${stdout || ''}\n${stderr || ''}`.trim();
    const lines = merged.split(/\r?\n/);
    const errors: ParsedMessage[] = [];
    const warnings: ParsedMessage[] = [];

    const tsRegex = /^(.*)\((\d+),(\d+)\):\s*(error|warning)\s*(TS\d+)?\s*:?\s*(.+)$/i;
    const pyFileRegex = /^File\s+"([^"]+)",\s+line\s+(\d+)/i;
    const pyErrRegex = /^([A-Za-z]+Error|Exception):\s+(.+)$/;
    const rustRegex = /^error\[E(\d+)\]:\s+(.+)\s*$/i;
    const rustLocRegex = /^\s*-->\s+(.+):(\d+):(\d+)/;
    const genericRegex = /^(.*):(\d+):(\d+):\s*(error|warning)\s*:?\s*(.+)$/i;
    const nodeStackRegex = /^\s*at .+\((.+):(\d+):(\d+)\)$/;
    const lineColRegex = /line\s+(\d+)|\((\d+),\s*(\d+)\)/i;

    let pendingPythonLoc: { file: string; line: number } | null = null;
    let pendingRust: { code: string; msg: string } | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line.trim()) continue;

      const ts = line.match(tsRegex);
      if (ts) {
        const sev = ts[4].toLowerCase();
        const item: ParsedMessage = {
          filePath: ts[1] || null,
          line: toNumber(ts[2]),
          column: toNumber(ts[3]),
          errorCode: ts[5] || null,
          errorType: sev === 'error' ? 'TypeScriptError' : 'TypeScriptWarning',
          message: ts[6] || line,
          rawLine: line,
        };
        if (sev === 'error') pushUnique(errors, item); else pushUnique(warnings, item);
        continue;
      }

      const pyFile = line.match(pyFileRegex);
      if (pyFile) {
        pendingPythonLoc = { file: pyFile[1], line: Number(pyFile[2]) };
        continue;
      }
      const pyErr = line.match(pyErrRegex);
      if (pyErr) {
        pushUnique(errors, {
          filePath: pendingPythonLoc?.file || null,
          line: pendingPythonLoc?.line || null,
          column: null,
          errorCode: null,
          errorType: pyErr[1],
          message: pyErr[2],
          rawLine: line,
        });
        pendingPythonLoc = null;
        continue;
      }

      const rust = line.match(rustRegex);
      if (rust) {
        pendingRust = { code: `E${rust[1]}`, msg: rust[2] };
        continue;
      }
      const rustLoc = line.match(rustLocRegex);
      if (rustLoc && pendingRust) {
        pushUnique(errors, {
          filePath: rustLoc[1] || null,
          line: toNumber(rustLoc[2]),
          column: toNumber(rustLoc[3]),
          errorCode: pendingRust.code,
          errorType: 'RustError',
          message: pendingRust.msg,
          rawLine: line,
        });
        pendingRust = null;
        continue;
      }

      const generic = line.match(genericRegex);
      if (generic) {
        const sev = generic[4].toLowerCase();
        const item: ParsedMessage = {
          filePath: generic[1] || null,
          line: toNumber(generic[2]),
          column: toNumber(generic[3]),
          errorCode: null,
          errorType: sev === 'error' ? 'GenericError' : 'GenericWarning',
          message: generic[5] || line,
          rawLine: line,
        };
        if (sev === 'error') pushUnique(errors, item); else pushUnique(warnings, item);
        continue;
      }

      const stack = line.match(nodeStackRegex);
      if (stack) {
        pushUnique(errors, {
          filePath: stack[1] || null,
          line: toNumber(stack[2]),
          column: toNumber(stack[3]),
          errorCode: null,
          errorType: 'NodeStackTrace',
          message: 'Stack trace location',
          rawLine: line,
        });
        continue;
      }

      if (/module not found|cannot find module/i.test(line)) {
        pushUnique(errors, {
          filePath: null,
          line: null,
          column: null,
          errorCode: null,
          errorType: 'ModuleNotFoundError',
          message: line,
          rawLine: line,
        });
        continue;
      }
      if (/syntaxerror|typeerror|referenceerror|modulenotfounderror/i.test(line)) {
        const lc = line.match(lineColRegex);
        pushUnique(errors, {
          filePath: null,
          line: toNumber(lc?.[1] || lc?.[2]),
          column: toNumber(lc?.[3]),
          errorCode: null,
          errorType: line.split(':')[0] || 'RuntimeError',
          message: line,
          rawLine: line,
        });
        continue;
      }
      if (/warning/i.test(line)) {
        pushUnique(warnings, {
          filePath: null,
          line: null,
          column: null,
          errorCode: null,
          errorType: 'Warning',
          message: line,
          rawLine: line,
        });
      }
    }

    const summary = exitCode === 0
      ? 'Command succeeded.'
      : `Command failed with ${errors.length} parsed error(s) and ${warnings.length} warning(s).`;

    return { exitCode, errors, warnings, summary };
  }

  getPrimaryError(parsed: ParsedCommandOutput): ParsedMessage | null {
    if (!parsed.errors.length) return null;
    const withFileAndLine = parsed.errors.find((e) => Boolean(e.filePath) && e.line !== null);
    return withFileAndLine || parsed.errors[0];
  }

  getAffectedFiles(parsed: ParsedCommandOutput): string[] {
    const set = new Set<string>();
    for (const e of parsed.errors) {
      if (e.filePath) set.add(e.filePath);
    }
    return Array.from(set);
  }
}
