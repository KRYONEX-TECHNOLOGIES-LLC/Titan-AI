/**
 * Titan AI Shadow - Container Runtime
 * Docker/Kata container management for isolated execution
 */

import { execa } from 'execa';
import type { ContainerInfo, ExecutionRequest, ExecutionResult } from './types.js';

export interface ContainerConfig {
  image: string;
  name?: string;
  workdir?: string;
  volumes?: Record<string, string>;
  ports?: Record<number, number>;
  env?: Record<string, string>;
  memoryLimit?: string;
  cpuLimit?: number;
  network?: string;
}

export class ContainerRuntime {
  private config: ContainerConfig;
  private containerId: string | null = null;

  constructor(config: ContainerConfig) {
    this.config = {
      workdir: '/workspace',
      ...config,
    };
  }

  /**
   * Create and start a container
   */
  async start(): Promise<string> {
    const args = ['run', '-d'];

    // Add name
    if (this.config.name) {
      args.push('--name', this.config.name);
    }

    // Add workdir
    args.push('-w', this.config.workdir!);

    // Add volumes
    if (this.config.volumes) {
      for (const [host, container] of Object.entries(this.config.volumes)) {
        args.push('-v', `${host}:${container}`);
      }
    }

    // Add ports
    if (this.config.ports) {
      for (const [host, container] of Object.entries(this.config.ports)) {
        args.push('-p', `${host}:${container}`);
      }
    }

    // Add environment variables
    if (this.config.env) {
      for (const [key, value] of Object.entries(this.config.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    // Add resource limits
    if (this.config.memoryLimit) {
      args.push('--memory', this.config.memoryLimit);
    }
    if (this.config.cpuLimit) {
      args.push('--cpus', this.config.cpuLimit.toString());
    }

    // Add network
    if (this.config.network) {
      args.push('--network', this.config.network);
    }

    // Add image
    args.push(this.config.image);

    // Keep container running
    args.push('tail', '-f', '/dev/null');

    const result = await execa('docker', args);
    this.containerId = result.stdout.trim();

    return this.containerId;
  }

  /**
   * Execute a command in the container
   */
  async exec(request: ExecutionRequest): Promise<ExecutionResult> {
    if (!this.containerId) {
      throw new Error('Container not started');
    }

    const startTime = Date.now();
    const args = ['exec'];

    // Add working directory
    if (request.cwd) {
      args.push('-w', request.cwd);
    }

    // Add environment
    if (request.env) {
      for (const [key, value] of Object.entries(request.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    args.push(this.containerId, request.command);

    if (request.args) {
      args.push(...request.args);
    }

    try {
      const result = await execa('docker', args, {
        timeout: request.timeout ?? 60000,
        reject: false,
      });

      return {
        success: result.exitCode === 0,
        exitCode: result.exitCode ?? 1,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: Date.now() - startTime,
        errors: [],
      };
    } catch (error) {
      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        killed: true,
        errors: [
          {
            type: 'runtime',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      };
    }
  }

  /**
   * Stop the container
   */
  async stop(): Promise<void> {
    if (!this.containerId) return;

    await execa('docker', ['stop', this.containerId]);
  }

  /**
   * Remove the container
   */
  async remove(): Promise<void> {
    if (!this.containerId) return;

    await execa('docker', ['rm', '-f', this.containerId]);
    this.containerId = null;
  }

  /**
   * Get container info
   */
  async getInfo(): Promise<ContainerInfo | null> {
    if (!this.containerId) return null;

    try {
      const result = await execa('docker', [
        'inspect',
        '--format',
        '{{json .}}',
        this.containerId,
      ]);

      const info = JSON.parse(result.stdout);

      return {
        id: info.Id,
        name: info.Name.replace(/^\//, ''),
        image: info.Config.Image,
        status: info.State.Running ? 'running' : 'stopped',
        ports: {},
        volumes: {},
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if container is running
   */
  async isRunning(): Promise<boolean> {
    const info = await this.getInfo();
    return info?.status === 'running';
  }

  /**
   * Copy file to container
   */
  async copyTo(hostPath: string, containerPath: string): Promise<void> {
    if (!this.containerId) throw new Error('Container not started');
    await execa('docker', ['cp', hostPath, `${this.containerId}:${containerPath}`]);
  }

  /**
   * Copy file from container
   */
  async copyFrom(containerPath: string, hostPath: string): Promise<void> {
    if (!this.containerId) throw new Error('Container not started');
    await execa('docker', ['cp', `${this.containerId}:${containerPath}`, hostPath]);
  }
}

/**
 * Check if Docker is available
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execa('docker', ['version']);
    return true;
  } catch {
    return false;
  }
}
