interface EditFileApiResult {
  newContent: string;
  changed: boolean;
  bytesWritten?: number;
  beforeHash?: string;
  afterHash?: string;
  pathResolved?: string;
}

interface EditApi {
  tools: {
    editFile: (filePath: string, oldString: string, newString: string) => Promise<EditFileApiResult>;
    readFile: (filePath: string, opts?: { lineOffset?: number; lineLimit?: number }) => Promise<{ content: string; lineCount: number }>;
  };
}

export interface EditRetryAttempt {
  attempt: number;
  startedAt: number;
  success: boolean;
  corrected: boolean;
  error?: string;
}

export interface EditRetryResult {
  success: boolean;
  attempts: number;
  correctedFromOriginal: boolean;
  finalOldStr: string;
  result?: EditFileApiResult;
  error?: string;
  attemptLog: EditRetryAttempt[];
}

function isOldStringNotFoundError(errorMessage: string): boolean {
  const refersToOldString = /old[_\s-]?string/i.test(errorMessage);
  const indicatesNotFound = /not found|no match|could not find|does not exist/i.test(errorMessage);
  return refersToOldString && indicatesNotFound;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - (levenshtein(a, b) / maxLen);
}

function bestCandidateByWindow(content: string, oldString: string, minSimilarity = 0.8): string | null {
  if (!content || !oldString) return null;
  if (content.includes(oldString)) return oldString;
  const targetLines = oldString.split('\n').length;
  const lines = content.split('\n');
  if (lines.length === 0) return null;

  let best: { score: number; text: string } | null = null;
  const minWindow = Math.max(1, targetLines - 2);
  const maxWindow = targetLines + 2;

  for (let size = minWindow; size <= maxWindow; size++) {
    for (let i = 0; i + size <= lines.length; i++) {
      const candidate = lines.slice(i, i + size).join('\n');
      const score = similarity(oldString, candidate);
      if (!best || score > best.score) best = { score, text: candidate };
    }
  }

  if (!best || best.score < minSimilarity) return null;
  return best.text;
}

export async function attemptEditWithRetry(
  api: EditApi,
  filePath: string,
  oldStr: string,
  newStr: string,
  maxRetries = 3,
): Promise<EditRetryResult> {
  let currentOldStr = oldStr;
  let correctedFromOriginal = false;
  const attemptLog: EditRetryAttempt[] = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const startedAt = Date.now();
    try {
      const result = await api.tools.editFile(filePath, currentOldStr, newStr);
      attemptLog.push({ attempt, startedAt, success: true, corrected: correctedFromOriginal });
      return {
        success: true,
        attempts: attempt,
        correctedFromOriginal,
        finalOldStr: currentOldStr,
        result,
        attemptLog,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
      const oldNotFound = isOldStringNotFoundError(message);
      attemptLog.push({
        attempt,
        startedAt,
        success: false,
        corrected: correctedFromOriginal,
        error: message,
      });

      if (!oldNotFound || attempt >= maxRetries) {
        return {
          success: false,
          attempts: attempt,
          correctedFromOriginal,
          finalOldStr: currentOldStr,
          error: message,
          attemptLog,
        };
      }

      try {
        const fresh = await api.tools.readFile(filePath);
        const corrected = bestCandidateByWindow(fresh.content, currentOldStr, 0.8);
        if (!corrected) {
          return {
            success: false,
            attempts: attempt,
            correctedFromOriginal,
            finalOldStr: currentOldStr,
            error: `Retry aborted: unable to locate replacement candidate after read. Original error: ${message}`,
            attemptLog,
          };
        }
        currentOldStr = corrected;
        correctedFromOriginal = correctedFromOriginal || corrected !== oldStr;
      } catch (readError) {
        const readMessage = readError instanceof Error ? readError.message : String(readError ?? 'Unknown read error');
        return {
          success: false,
          attempts: attempt,
          correctedFromOriginal,
          finalOldStr: currentOldStr,
          error: `Retry aborted: failed to read fresh file content. ${readMessage}`,
          attemptLog,
        };
      }
    }
  }

  return {
    success: false,
    attempts: maxRetries,
    correctedFromOriginal,
    finalOldStr: currentOldStr,
    error: 'Retry exhausted without success',
    attemptLog,
  };
}
