/**
 * Project Midnight - Background Service
 * Headless daemon mode with PID file, logging, and graceful shutdown
 */

import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { MidnightConfig, MidnightStatus, MidnightEvent } from '../types.js';
import type { MidnightOrchestrator } from '../orchestration/midnight-orchestrator.js';
import { IPCServer } from './ipc.js';

export interface BackgroundServiceConfig {
  configPath: string;
  logPath: string;
  pidFile: string;
  socketPath: string;
  verbose: boolean;
}

export class BackgroundService {
  private config: BackgroundServiceConfig;
  private orchestrator: MidnightOrchestrator | null = null;
  private ipcServer: IPCServer | null = null;
  private running = false;
  private logStream: ((message: string) => void) | null = null;

  constructor(config: Partial<BackgroundServiceConfig> = {}) {
    const titanDir = join(homedir(), '.titan');
    
    this.config = {
      configPath: config.configPath || join(titanDir, 'midnight.config.json'),
      logPath: config.logPath || join(titanDir, 'midnight.log'),
      pidFile: config.pidFile || join(titanDir, 'midnight.pid'),
      socketPath: config.socketPath || join(titanDir, 'midnight.sock'),
      verbose: config.verbose ?? false,
    };

    // Ensure .titan directory exists
    this.ensureDirectory(titanDir);
  }

  /**
   * Start the background service
   */
  async start(
    orchestrator: MidnightOrchestrator,
    midnightConfig: MidnightConfig
  ): Promise<void> {
    if (this.running) {
      throw new Error('Service is already running');
    }

    // Check for existing instance
    if (this.isRunning()) {
      throw new Error('Another instance is already running');
    }

    this.orchestrator = orchestrator;
    this.running = true;

    // Write PID file
    this.writePidFile();

    // Setup logging
    this.setupLogging();

    // Setup IPC server
    await this.setupIPC();

    // Setup signal handlers
    this.setupSignalHandlers();

    // Log startup
    this.log('info', `Project Midnight service started (PID: ${process.pid})`);
    this.log('info', `Trust Level: ${midnightConfig.trustLevel}`);
    this.log('info', `Log file: ${this.config.logPath}`);
    this.log('info', `IPC socket: ${this.config.socketPath}`);

    // Subscribe to orchestrator events
    orchestrator.on(event => this.handleEvent(event));

    // Start orchestrator
    await orchestrator.start();
  }

