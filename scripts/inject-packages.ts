/**
 * Inject Titan Packages into VS Code
 *
 * This script injects @titan/* packages into the VS Code build
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { join, relative } from 'path';

const ROOT_DIR = join(__dirname, '..');
const VSCODE_DIR = join(ROOT_DIR, 'vscode-core');
const PACKAGES_DIR = join(ROOT_DIR, 'packages');

interface PackageInfo {
  name: string;
  path: string;
  main: string;
}

async function main() {
  console.log('💉 Titan AI - Package Injection');
  console.log('================================\n');

  // Check if vscode-core exists
  if (!existsSync(VSCODE_DIR)) {
    console.error('❌ vscode-core directory not found');
    console.error('   Run `pnpm setup:fork` first');
    process.exit(1);
  }

  // Build packages first
  console.log('📦 Building Titan packages...');
  try {
    execSync('pnpm build:packages', { cwd: ROOT_DIR, stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Failed to build packages');
    process.exit(1);
  }

  // Discover packages
  const packages = discoverPackages();
  console.log(`\n📋 Found ${packages.length} packages to inject:\n`);
  
  for (const pkg of packages) {
    console.log(`   - ${pkg.name}`);
  }

  // Create injection manifest
  const manifest = createInjectionManifest(packages);

  // Inject into VS Code
  console.log('\n🔌 Injecting packages...');
  injectIntoVSCode(manifest);

  // Update VS Code package.json
  updateVSCodePackageJson(packages);

  console.log('\n✅ Package injection complete!');
  console.log('\nNext steps:');
  console.log('  1. cd vscode-core');
  console.log('  2. yarn install');
  console.log('  3. yarn compile');
}

function discoverPackages(): PackageInfo[] {
  const packages: PackageInfo[] = [];

  // AI packages
  const aiPackages = ['gateway', 'router', 'speculative', 'agents'];
  for (const name of aiPackages) {
    const pkgPath = join(PACKAGES_DIR, 'ai', name);
    if (existsSync(pkgPath)) {
      const pkgJson = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf-8'));
      packages.push({
        name: pkgJson.name,
        path: pkgPath,
        main: pkgJson.main || 'dist/index.js',
      });
    }
  }

  // Core packages
  const corePackages = ['editor', 'extension-api', 'ai-integration'];
  for (const name of corePackages) {
    const pkgPath = join(PACKAGES_DIR, 'core', name);
    if (existsSync(pkgPath)) {
      const pkgJson = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf-8'));
      packages.push({
        name: pkgJson.name,
        path: pkgPath,
        main: pkgJson.main || 'dist/index.js',
      });
    }
  }

  // Other packages
  const otherPackages = ['vectordb', 'repo-map', 'mcp', 'shadow', 'security', 'performance', 'ui'];
  for (const name of otherPackages) {
    const pkgPath = join(PACKAGES_DIR, name);
    if (existsSync(pkgPath)) {
      const pkgJson = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf-8'));
      packages.push({
        name: pkgJson.name,
        path: pkgPath,
        main: pkgJson.main || 'dist/index.js',
      });
    }
  }

  return packages;
}

function createInjectionManifest(packages: PackageInfo[]) {
  return {
    version: '0.1.0',
    injectedAt: new Date().toISOString(),
    packages: packages.map(pkg => ({
      name: pkg.name,
      main: pkg.main,
      relativePath: relative(ROOT_DIR, pkg.path),
    })),
  };
}

function injectIntoVSCode(manifest: any) {
  const titanDir = join(VSCODE_DIR, 'src', 'vs', 'titan');
  
  if (!existsSync(titanDir)) {
    mkdirSync(titanDir, { recursive: true });
  }

  // Write manifest
  const manifestPath = join(titanDir, 'packages.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('   ✓ Created packages.json manifest');

  // Create loader
  const loaderContent = `/**
 * Titan AI Package Loader
 * 
 * Auto-generated - do not edit manually
 */

// Package manifest
export const TITAN_PACKAGES = ${JSON.stringify(manifest.packages, null, 2)};

// Load a Titan package
export async function loadTitanPackage(name: string): Promise<any> {
  const pkg = TITAN_PACKAGES.find(p => p.name === name);
  if (!pkg) {
    throw new Error(\`Titan package not found: \${name}\`);
  }
  
  // In production, this would dynamically import the package
  // For development, packages are linked via node_modules
  return import(name);
}

// Initialize all Titan packages
export async function initializeTitanPackages(): Promise<void> {
  console.log('[Titan AI] Initializing packages...');
  
  for (const pkg of TITAN_PACKAGES) {
    try {
      console.log(\`[Titan AI] Loading \${pkg.name}...\`);
      await loadTitanPackage(pkg.name);
    } catch (error) {
      console.error(\`[Titan AI] Failed to load \${pkg.name}:\`, error);
    }
  }
  
  console.log('[Titan AI] All packages initialized');
}
`;

  writeFileSync(join(titanDir, 'loader.ts'), loaderContent);
  console.log('   ✓ Created package loader');
}

function updateVSCodePackageJson(packages: PackageInfo[]) {
  const vscodePkgPath = join(VSCODE_DIR, 'package.json');
  
  if (!existsSync(vscodePkgPath)) {
    console.log('   ⚠️  VS Code package.json not found, skipping');
    return;
  }

  const vscodePkg = JSON.parse(readFileSync(vscodePkgPath, 'utf-8'));

  // Add Titan packages as dependencies
  if (!vscodePkg.dependencies) {
    vscodePkg.dependencies = {};
  }

  for (const pkg of packages) {
    vscodePkg.dependencies[pkg.name] = `link:${relative(VSCODE_DIR, pkg.path)}`;
  }

  writeFileSync(vscodePkgPath, JSON.stringify(vscodePkg, null, 2));
  console.log('   ✓ Updated VS Code package.json');
}

main().catch((error) => {
  console.error('\n❌ Injection failed:', error);
  process.exit(1);
});
