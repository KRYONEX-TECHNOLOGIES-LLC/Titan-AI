/**
 * Titan AI CLI - Project Midnight Command
 * titan midnight - Autonomous factory mode
 */

import { Command } from 'commander';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import ora from 'ora';

interface MidnightOptions {
  daemon?: boolean;
  queue?: string;
  trustLevel?: string;
  verbose?: boolean;
  status?: boolean;
  stop?: boolean;
}

/**
 * Midnight command - Project Midnight autonomous factory mode
 */
export const midnightCommand = new Command('midnight')
  .description('Run Titan AI in Project Midnight mode (autonomous factory)')
  .option('--daemon', 'Run as background daemon')
  .option('--queue <path>', 'Path to project queue directory')
  .option('--trust-level <level>', 'Trust level (1-3)', '3')
  .option('--verbose', 'Verbose logging')
  .option('--status', 'Show daemon status')
  .option('--stop', 'Stop the daemon')
  .action(async (options: MidnightOptions) => {
    const titanDir = join(homedir(), '.titan');
    const socketPath = join(titanDir, 'midnight.sock');

    // Handle status check
    if (options.status) {
      await showStatus(socketPath);
      return;
    }

    // Handle stop
    if (options.stop) {
      await stopDaemon(socketPath);
      return;
    }

    // Start Project Midnight
    const spinner = ora('Initializing Project Midnight...').start();

    try {
      // Dynamic import to avoid loading heavy dependencies
      const { TrustLevel } = await import('@titan/midnight');

      const trustLevel = parseInt(options.trustLevel || '3', 10) as 1 | 2 | 3;
      
      if (trustLevel < 1 || trustLevel > 3) {
        spinner.fail('Trust level must be 1, 2, or 3');
        process.exit(1);
      }

      const trustNames = ['Supervised', 'Assistant', 'Project Midnight'];
      spinner.text = `Starting Project Midnight (Trust Level ${trustLevel}: ${trustNames[trustLevel - 1]})...`;

      // Display banner
      spinner.stop();
      displayBanner(trustLevel);

      if (options.daemon) {
        // Run as daemon
        await startDaemon(options, trustLevel);
      } else {
        // Run in foreground
        await runForeground(options, trustLevel);
      }
    } catch (error) {
      spinner.fail(`Failed to start: ${error}`);
      process.exit(1);
    }
  });

/**
 * Display Project Midnight banner
 */
function displayBanner(trustLevel: number): void {
  const moon = chalk.hex('#FFD700')(`
     _..._
   .::::::::.
  :::::::::::
  '::::::::::
    ':::::::'
      ':::'
`);

  console.log(moon);
  console.log(chalk.bold.cyan('  PROJECT MIDNIGHT'));
  console.log(chalk.gray('  Autonomous Factory Architecture'));
  console.log('');

  const trustColors = [chalk.yellow, chalk.blue, chalk.magenta];
  const trustNames = ['SUPERVISED', 'ASSISTANT', 'FULL AUTONOMY'];
  
  console.log(chalk.gray('  Trust Level: ') + trustColors[trustLevel - 1]!(trustNames[trustLevel - 1]!));
  console.log('');
}

/**
 * Show daemon status
 */
async function showStatus(socketPath: string): Promise<void> {
  try {
    const { getDaemonStatus } = await import('@titan/midnight/service');
    
    const response = await getDaemonStatus(socketPath);
    
    if (response.type === 'error') {
      console.log(chalk.yellow('Project Midnight daemon is not running'));
      return;
    }

    if (response.type === 'status' && response.data) {
      const status = response.data;
      
      console.log(chalk.bold.cyan('\nProject Midnight Status'));
      console.log(chalk.gray('─'.repeat(40)));
      
      console.log(`${chalk.gray('Running:')} ${status.running ? chalk.green('Yes') : chalk.red('No')}`);
      console.log(`${chalk.gray('Uptime:')} ${formatUptime(status.uptime)}`);
      console.log(`${chalk.gray('Queue Length:')} ${status.queueLength}`);
      console.log(`${chalk.gray('Tasks Completed:')} ${chalk.green(status.tasksCompleted)}`);
      console.log(`${chalk.gray('Tasks Failed:')} ${chalk.red(status.tasksFailed)}`);
      
      // Confidence meter
      const confidenceColor = 
        status.confidenceStatus === 'healthy' ? chalk.green :
        status.confidenceStatus === 'warning' ? chalk.yellow :
        chalk.red;
      console.log(`${chalk.gray('Confidence:')} ${confidenceColor(`${status.confidenceScore}%`)}`);
      
      if (status.currentProject) {
        console.log(`${chalk.gray('Current Project:')} ${status.currentProject.name}`);
      }

      if (status.cooldowns.length > 0) {
        console.log(chalk.yellow(`\nIn Cooldown: ${status.cooldowns.length} provider(s)`));
        for (const cd of status.cooldowns) {
          const resumeIn = Math.max(0, cd.resumeAt - Date.now());
          console.log(`  ${cd.provider}: resumes in ${formatUptime(resumeIn)}`);
        }
      }

      console.log('');
    }
  } catch {
    console.log(chalk.yellow('Project Midnight daemon is not running'));
  }
}

/**
 * Stop the daemon
 */
async function stopDaemon(socketPath: string): Promise<void> {
  const spinner = ora('Stopping Project Midnight daemon...').start();

  try {
    const { createIPCClient } = await import('@titan/midnight/service');
    
    const client = createIPCClient(socketPath);
    await client.connect();
    await client.request({ type: 'stop', graceful: true });
    client.disconnect();

    spinner.succeed('Project Midnight daemon stopped');
  } catch {
    spinner.fail('Failed to stop daemon (may not be running)');
  }
}

/**
 * Start as daemon
 */
async function startDaemon(options: MidnightOptions, trustLevel: number): Promise<void> {
  const spinner = ora('Starting daemon...').start();

  try {
    const { spawn } = await import('child_process');
    
    // Spawn detached process
    const args = [
      'midnight',
      '--trust-level', String(trustLevel),
    ];

    if (options.queue) {
      args.push('--queue', options.queue);
    }

    if (options.verbose) {
      args.push('--verbose');
    }

    const child = spawn('titan', args, {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    spinner.succeed(`Daemon started with PID ${child.pid}`);
    console.log(chalk.gray('  Use `titan midnight --status` to check status'));
    console.log(chalk.gray('  Use `titan midnight --stop` to stop the daemon'));
  } catch (error) {
    spinner.fail(`Failed to start daemon: ${error}`);
    process.exit(1);
  }
}

/**
 * Run in foreground
 */
async function runForeground(options: MidnightOptions, trustLevel: number): Promise<void> {
  console.log(chalk.gray('Running in foreground mode. Press Ctrl+C to stop.'));
  console.log('');

  try {
    // This would initialize the actual orchestrator
    // For now, simulate the loop
    console.log(chalk.cyan('Waiting for projects in queue...'));
    console.log(chalk.gray(`Queue path: ${options.queue || '~/.titan/queue'}`));
    console.log('');

    // Keep running until interrupted
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\nShutting down gracefully...'));
      process.exit(0);
    });

    // Simulate main loop
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      if (options.verbose) {
        console.log(chalk.gray(`[${new Date().toISOString()}] Checking queue...`));
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export default midnightCommand;
