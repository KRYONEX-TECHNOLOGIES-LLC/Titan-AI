// Hardware Isolation Configuration
// packages/shadow/sandbox/src/hardware-isolation.ts

import { HardwareIsolationConfig, SandboxConfig } from './types';

// Default seccomp profile for sandboxes
export const DEFAULT_SECCOMP_PROFILE = `
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "defaultErrnoRet": 1,
  "archMap": [
    {
      "architecture": "SCMP_ARCH_X86_64",
      "subArchitectures": ["SCMP_ARCH_X86", "SCMP_ARCH_X32"]
    },
    {
      "architecture": "SCMP_ARCH_AARCH64",
      "subArchitectures": ["SCMP_ARCH_ARM"]
    }
  ],
  "syscalls": [
    {
      "names": [
        "read", "write", "open", "close", "stat", "fstat", "lstat",
        "poll", "lseek", "mmap", "mprotect", "munmap", "brk",
        "rt_sigaction", "rt_sigprocmask", "ioctl", "access",
        "pipe", "select", "sched_yield", "mremap", "msync",
        "mincore", "madvise", "dup", "dup2", "nanosleep",
        "getpid", "socket", "connect", "accept", "sendto", "recvfrom",
        "sendmsg", "recvmsg", "shutdown", "bind", "listen",
        "getsockname", "getpeername", "socketpair", "setsockopt", "getsockopt",
        "clone", "fork", "vfork", "execve", "exit", "wait4", "kill",
        "uname", "fcntl", "flock", "fsync", "fdatasync", "truncate",
        "ftruncate", "getcwd", "chdir", "readlink", "chmod", "fchmod",
        "chown", "fchown", "umask", "gettimeofday", "getrlimit",
        "getrusage", "sysinfo", "times", "getuid", "getgid", "geteuid",
        "getegid", "setpgid", "getppid", "getpgrp", "setsid", "getgroups",
        "utime", "mkdir", "rmdir", "link", "unlink", "symlink", "rename",
        "readdir", "openat", "mkdirat", "mknodat", "fchownat",
        "futimesat", "newfstatat", "unlinkat", "renameat", "linkat",
        "symlinkat", "readlinkat", "fchmodat", "faccessat",
        "pselect6", "ppoll", "arch_prctl", "set_tid_address",
        "set_robust_list", "exit_group", "epoll_wait", "epoll_ctl",
        "tgkill", "utimes", "epoll_create1", "pipe2", "eventfd2",
        "dup3", "accept4", "timerfd_create", "timerfd_settime",
        "timerfd_gettime", "signalfd4", "getrandom", "memfd_create",
        "clock_gettime", "clock_getres", "clock_nanosleep",
        "pread64", "pwrite64", "futex", "prctl"
      ],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
`;

// Capabilities to drop for maximum isolation
export const DROP_CAPABILITIES = [
  'CAP_AUDIT_CONTROL',
  'CAP_AUDIT_READ',
  'CAP_AUDIT_WRITE',
  'CAP_BLOCK_SUSPEND',
  'CAP_CHOWN',
  'CAP_DAC_OVERRIDE',
  'CAP_DAC_READ_SEARCH',
  'CAP_FOWNER',
  'CAP_FSETID',
  'CAP_IPC_LOCK',
  'CAP_IPC_OWNER',
  'CAP_KILL',
  'CAP_LEASE',
  'CAP_LINUX_IMMUTABLE',
  'CAP_MAC_ADMIN',
  'CAP_MAC_OVERRIDE',
  'CAP_MKNOD',
  'CAP_NET_ADMIN',
  'CAP_NET_BIND_SERVICE',
  'CAP_NET_BROADCAST',
  'CAP_NET_RAW',
  'CAP_SETGID',
  'CAP_SETFCAP',
  'CAP_SETPCAP',
  'CAP_SETUID',
  'CAP_SYS_ADMIN',
  'CAP_SYS_BOOT',
  'CAP_SYS_CHROOT',
  'CAP_SYS_MODULE',
  'CAP_SYS_NICE',
  'CAP_SYS_PACCT',
  'CAP_SYS_PTRACE',
  'CAP_SYS_RAWIO',
  'CAP_SYS_RESOURCE',
  'CAP_SYS_TIME',
  'CAP_SYS_TTY_CONFIG',
  'CAP_SYSLOG',
  'CAP_WAKE_ALARM',
];

