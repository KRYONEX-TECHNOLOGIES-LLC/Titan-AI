#!/usr/bin/env node
// Build Web Script
// scripts/build-web.ts

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface WebBuildConfig {
  production: boolean;
  analyze: boolean;
  outputDir: string;
}

async function buildWeb(config: Partial<WebBuildConfig> = {}) {
  const production = config.production ?? true;
  const analyze = config.analyze ?? false;
  const rootDir = path.resolve(__dirname, '..');
  const webDir = path.join(rootDir, 'apps', 'web');
  const outputDir = config.outputDir || path.join(rootDir, 'dist', 'web');

  console.log('🌐 Building Titan AI Web');
  console.log(`   Mode: ${production ? 'production' : 'development'}`);
  console.log(`   Output: ${outputDir}`);

  // Step 1: Build shared packages
  console.log('\n📦 Building shared packages...');
  execSync('pnpm build', { cwd: rootDir, stdio: 'inherit' });

  // Step 2: Build Next.js app
  console.log('\n⚙️ Building Next.js application...');
  
  const buildEnv = {
    ...process.env,
    NODE_ENV: production ? 'production' : 'development',
    NEXT_TELEMETRY_DISABLED: '1',
  };

  if (analyze) {
    buildEnv.ANALYZE = 'true';
  }

  execSync('pnpm build', { cwd: webDir, stdio: 'inherit', env: buildEnv });

  // Step 3: Export static files if needed
  if (production) {
    console.log('\n📤 Exporting static files...');
    
    // Copy .next/standalone for serverless deployment
    const standaloneDir = path.join(webDir, '.next', 'standalone');
    const staticDir = path.join(webDir, '.next', 'static');
    const publicDir = path.join(webDir, 'public');

    if (fs.existsSync(standaloneDir)) {
      copyDir(standaloneDir, outputDir);
      
      // Copy static assets
      const outputStaticDir = path.join(outputDir, '.next', 'static');
      if (fs.existsSync(staticDir)) {
        copyDir(staticDir, outputStaticDir);
      }
      
      // Copy public folder
      const outputPublicDir = path.join(outputDir, 'public');
      if (fs.existsSync(publicDir)) {
        copyDir(publicDir, outputPublicDir);
      }
    }
  }

  // Step 4: Generate service worker for PWA
  console.log('\n🔧 Generating service worker...');
  generateServiceWorker(outputDir);

  console.log('\n✅ Web build complete!');
  console.log(`   Output: ${outputDir}`);
}

function copyDir(src: string, dest: string) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function generateServiceWorker(outputDir: string) {
  const swContent = `// Titan AI Service Worker
const CACHE_NAME = 'titan-ai-v1';
const STATIC_ASSETS = [
  '/',
  '/editor',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
});
`;

  const swPath = path.join(outputDir, 'sw.js');
  fs.writeFileSync(swPath, swContent);
}

// CLI
const args = process.argv.slice(2);
const config: Partial<WebBuildConfig> = {};

for (const arg of args) {
  if (arg === '--dev') {
    config.production = false;
  } else if (arg === '--analyze') {
    config.analyze = true;
  } else if (arg.startsWith('--output=')) {
    config.outputDir = arg.split('=')[1];
  }
}

buildWeb(config).catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
