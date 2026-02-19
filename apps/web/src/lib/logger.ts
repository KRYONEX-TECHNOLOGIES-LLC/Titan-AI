/**
 * Structured logger for Titan AI server-side operations.
 * Outputs JSON-structured logs for production observability.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LEVEL];
}

function formatEntry(entry: LogEntry): string {
  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify(entry);
  }
  const prefix = {
    debug: '\x1b[90m[DEBUG]\x1b[0m',
    info: '\x1b[36m[INFO]\x1b[0m',
    warn: '\x1b[33m[WARN]\x1b[0m',
    error: '\x1b[31m[ERROR]\x1b[0m',
  }[entry.level];
  const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
  const err = entry.error ? ` | ${entry.error.message}` : '';
  return `${entry.timestamp.slice(11, 23)} ${prefix} [${entry.module}] ${entry.message}${data}${err}`;
}

function emit(entry: LogEntry) {
  const formatted = formatEntry(entry);
  if (entry.level === 'error') {
    console.error(formatted);
  } else if (entry.level === 'warn') {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

export function createLogger(module: string) {
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error) => {
    if (!shouldLog(level)) return;
    emit({
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data,
      error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
    });
  };

  return {
    debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
    info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
    warn: (message: string, data?: Record<string, unknown>) => log('warn', message, data),
    error: (message: string, error?: Error, data?: Record<string, unknown>) => log('error', message, data, error || undefined),
  };
}
