import type { ProjectAutopsy, ToolCallFn } from './omega-model';

function detectFramework(dependencies: string[]): string | undefined {
  if (dependencies.some((d) => d.includes('vitest'))) return 'vitest';
  if (dependencies.some((d) => d.includes('jest'))) return 'jest';
  if (dependencies.some((d) => d.includes('mocha'))) return 'mocha';
  if (dependencies.some((d) => d.includes('pytest'))) return 'pytest';
  return undefined;
}

function detectPackageManager(fileTreeText: string): ProjectAutopsy['packageManager'] {
  if (fileTreeText.includes('pnpm-lock.yaml')) return 'pnpm';
  if (fileTreeText.includes('yarn.lock')) return 'yarn';
  if (fileTreeText.includes('package-lock.json')) return 'npm';
  if (fileTreeText.includes('pyproject.toml')) return 'poetry';
  if (fileTreeText.includes('requirements.txt')) return 'pip';
  return undefined;
}

function inferProjectType(fileTreeText: string): ProjectAutopsy['projectType'] {
  const hasNode = fileTreeText.includes('package.json');
  const hasPy = fileTreeText.includes('.py') || fileTreeText.includes('pyproject.toml');
  const hasManyApps = fileTreeText.includes('apps/') || fileTreeText.includes('packages/');
  if (hasNode && hasPy) return hasManyApps ? 'monorepo' : 'mixed';
  if (hasManyApps) return 'monorepo';
  if (hasNode) return 'node';
  if (hasPy) return 'python';
  return 'unknown';
}

function truncate(content: string, max = 12_000): string {
  if (!content) return '';
  return content.length > max ? `${content.slice(0, max)}\n[TRUNCATED]` : content;
}

async function safeReadFile(executeToolCall: ToolCallFn, path: string): Promise<string> {
  const result = await executeToolCall('read_file', { path });
  if (!result.success) return '';
  return truncate(result.output || '');
}

async function safeListRoot(executeToolCall: ToolCallFn): Promise<string> {
  const result = await executeToolCall('list_directory', { path: '.' });
  if (!result.success) return '';
  return truncate(result.output || '', 20_000);
}

export async function performAutopsy(
  executeToolCall: ToolCallFn,
  workspacePath: string,
): Promise<ProjectAutopsy> {
  const directoryStructure = await safeListRoot(executeToolCall);
  const keyFiles: Record<string, string> = {};
  const candidateFiles = [
    'package.json',
    'tsconfig.json',
    'pyproject.toml',
    'requirements.txt',
    'README.md',
    'Makefile',
    '.eslintrc',
    '.eslintrc.json',
    '.eslintrc.js',
  ];

  for (const file of candidateFiles) {
    const content = await safeReadFile(executeToolCall, file);
    if (content) keyFiles[file] = content;
  }

  const packageJsonContent = keyFiles['package.json'];
  let dependencies: string[] = [];
  let devDependencies: string[] = [];
  let scripts: Record<string, string> = {};
  let projectName = workspacePath.split(/[\\/]/).pop() || 'workspace';

  if (packageJsonContent) {
    try {
      const parsed = JSON.parse(packageJsonContent
        .split('\n')
        .map((line) => line.replace(/^\d+\|/, ''))
        .join('\n'));
      dependencies = Object.keys(parsed.dependencies || {});
      devDependencies = Object.keys(parsed.devDependencies || {});
      scripts = parsed.scripts || {};
      if (parsed.name) projectName = parsed.name;
    } catch {
      // Keep defaults if package.json can't be parsed.
    }
  }

  const allDeps = [...dependencies, ...devDependencies];
  const packageManager = detectPackageManager(directoryStructure);
  const projectType = inferProjectType(directoryStructure);
  const testFramework = detectFramework(allDeps);

  const entryPoints: string[] = [];
  if (directoryStructure.includes('src/index.ts')) entryPoints.push('src/index.ts');
  if (directoryStructure.includes('src/main.ts')) entryPoints.push('src/main.ts');
  if (directoryStructure.includes('main.py')) entryPoints.push('main.py');
  if (directoryStructure.includes('app.py')) entryPoints.push('app.py');

  const conventions: string[] = [];
  if (keyFiles['tsconfig.json']?.includes('"strict": true')) conventions.push('TypeScript strict mode');
  if (keyFiles['.eslintrc'] || keyFiles['.eslintrc.json'] || keyFiles['.eslintrc.js']) conventions.push('ESLint configured');
  if (directoryStructure.includes('prettier')) conventions.push('Prettier formatting');

  return {
    projectName,
    projectType,
    packageManager,
    entryPoints,
    keyFiles,
    directoryStructure,
    dependencies,
    devDependencies,
    testFramework,
    testCommand: scripts.test || (projectType === 'python' ? 'pytest' : 'npm test'),
    buildCommand: scripts.build || (projectType === 'python' ? 'python -m build' : 'npm run build'),
    lintCommand: scripts.lint || (projectType === 'python' ? 'ruff check .' : 'npm run lint'),
    typeCheckCommand: scripts.typecheck || scripts['type-check'] || (projectType === 'python' ? 'mypy .' : 'npm run typecheck'),
    conventions,
  };
}
