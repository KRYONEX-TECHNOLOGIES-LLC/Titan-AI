// Docker Sandbox Implementation
// packages/shadow/sandbox/src/docker-sandbox.ts

import {
  SandboxProvider,
  SandboxConfig,
  SandboxState,
  SandboxStatus,
  ExecutionRequest,
  ExecutionResult,
} from './types';

export class DockerSandbox implements SandboxProvider {
  readonly type = 'docker' as const;
  private docker: any = null;
  private containers: Map<string, { containerId: string; config: SandboxConfig }> = new Map();

  constructor() {
    this.initializeDocker();
  }

  private async initializeDocker(): Promise<void> {
    try {
      const Dockerode = await import('dockerode');
      this.docker = new Dockerode.default();
    } catch {
      // Docker not available
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.docker) {
      await this.initializeDocker();
    }

    if (!this.docker) return false;

    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  async create(config: SandboxConfig): Promise<string> {
    if (!this.docker) {
      throw new Error('Docker is not available');
    }

    const containerConfig = {
      Image: config.env.SANDBOX_IMAGE || 'node:20-alpine',
      name: config.name,
      Cmd: ['/bin/sh'],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      OpenStdin: true,
      Tty: false,
      Env: Object.entries(config.env).map(([k, v]) => `${k}=${v}`),
      HostConfig: {
        Memory: config.resources.memoryMb * 1024 * 1024,
        MemorySwap: config.resources.memoryMb * 1024 * 1024, // Disable swap
        CpuQuota: config.resources.cpuCores * 100000,
        CpuPeriod: 100000,
        PidsLimit: config.resources.pids,
        NetworkMode: config.network.enabled ? 'bridge' : 'none',
        Binds: config.mounts.map(m => 
          `${m.hostPath}:${m.containerPath}:${m.readOnly ? 'ro' : 'rw'}`
        ),
        SecurityOpt: [
          'no-new-privileges:true',
        ],
        CapDrop: ['ALL'],
        CapAdd: config.capabilities,
        ReadonlyRootfs: true,
      },
    };

    const container = await this.docker.createContainer(containerConfig);
    this.containers.set(config.id, { containerId: container.id, config });

    return config.id;
  }

  async start(id: string): Promise<void> {
    const info = this.containers.get(id);
    if (!info) {
      throw new Error(`Container not found: ${id}`);
    }

    const container = this.docker.getContainer(info.containerId);
    await container.start();
  }

  async stop(id: string): Promise<void> {
    const info = this.containers.get(id);
    if (!info) {
      throw new Error(`Container not found: ${id}`);
    }

    const container = this.docker.getContainer(info.containerId);
    await container.stop({ t: 10 });
  }

  async destroy(id: string): Promise<void> {
    const info = this.containers.get(id);
    if (!info) return;

    try {
      const container = this.docker.getContainer(info.containerId);
      await container.remove({ force: true });
    } catch {
      // Container may already be removed
    }

    this.containers.delete(id);
  }

  async execute(id: string, request: ExecutionRequest): Promise<ExecutionResult> {
    const info = this.containers.get(id);
    if (!info) {
      throw new Error(`Container not found: ${id}`);
    }

    const startTime = Date.now();
    const container = this.docker.getContainer(info.containerId);

    const exec = await container.exec({
      Cmd: request.command,
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: !!request.stdin,
      WorkingDir: request.workdir,
      Env: request.env ? Object.entries(request.env).map(([k, v]) => `${k}=${v}`) : undefined,
    });

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      const timeoutId = request.timeout
        ? setTimeout(() => {
            killed = true;
            exec.resize({ h: 0, w: 0 }); // Kill exec
          }, request.timeout)
        : null;

      exec.start({ hijack: true, stdin: !!request.stdin }, (err: any, stream: any) => {
        if (err) {
          if (timeoutId) clearTimeout(timeoutId);
          return reject(err);
        }

        if (request.stdin) {
          stream.write(request.stdin);
          stream.end();
        }

        // Demux stdout and stderr
        this.docker.modem.demuxStream(
          stream,
          { write: (data: Buffer) => { stdout += data.toString(); } },
          { write: (data: Buffer) => { stderr += data.toString(); } }
        );

        stream.on('end', async () => {
          if (timeoutId) clearTimeout(timeoutId);

          try {
            const inspectData = await exec.inspect();
            resolve({
              exitCode: inspectData.ExitCode ?? -1,
              stdout,
              stderr,
              duration: Date.now() - startTime,
              killed,
            });
          } catch (e) {
            resolve({
              exitCode: -1,
              stdout,
              stderr,
              duration: Date.now() - startTime,
              killed,
            });
          }
        });
      });
    });
  }

  async getState(id: string): Promise<SandboxState> {
    const info = this.containers.get(id);
    if (!info) {
      throw new Error(`Container not found: ${id}`);
    }

    const container = this.docker.getContainer(info.containerId);
    const inspectData = await container.inspect();
    const stats = await container.stats({ stream: false });

    let status: SandboxStatus;
    if (inspectData.State.Running) {
      status = 'running';
    } else if (inspectData.State.Status === 'created') {
      status = 'created';
    } else {
      status = 'stopped';
    }

    return {
      id,
      type: 'docker',
      status,
      createdAt: new Date(inspectData.Created).getTime(),
      startedAt: inspectData.State.StartedAt
        ? new Date(inspectData.State.StartedAt).getTime()
        : undefined,
      stoppedAt: inspectData.State.FinishedAt
        ? new Date(inspectData.State.FinishedAt).getTime()
        : undefined,
      resourceUsage: {
        cpuPercent: this.calculateCpuPercent(stats),
        memoryMb: (stats.memory_stats?.usage || 0) / (1024 * 1024),
        diskMb: 0, // Not easily available
        networkRxBytes: stats.networks?.eth0?.rx_bytes || 0,
        networkTxBytes: stats.networks?.eth0?.tx_bytes || 0,
      },
      lastError: inspectData.State.Error || undefined,
    };
  }

  private calculateCpuPercent(stats: any): number {
    const cpuDelta = stats.cpu_stats?.cpu_usage?.total_usage - 
                     stats.precpu_stats?.cpu_usage?.total_usage;
    const systemDelta = stats.cpu_stats?.system_cpu_usage - 
                        stats.precpu_stats?.system_cpu_usage;
    
    if (systemDelta > 0 && cpuDelta > 0) {
      const cpuCount = stats.cpu_stats?.online_cpus || 1;
      return (cpuDelta / systemDelta) * cpuCount * 100;
    }
    return 0;
  }
}