// Minimal capabilities needed for basic operation
export const MINIMAL_CAPABILITIES = [
  'CAP_SETUID',
  'CAP_SETGID',
];

export class HardwareIsolationManager {
  private profiles: Map<string, HardwareIsolationConfig> = new Map();

  constructor() {
    this.registerDefaultProfiles();
  }

  private registerDefaultProfiles(): void {
    // Maximum isolation
    this.profiles.set('maximum', {
      seccompProfile: DEFAULT_SECCOMP_PROFILE,
      readOnlyRootfs: true,
      noNewPrivileges: true,
      dropCapabilities: DROP_CAPABILITIES,
    });

    // Standard isolation
    this.profiles.set('standard', {
      seccompProfile: DEFAULT_SECCOMP_PROFILE,
      readOnlyRootfs: true,
      noNewPrivileges: true,
      dropCapabilities: DROP_CAPABILITIES.filter(
        cap => !MINIMAL_CAPABILITIES.includes(cap)
      ),
    });

    // Minimal isolation (for development/debugging)
    this.profiles.set('minimal', {
      seccompProfile: '',
      readOnlyRootfs: false,
      noNewPrivileges: false,
      dropCapabilities: [],
    });
  }

  getProfile(name: string): HardwareIsolationConfig | undefined {
    return this.profiles.get(name);
  }

  registerProfile(name: string, config: HardwareIsolationConfig): void {
    this.profiles.set(name, config);
  }

  applyToSandboxConfig(
    sandboxConfig: SandboxConfig,
    isolationProfile: string = 'standard'
  ): SandboxConfig {
    const profile = this.profiles.get(isolationProfile);
    if (!profile) {
      throw new Error(`Unknown isolation profile: ${isolationProfile}`);
    }

    return {
      ...sandboxConfig,
      capabilities: MINIMAL_CAPABILITIES.filter(
        cap => !profile.dropCapabilities.includes(cap)
      ),
      env: {
        ...sandboxConfig.env,
        SANDBOX_SECCOMP_PROFILE: profile.seccompProfile ? 'enabled' : 'disabled',
        SANDBOX_READ_ONLY_ROOTFS: String(profile.readOnlyRootfs),
        SANDBOX_NO_NEW_PRIVILEGES: String(profile.noNewPrivileges),
      },
    };
  }

  // Validate that a sandbox meets security requirements
  validateIsolation(config: SandboxConfig): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check network isolation
    if (config.network.enabled && !config.network.allowedHosts) {
      warnings.push('Network is enabled without allowedHosts restriction');
    }

    // Check resource limits
    if (config.resources.memoryMb > 8192) {
      warnings.push('High memory limit may impact host system');
    }

    if (config.resources.cpuCores > 4) {
      warnings.push('High CPU allocation may impact host system');
    }

    // Check mounts
    for (const mount of config.mounts) {
      if (!mount.readOnly && mount.hostPath.startsWith('/etc')) {
        issues.push(`Writable mount to sensitive path: ${mount.hostPath}`);
      }

      if (mount.hostPath === '/') {
        issues.push('Mount of root filesystem is dangerous');
      }
    }

    // Check capabilities
    const dangerousCapabilities = [
      'CAP_SYS_ADMIN',
      'CAP_SYS_PTRACE',
      'CAP_NET_ADMIN',
      'CAP_SYS_MODULE',
    ];

    for (const cap of config.capabilities) {
      if (dangerousCapabilities.includes(cap)) {
        issues.push(`Dangerous capability enabled: ${cap}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings,
    };
  }
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
}
