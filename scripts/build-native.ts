#!/usr/bin/env node
// Build Native Modules Script
// scripts/build-native.ts

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface NativeBuildConfig {
  target: 'all' | 'indexer' | 'crypto' | 'gpu';
  release: boolean;
  platform?: string;
  arch?: string;
}

async function buildNative(config: Partial<NativeBuildConfig> = {}) {
  const target = config.target || 'all';
  const release = config.release ?? true;
  const platform = config.platform || process.platform;
  const arch = config.arch || process.arch;

  console.log('🦀 Building Native Modules');
  console.log(`   Target: ${target}`);
  console.log(`   Mode: ${release ? 'release' : 'debug'}`);
  console.log(`   Platform: ${platform}-${arch}`);

  const rootDir = path.resolve(__dirname, '..');
  const packagesDir = path.join(rootDir, 'packages');

  // Check Rust installation
  console.log('\n🔍 Checking Rust installation...');
  try {
    const rustVersion = execSync('rustc --version', { encoding: 'utf-8' });
    console.log(`   Found: ${rustVersion.trim()}`);
  } catch {
    console.error('   Error: Rust not found. Please install Rust from https://rustup.rs');
    process.exit(1);
  }

  const modules: { name: string; path: string }[] = [];

  if (target === 'all' || target === 'indexer') {
    modules.push({
      name: 'indexer-native',
      path: path.join(packagesDir, 'indexer-native'),
    });
  }

  for (const module of modules) {
    console.log(`\n📦 Building ${module.name}...`);
    
    if (!fs.existsSync(module.path)) {
      console.log(`   Skipping: ${module.path} not found`);
      continue;
    }

    const cargoToml = path.join(module.path, 'Cargo.toml');
    if (!fs.existsSync(cargoToml)) {
      console.log(`   Skipping: No Cargo.toml found`);
      continue;
    }

    try {
      // Build with napi-rs
      const buildCommand = release
        ? 'pnpm build --release'
        : 'pnpm build';
      
      execSync(buildCommand, {
        cwd: module.path,
        stdio: 'inherit',
        env: {
          ...process.env,
          CARGO_BUILD_TARGET: getCargoTarget(platform, arch),
        },
      });

      console.log(`   ✅ ${module.name} built successfully`);
    } catch (err) {
      console.error(`   ❌ Failed to build ${module.name}`);
      throw err;
    }
  }

  // Copy native modules to appropriate locations
  console.log('\n📋 Copying native modules...');
  for (const module of modules) {
    const srcPattern = path.join(module.path, '*.node');
    const destDir = path.join(module.path, 'dist');
    
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Find and copy .node files
    const files = fs.readdirSync(module.path);
    for (const file of files) {
      if (file.endsWith('.node')) {
        const src = path.join(module.path, file);
        const dest = path.join(destDir, file);
        fs.copyFileSync(src, dest);
        console.log(`   Copied: ${file}`);
      }
    }
  }

  console.log('\n✅ Native modules built successfully!');
}

function getCargoTarget(platform: string, arch: string): string {
  const targets: Record<string, Record<string, string>> = {
    win32: {
      x64: 'x86_64-pc-windows-msvc',
      arm64: 'aarch64-pc-windows-msvc',
    },
    darwin: {
      x64: 'x86_64-apple-darwin',
      arm64: 'aarch64-apple-darwin',
    },
    linux: {
      x64: 'x86_64-unknown-linux-gnu',
      arm64: 'aarch64-unknown-linux-gnu',
    },
  };

  return targets[platform]?.[arch] || '';
}

// CLI
const args = process.argv.slice(2);
const config: Partial<NativeBuildConfig> = {};

for (const arg of args) {
  if (arg.startsWith('--target=')) {
    config.target = arg.split('=')[1] as NativeBuildConfig['target'];
  } else if (arg === '--debug') {
    config.release = false;
  } else if (arg.startsWith('--platform=')) {
    config.platform = arg.split('=')[1];
  } else if (arg.startsWith('--arch=')) {
    config.arch = arg.split('=')[1];
  }
}

buildNative(config).catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
