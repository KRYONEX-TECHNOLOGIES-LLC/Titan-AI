#!/usr/bin/env node
import { spawn } from 'child_process';
import { createConnection } from 'net';
import { resolve, join, dirname } from 'path';
import { existsSync, mkdirSync, appendFileSync } from 'fs';

const appRoot = resolve(process.cwd());
const workspaceRoot = resolve(appRoot, '..', '..');
const titanDir = process.env.TITAN_DIR || resolve(workspaceRoot, '.titan');
const socketPath = process.env.MIDNIGHT_SOCKET_PATH || join(titanDir, 'midnight.sock');
const sidecarEntry = resolve(workspaceRoot, 'packages', 'midnight', 'src', 'service', 'sidecar-entry.ts');
const supervisorLog = process.env.MIDNIGHT_SUPERVISOR_LOG || join(titanDir, 'midnight-supervisor.log');
const maxBackoffMs = Number(process.env.MIDNIGHT_SUPERVISOR_MAX_BACKOFF_MS || 30000);
const healthIntervalMs = Number(process.env.MIDNIGHT_HEALTH_INTERVAL_MS || 20000);

let child = null;
let stopped = false;
let restartAttempts = 0;
let healthTimer = null;
let unhealthyCount = 0;

function normalizeSocketPath(value) {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\${value.replace(/[/\\:]/g, '_')}`;
  }
  return value;
}

function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}`;
  console.log(msg);
  try {
    mkdirSync(dirname(supervisorLog), { recursive: true });
    appendFileSync(supervisorLog, `${msg}\n`, 'utf8');
  } catch {
    // ignore write failure
  }
}

function requestHealth(timeoutMs = 8000) {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = createConnection(normalizeSocketPath(socketPath));
    let buffer = '';
    const timeout = setTimeout(() => {
      socket.destroy();
      rejectPromise(new Error('health timeout'));
    }, timeoutMs);

    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ type: 'health' })}\n`);
    });

    socket.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          clearTimeout(timeout);
          socket.destroy();
          if (parsed.type === 'error') {
            rejectPromise(new Error(parsed.message || 'health error'));
          } else {
            resolvePromise(parsed);
          }
          return;
        } catch {
          // keep waiting
        }
      }
    });

    socket.on('error', error => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
  });
}

function scheduleHealthCheck() {
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(async () => {
    if (!child || stopped) return;
    try {
      await requestHealth();
      unhealthyCount = 0;
      log('healthcheck ok');
    } catch (error) {
      unhealthyCount += 1;
      log(`healthcheck failed (${unhealthyCount}): ${String(error)}`);
      if (unhealthyCount >= 3) {
        log('healthcheck threshold exceeded, restarting sidecar');
        child.kill();
      }
    }
  }, healthIntervalMs);
  healthTimer.unref();
}

function startSidecar() {
  if (stopped) return;
  if (!existsSync(sidecarEntry)) {
    throw new Error(`Sidecar entry not found: ${sidecarEntry}`);
  }

  const env = {
    ...process.env,
    MIDNIGHT_WORKSPACE_ROOT: workspaceRoot,
    MIDNIGHT_SOCKET_PATH: socketPath,
    MIDNIGHT_DB_PATH: process.env.MIDNIGHT_DB_PATH || join(titanDir, 'midnight.db'),
    MIDNIGHT_NODE_MODULES: resolve(appRoot, 'node_modules'),
  };

  child = spawn(process.execPath, ['--import', 'tsx', sidecarEntry], {
    cwd: appRoot,
    env,
    stdio: 'pipe',
  });

  child.stdout.on('data', data => log(`[sidecar] ${String(data).trim()}`));
  child.stderr.on('data', data => log(`[sidecar:stderr] ${String(data).trim()}`));

  child.on('exit', (code, signal) => {
    if (stopped) return;
    const delay = Math.min(1000 * Math.max(1, 2 ** restartAttempts), maxBackoffMs);
    restartAttempts += 1;
    unhealthyCount = 0;
    log(`sidecar exited code=${code} signal=${signal}; restarting in ${delay}ms`);
    setTimeout(startSidecar, delay).unref();
  });

  restartAttempts = 0;
  log(`sidecar started pid=${child.pid}`);
  scheduleHealthCheck();
}

function shutdown() {
  stopped = true;
  if (healthTimer) clearInterval(healthTimer);
  if (child && !child.killed) {
    child.kill();
  }
  log('supervisor stopped');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', err => {
  log(`uncaughtException: ${err.stack || err.message}`);
  shutdown();
});
process.on('unhandledRejection', reason => {
  log(`unhandledRejection: ${String(reason)}`);
  shutdown();
});

log('supervisor starting');
startSidecar();

