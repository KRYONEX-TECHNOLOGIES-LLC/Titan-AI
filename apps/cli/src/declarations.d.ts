declare module 'chalk' {
  interface ChalkFn {
    (...text: unknown[]): string;
    bold: ChalkFn;
    dim: ChalkFn;
    italic: ChalkFn;
    underline: ChalkFn;
    inverse: ChalkFn;
    strikethrough: ChalkFn;
    red: ChalkFn;
    green: ChalkFn;
    yellow: ChalkFn;
    blue: ChalkFn;
    magenta: ChalkFn;
    cyan: ChalkFn;
    white: ChalkFn;
    gray: ChalkFn;
    grey: ChalkFn;
    hex: (color: string) => ChalkFn;
    rgb: (r: number, g: number, b: number) => ChalkFn;
    bgRed: ChalkFn;
    bgGreen: ChalkFn;
    bgYellow: ChalkFn;
    bgBlue: ChalkFn;
    bgMagenta: ChalkFn;
    bgCyan: ChalkFn;
    bgWhite: ChalkFn;
  }

  const chalk: ChalkFn;
  export default chalk;
}

declare module 'boxen' {
  interface BoxenOptions {
    padding?: number;
    margin?: number;
    borderColor?: string;
    borderStyle?: string;
    float?: string;
    title?: string;
    titleAlignment?: string;
  }
  function boxen(text: string, options?: BoxenOptions): string;
  export default boxen;
}

declare module 'inquirer' {
  interface PromptQuestion {
    type: string;
    name: string;
    message: string;
    default?: any;
    choices?: any[];
  }
  interface Inquirer {
    prompt(questions: PromptQuestion[]): Promise<any>;
  }
  const inquirer: Inquirer;
  export default inquirer;
}

declare module '@titan/midnight' {
  export enum TrustLevel {
    SUPERVISED = 1,
    ASSISTANT = 2,
    FULL_AUTONOMY = 3,
  }
}

declare module '@titan/midnight/service' {
  interface DaemonStatus {
    type: 'status' | 'error';
    data?: {
      running: boolean;
      uptime: number;
      queueLength: number;
      tasksCompleted: number;
      tasksFailed: number;
      confidenceStatus: string;
      confidenceScore: number;
      currentProject?: { name: string };
      cooldowns: Array<{ provider: string; resumeAt: number }>;
    };
  }

  export function getDaemonStatus(socketPath: string): Promise<DaemonStatus>;

  interface IPCClient {
    connect(): Promise<void>;
    request(msg: any): Promise<any>;
    disconnect(): void;
  }

  export function createIPCClient(socketPath: string): IPCClient;
}