  /**
   * Stop the background service
   */
  async stop(graceful = true): Promise<void> {
    if (!this.running) return;

    this.log('info', `Stopping service (graceful: ${graceful})`);

    // Stop orchestrator
    if (this.orchestrator) {
      await this.orchestrator.stop(graceful);
    }

    // Stop IPC server
    if (this.ipcServer) {
      await this.ipcServer.stop();
    }

    // Cleanup PID file
    this.removePidFile();

    this.running = false;
    this.log('info', 'Service stopped');
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    if (!existsSync(this.config.pidFile)) {
      return false;
    }

    try {
      const pid = parseInt(readFileSync(this.config.pidFile, 'utf-8').trim(), 10);
      
      // Check if process exists
      process.kill(pid, 0);
      return true;
    } catch {
      // Process doesn't exist, clean up stale PID file
      this.removePidFile();
      return false;
    }
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<MidnightStatus | null> {
    if (!this.orchestrator) return null;
    return this.orchestrator.getStatusAsync();
  }

  /**
   * Get PID of running service
   */
  getPid(): number | null {
    if (!existsSync(this.config.pidFile)) {
      return null;
    }

    try {
      return parseInt(readFileSync(this.config.pidFile, 'utf-8').trim(), 10);
    } catch {
      return null;
    }
  }

  // ─── Private helpers ───

  private writePidFile(): void {
    this.ensureDirectory(dirname(this.config.pidFile));
    writeFileSync(this.config.pidFile, process.pid.toString());
  }

  private removePidFile(): void {
    if (existsSync(this.config.pidFile)) {
      try {
        unlinkSync(this.config.pidFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private ensureDirectory(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private setupLogging(): void {
    const { appendFileSync } = require('fs');
    
    this.logStream = (message: string) => {
      const timestamp = new Date().toISOString();
      const line = `[${timestamp}] ${message}\n`;
      
      appendFileSync(this.config.logPath, line);
      
      if (this.config.verbose) {
        console.log(line.trim());
      }
    };
  }

  private async setupIPC(): Promise<void> {
    this.ipcServer = new IPCServer(this.config.socketPath);

    // Register handlers
    this.ipcServer.handle('status', async () => {
      const status = await this.getStatus();
      return { type: 'status', data: status };
    });

    this.ipcServer.handle('stop', async (req) => {
      const graceful = req.graceful ?? true;
      await this.stop(graceful);
      return { type: 'success', message: 'Service stopped' };
    });

    this.ipcServer.handle('pause', async () => {
      if (this.orchestrator) {
        await this.orchestrator.pause();
      }
      return { type: 'success', message: 'Service paused' };
    });

    this.ipcServer.handle('resume', async () => {
      if (this.orchestrator) {
        await this.orchestrator.resume();
      }
      return { type: 'success', message: 'Service resumed' };
    });

    await this.ipcServer.start();
  }

  private setupSignalHandlers(): void {
    // Graceful shutdown on SIGTERM
    process.on('SIGTERM', async () => {
      this.log('info', 'Received SIGTERM, shutting down gracefully...');
      await this.stop(true);
      process.exit(0);
    });

    // Graceful shutdown on SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      this.log('info', 'Received SIGINT, shutting down gracefully...');
      await this.stop(true);
      process.exit(0);
    });

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      this.log('error', `Uncaught exception: ${error.message}\n${error.stack}`);
      this.stop(false).finally(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason) => {
      this.log('error', `Unhandled rejection: ${reason}`);
    });
  }

  private handleEvent(event: MidnightEvent): void {
    // Log events
    switch (event.type) {
      case 'project_started':
        this.log('info', `Project started: ${event.project.name}`);
        break;
      case 'project_completed':
        this.log('info', `Project completed: ${event.project.name}`);
        break;
      case 'project_failed':
        this.log('error', `Project failed: ${event.project.name} - ${event.error}`);
        break;
      case 'task_started':
        this.log('debug', `Task started: ${event.task.description}`);
        break;
      case 'task_completed':
        this.log('debug', `Task completed: ${event.task.description}`);
        break;
      case 'sentinel_verdict':
        this.log('info', `Sentinel verdict: Score ${event.verdict.qualityScore}, Passed: ${event.verdict.passed}`);
        break;
      case 'sentinel_veto':
        this.log('warn', `Sentinel VETO: ${event.reason}`);
        break;
      case 'cooldown_entered':
        this.log('warn', `Cooldown entered: ${event.cooldown.provider}, resume at ${new Date(event.cooldown.resumeAt).toISOString()}`);
        break;
      case 'handoff_triggered':
        this.log('info', `Handoff: ${event.fromProject} -> ${event.toProject}`);
        break;
      case 'confidence_update':
        this.log('debug', `Confidence: ${event.score}% (${event.status})`);
        break;
    }

    // Forward to IPC subscribers
    if (this.ipcServer) {
      this.ipcServer.broadcast({ type: 'event', event });
    }
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    if (this.logStream) {
      const prefix = level.toUpperCase().padEnd(5);
      this.logStream(`${prefix} ${message}`);
    }
  }
}

/**
 * Create a new background service
 */
export function createBackgroundService(
  config?: Partial<BackgroundServiceConfig>
): BackgroundService {
  return new BackgroundService(config);
}

/**
 * Daemonize the current process (Unix-like systems only)
 */
export async function daemonize(
  service: BackgroundService,
  orchestrator: MidnightOrchestrator,
  config: MidnightConfig
): Promise<void> {
  const { spawn } = await import('child_process');
  const { platform } = await import('os');

  if (platform() === 'win32') {
    // On Windows, just start in background
    // The service will handle its own persistence
    await service.start(orchestrator, config);
    return;
  }

  // Fork the process to background
  const child = spawn(process.execPath, process.argv.slice(1), {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();
  
  console.log(`Daemon started with PID: ${child.pid}`);
  process.exit(0);
}
