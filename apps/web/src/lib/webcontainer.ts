// WebContainer Integration
// apps/web/src/lib/webcontainer.ts

import { WebContainer, FileSystemTree } from '@webcontainer/api';

let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

export interface WebContainerFile {
  path: string;
  content: string;
}

export interface TerminalOutput {
  type: 'stdout' | 'stderr';
  data: string;
}

export interface ProcessResult {
  exitCode: number;
  output: string[];
}

export async function getWebContainer(): Promise<WebContainer> {
  if (webcontainerInstance) {
    return webcontainerInstance;
  }

  if (!bootPromise) {
    bootPromise = WebContainer.boot().then((instance) => {
      webcontainerInstance = instance;
      return instance;
    });
  }

  return bootPromise;
}

export async function writeFiles(files: WebContainerFile[]): Promise<void> {
  const container = await getWebContainer();
  
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    const fileName = parts.pop()!;
    const dirPath = parts.join('/');

    // Create directory if needed
    if (dirPath) {
      await container.fs.mkdir(dirPath, { recursive: true });
    }

    // Write file
    await container.fs.writeFile(file.path, file.content);
  }
}

export async function writeFileTree(tree: FileSystemTree): Promise<void> {
  const container = await getWebContainer();
  await container.mount(tree);
}

export async function readFile(path: string): Promise<string> {
  const container = await getWebContainer();
  return container.fs.readFile(path, 'utf-8');
}

export async function readDir(path: string): Promise<string[]> {
  const container = await getWebContainer();
  return container.fs.readdir(path);
}

export async function runCommand(
  command: string,
  args: string[],
  onOutput?: (output: TerminalOutput) => void
): Promise<ProcessResult> {
  const container = await getWebContainer();
  
  const process = await container.spawn(command, args);
  const output: string[] = [];

  // Stream stdout
  process.output.pipeTo(
    new WritableStream({
      write(data) {
        output.push(data);
        onOutput?.({ type: 'stdout', data });
      },
    })
  );

  const exitCode = await process.exit;

  return { exitCode, output };
}

export async function installDependencies(
  onOutput?: (output: TerminalOutput) => void
): Promise<ProcessResult> {
  return runCommand('npm', ['install'], onOutput);
}

export async function runDevServer(
  onOutput?: (output: TerminalOutput) => void,
  onServerReady?: (url: string) => void
): Promise<void> {
  const container = await getWebContainer();
  
  const process = await container.spawn('npm', ['run', 'dev']);
  
  process.output.pipeTo(
    new WritableStream({
      write(data) {
        onOutput?.({ type: 'stdout', data });
      },
    })
  );

  // Listen for server ready
  container.on('server-ready', (port, url) => {
    onServerReady?.(url);
  });
}

export async function runTests(
  onOutput?: (output: TerminalOutput) => void
): Promise<ProcessResult> {
  return runCommand('npm', ['test'], onOutput);
}

export async function runBuild(
  onOutput?: (output: TerminalOutput) => void
): Promise<ProcessResult> {
  return runCommand('npm', ['run', 'build'], onOutput);
}

export async function runLint(
  onOutput?: (output: TerminalOutput) => void
): Promise<ProcessResult> {
  return runCommand('npm', ['run', 'lint'], onOutput);
}

export async function killProcess(): Promise<void> {
  // WebContainer processes are automatically cleaned up
  // This function is for API consistency
}

export async function getServerUrl(): Promise<string | null> {
  const container = await getWebContainer();
  
  return new Promise((resolve) => {
    container.on('server-ready', (port, url) => {
      resolve(url);
    });
    
    // Timeout after 30 seconds
    setTimeout(() => resolve(null), 30000);
  });
}

export function isWebContainerSupported(): boolean {
  // Check if SharedArrayBuffer is available (required for WebContainer)
  return typeof SharedArrayBuffer !== 'undefined';
}

export async function destroyWebContainer(): Promise<void> {
  if (webcontainerInstance) {
    // WebContainer doesn't have a destroy method
    // We just clear the reference
    webcontainerInstance = null;
    bootPromise = null;
  }
}

// Helper to create a basic project structure
export function createProjectTree(
  name: string,
  type: 'node' | 'react' | 'next'
): FileSystemTree {
  const basePackageJson = {
    name,
    version: '1.0.0',
    type: 'module',
  };

  switch (type) {
    case 'node':
      return {
        'package.json': {
          file: {
            contents: JSON.stringify(
              {
                ...basePackageJson,
                main: 'index.js',
                scripts: {
                  start: 'node index.js',
                  dev: 'node --watch index.js',
                },
              },
              null,
              2
            ),
          },
        },
        'index.js': {
          file: {
            contents: `console.log('Hello from ${name}!');`,
          },
        },
      };

    case 'react':
      return {
        'package.json': {
          file: {
            contents: JSON.stringify(
              {
                ...basePackageJson,
                scripts: {
                  dev: 'vite',
                  build: 'vite build',
                },
                dependencies: {
                  react: '^18.2.0',
                  'react-dom': '^18.2.0',
                },
                devDependencies: {
                  vite: '^5.0.0',
                  '@vitejs/plugin-react': '^4.0.0',
                },
              },
              null,
              2
            ),
          },
        },
        'index.html': {
          file: {
            contents: `<!DOCTYPE html>
<html>
<head><title>${name}</title></head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>`,
          },
        },
        src: {
          directory: {
            'main.jsx': {
              file: {
                contents: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);`,
              },
            },
            'App.jsx': {
              file: {
                contents: `export default function App() {
  return <h1>Hello from ${name}!</h1>;
}`,
              },
            },
          },
        },
      };

    case 'next':
      return {
        'package.json': {
          file: {
            contents: JSON.stringify(
              {
                ...basePackageJson,
                scripts: {
                  dev: 'next dev',
                  build: 'next build',
                  start: 'next start',
                },
                dependencies: {
                  next: '^14.0.0',
                  react: '^18.2.0',
                  'react-dom': '^18.2.0',
                },
              },
              null,
              2
            ),
          },
        },
        'app': {
          directory: {
            'page.jsx': {
              file: {
                contents: `export default function Home() {
  return <h1>Hello from ${name}!</h1>;
}`,
              },
            },
            'layout.jsx': {
              file: {
                contents: `export default function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}`,
              },
            },
          },
        },
      };

    default:
      return {};
  }
}
