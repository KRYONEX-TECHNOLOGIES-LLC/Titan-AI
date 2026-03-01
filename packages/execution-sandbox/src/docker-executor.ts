import Docker from 'node-docker-api';
import { ContainerCreateOptions, Container } from 'node-docker-api/lib/container';
import { exec } from 'child_process';

const DOCKER_IMAGE = 'node:18-slim';
const MAX_RUNTIME_MS = 5000;
const MEMORY_LIMIT = '512m';
const CPU_SHARES = 512;

export class DockerExecutor {
  private docker = new Docker({ socketPath: '/var/run/docker.sock' });

  async executeCode(code: string): Promise<{ stdout: string; stderr: string; status: number }> {
    const container = await this.docker.container.create({
      Image: DOCKER_IMAGE,
      Cmd: ['node', '-e', code],
      HostConfig: {
        Memory: MEMORY_LIMIT,
        CpuShares: CPU_SHARES,
        AutoRemove: true,
      },
      StopTimeout: Math.floor(MAX_RUNTIME_MS / 1000),
    });

    await container.start();

    const timeout = setTimeout(async () => {
      await container.stop();
    }, MAX_RUNTIME_MS);

    const exitData = await container.wait();
    clearTimeout(timeout);

    const logs = await container.logs({
      stdout: true,
      stderr: true,
      timestamps: false,
    });

    return {
      stdout: logs.toString(),
      stderr: '',
      status: exitData.StatusCode,
    };
  }
}