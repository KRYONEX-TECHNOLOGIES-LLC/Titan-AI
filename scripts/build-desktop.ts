#!/usr/bin/env node
// Build Desktop Script
// scripts/build-desktop.ts

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface BuildConfig {
  platform: 'win32' | 'darwin' | 'linux';
  arch: 'x64' | 'arm64';
  production: boolean;
}

async function buildDesktop(config: Partial<BuildConfig> = {}) {
  const platform = config.platform || (process.platform as BuildConfig['platform']);
  const arch = config.arch || (process.arch === 'arm64' ? 'arm64' : 'x64');
  const production = config.production ?? true;

  console.log('🚀 Building Titan AI Desktop');
  console.log(`   Platform: ${platform}`);
  console.log(`   Architecture: ${arch}`);
  console.log(`   Mode: ${production ? 'production' : 'development'}`);

  const rootDir = path.resolve(__dirname, '..');
  const vscodeDir = path.join(rootDir, 'vscode-core');
  const packagesDir = path.join(rootDir, 'packages');

  // Step 1: Build packages
  console.log('\n📦 Building packages...');
  execSync('pnpm build', { cwd: rootDir, stdio: 'inherit' });

  // Step 2: Inject packages into VS Code
  console.log('\n📥 Injecting Titan AI packages...');
  execSync('npx ts-node scripts/inject-packages.ts', { cwd: rootDir, stdio: 'inherit' });

  // Step 3: Build native modules
  console.log('\n🔧 Building native modules...');
  execSync('pnpm build', { cwd: path.join(packagesDir, 'indexer-native'), stdio: 'inherit' });

  // Step 4: Compile VS Code
  console.log('\n⚙️ Compiling Titan AI IDE...');
  execSync('yarn compile', { cwd: vscodeDir, stdio: 'inherit' });

  // Step 5: Package for platform
  console.log(`\n📦 Packaging for ${platform}-${arch}...`);
  
  const packageCommand = getPackageCommand(platform, arch, production);
  execSync(packageCommand, { cwd: vscodeDir, stdio: 'inherit' });

  // Step 6: Create installer
  console.log('\n💿 Creating installer...');
  await createInstaller(platform, arch, rootDir, vscodeDir);

  console.log('\n✅ Build complete!');
  console.log(`   Output: ${getOutputPath(platform, arch, rootDir)}`);
}

function getPackageCommand(platform: string, arch: string, production: boolean): string {
  const base = production ? 'yarn gulp' : 'yarn gulp';
  
  switch (platform) {
    case 'win32':
      return `${base} vscode-win32-${arch}`;
    case 'darwin':
      return `${base} vscode-darwin-${arch}`;
    case 'linux':
      return `${base} vscode-linux-${arch}`;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

async function createInstaller(
  platform: string,
  arch: string,
  rootDir: string,
  vscodeDir: string
): Promise<void> {
  const distDir = path.join(rootDir, 'dist', `titan-ai-${platform}-${arch}`);
  
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  switch (platform) {
    case 'win32':
      // Create NSIS installer
      console.log('   Creating Windows installer (NSIS)...');
      // In production, this would invoke NSIS
      break;
      
    case 'darwin':
      // Create DMG
      console.log('   Creating macOS DMG...');
      // In production, this would invoke create-dmg
      break;
      
    case 'linux':
      // Create AppImage and deb/rpm
      console.log('   Creating Linux AppImage...');
      // In production, this would invoke appimagetool
      break;
  }
}

function getOutputPath(platform: string, arch: string, rootDir: string): string {
  const ext = platform === 'win32' ? '.exe' : platform === 'darwin' ? '.dmg' : '.AppImage';
  return path.join(rootDir, 'dist', `titan-ai-${platform}-${arch}${ext}`);
}

// CLI
const args = process.argv.slice(2);
const config: Partial<BuildConfig> = {};

for (const arg of args) {
  if (arg.startsWith('--platform=')) {
    config.platform = arg.split('=')[1] as BuildConfig['platform'];
  } else if (arg.startsWith('--arch=')) {
    config.arch = arg.split('=')[1] as BuildConfig['arch'];
  } else if (arg === '--dev') {
    config.production = false;
  }
}

buildDesktop(config).catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
