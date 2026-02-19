#!/usr/bin/env node
/**
 * Titan AI CLI - Headless mode for Project Midnight
 * Usage: titan --midnight [options]
 *
 * Options:
 *   --midnight          Start autonomous build mode
 *   --queue <file>      Path to project queue JSON file
 *   --trust <1|2|3>     Trust level (1=suggest, 2=auto-safe, 3=full-auto)
 *   --model <model>     AI model to use
 *   --output <dir>      Output directory for logs
 *   --dry-run           Plan without executing
 *   --help              Show help
 */

const args = process.argv.slice(2);

interface CliOptions {
  midnight: boolean;
  queue?: string;
  trust: 1 | 2 | 3;
  model: string;
  output: string;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {
    midnight: false,
    trust: 3,
    model: 'claude-4.6-sonnet',
    output: './titan-logs',
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--midnight': opts.midnight = true; break;
      case '--queue': opts.queue = args[++i]; break;
      case '--trust': opts.trust = parseInt(args[++i]) as 1 | 2 | 3; break;
      case '--model': opts.model = args[++i]; break;
      case '--output': opts.output = args[++i]; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--help': case '-h': opts.help = true; break;
    }
  }

  return opts;
}

function showHelp() {
  console.log(`
  Titan AI CLI v2.0.0

  Usage:
    titan --midnight [options]

  Options:
    --midnight          Start autonomous build mode (Project Midnight)
    --queue <file>      Path to project queue JSON
    --trust <1|2|3>     Trust level: 1=suggest, 2=auto-safe, 3=full-auto
    --model <model>     AI model (default: claude-4.6-sonnet)
    --output <dir>      Log output directory (default: ./titan-logs)
    --dry-run           Plan tasks without executing
    --help, -h          Show this help

  Examples:
    titan --midnight --trust 3 --model claude-4.6-sonnet
    titan --midnight --queue projects.json --output ./logs
    titan --midnight --dry-run
  `);
}

function log(level: 'info' | 'warn' | 'error' | 'success', message: string) {
  const timestamp = new Date().toISOString().slice(11, 19);
  const prefix = {
    info: '\x1b[36m[INFO]\x1b[0m',
    warn: '\x1b[33m[WARN]\x1b[0m',
    error: '\x1b[31m[ERROR]\x1b[0m',
    success: '\x1b[32m[OK]\x1b[0m',
  }[level];
  console.log(`${timestamp} ${prefix} ${message}`);
}

async function startMidnight(opts: CliOptions) {
  log('info', '🌙 Project Midnight - Autonomous Build Mode');
  log('info', `Trust Level: ${opts.trust}`);
  log('info', `Model: ${opts.model}`);
  log('info', `Output: ${opts.output}`);

  if (opts.dryRun) {
    log('warn', 'DRY RUN MODE - No changes will be made');
  }

  // Load project queue
  let queue: Array<{ name: string; path: string; spec?: string }> = [];
  if (opts.queue) {
    try {
      const fs = require('fs');
      const content = fs.readFileSync(opts.queue, 'utf-8');
      queue = JSON.parse(content);
      log('info', `Loaded ${queue.length} projects from queue`);
    } catch (e) {
      log('error', `Failed to load queue: ${(e as Error).message}`);
      process.exit(1);
    }
  } else {
    queue = [{ name: 'Current Project', path: process.cwd() }];
  }

  // Ensure output directory
  const fs = require('fs');
  const path = require('path');
  fs.mkdirSync(opts.output, { recursive: true });

  const logFile = path.join(opts.output, `midnight-${Date.now()}.log`);
  const appendLog = (msg: string) => {
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`);
  };

  log('info', `Logging to: ${logFile}`);
  appendLog('=== Project Midnight Started ===');
  appendLog(`Trust: ${opts.trust}, Model: ${opts.model}`);

  for (let i = 0; i < queue.length; i++) {
    const project = queue[i];
    log('info', `\n--- Project ${i + 1}/${queue.length}: ${project.name} ---`);
    appendLog(`\n--- Project: ${project.name} at ${project.path} ---`);

    // Start the build cycle via API
    try {
      const baseUrl = process.env.TITAN_API_URL || 'http://localhost:3000';

      // Initialize Midnight for this project
      const initRes = await fetch(`${baseUrl}/api/midnight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          project: project.name,
          path: project.path,
          model: opts.model,
          trustLevel: opts.trust,
          spec: project.spec,
        }),
      });

      if (!initRes.ok) {
        log('error', `Failed to start build for ${project.name}`);
        appendLog(`ERROR: Failed to start build`);
        continue;
      }

      const initData = await initRes.json();
      log('success', `Build started: ${initData.message || 'OK'}`);
      appendLog(`Build started: ${JSON.stringify(initData)}`);

      // Poll for completion
      let running = true;
      let iteration = 0;
      while (running) {
        await new Promise(r => setTimeout(r, 5000));
        iteration++;

        try {
          const statusRes = await fetch(`${baseUrl}/api/midnight`);
          const status = await statusRes.json();

          if (!status.running) {
            running = false;
            log('success', `Project ${project.name} completed`);
            appendLog(`Completed: ${JSON.stringify(status)}`);
          } else {
            if (iteration % 6 === 0) {
              log('info', `Still running... Progress: ${status.progress || 'unknown'}%`);
            }
          }

          // Circuit breaker: stop after 30 minutes per project
          if (iteration > 360) {
            log('warn', `Circuit breaker: ${project.name} exceeded 30 min limit`);
            appendLog(`Circuit breaker triggered`);
            await fetch(`${baseUrl}/api/midnight`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'stop' }),
            });
            running = false;
          }
        } catch (e) {
          log('error', `Status check failed: ${(e as Error).message}`);
          if (iteration > 10) {
            running = false;
          }
        }
      }
    } catch (e) {
      log('error', `Build failed for ${project.name}: ${(e as Error).message}`);
      appendLog(`FAILED: ${(e as Error).message}`);
    }
  }

  appendLog('=== Project Midnight Finished ===');
  log('success', '\n🌙 All projects processed. Midnight complete.');
  process.exit(0);
}

// Main entry point
const opts = parseArgs(args);

if (opts.help || args.length === 0) {
  showHelp();
  process.exit(0);
}

if (opts.midnight) {
  startMidnight(opts).catch(e => {
    log('error', `Fatal: ${e.message}`);
    process.exit(1);
  });
} else {
  showHelp();
  process.exit(0);
}
