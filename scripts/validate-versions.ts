/**
 * Validate that all version-bearing files in the monorepo are in sync.
 * Run manually: pnpm validate-versions
 * Also runs automatically via the pre-commit hook.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());

const VERSION_FILES = [
  'package.json',
  'apps/desktop/package.json',
  'apps/web/package.json',
];

const MANIFEST_FILE = 'apps/web/src/app/api/releases/latest/manifest.json';

interface Result {
  file: string;
  version: string | null;
  error?: string;
}

function readVersion(relPath: string): Result {
  const fullPath = resolve(ROOT, relPath);
  try {
    const raw = readFileSync(fullPath, 'utf-8');
    const pkg = JSON.parse(raw) as { version?: string };
    return { file: relPath, version: pkg.version ?? null };
  } catch (err) {
    return { file: relPath, version: null, error: (err as Error).message };
  }
}

function syncManifest(targetVersion: string): void {
  const fullPath = resolve(ROOT, MANIFEST_FILE);
  try {
    const raw = readFileSync(fullPath, 'utf-8');
    const manifest = JSON.parse(raw);
    if (manifest.version !== targetVersion) {
      const oldVersion = manifest.version || '0.0.0';
      manifest.version = targetVersion;
      manifest.publishedAt = new Date().toISOString();
      if (manifest.downloads?.windows?.url) {
        manifest.downloads.windows.url = manifest.downloads.windows.url.replace(new RegExp(oldVersion.replace(/\./g, '\\.'), 'g'), targetVersion);
      }
      if (manifest.downloads?.windows?.checksumUrl) {
        manifest.downloads.windows.checksumUrl = manifest.downloads.windows.checksumUrl.replace(new RegExp(oldVersion.replace(/\./g, '\\.'), 'g'), targetVersion);
      }
      const { writeFileSync } = require('fs');
      writeFileSync(fullPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
      console.log(`[validate-versions] Auto-synced manifest.json: ${oldVersion} -> ${targetVersion}`);
    }
  } catch (err) {
    console.warn(`[validate-versions] Warning: Could not sync manifest.json: ${(err as Error).message}`);
  }
}

function main() {
  const results = VERSION_FILES.map(readVersion);

  const errors = results.filter(r => r.error);
  if (errors.length > 0) {
    console.error('\n  Could not read version from:');
    for (const e of errors) console.error(`   ${e.file}: ${e.error}`);
    process.exit(1);
  }

  const missing = results.filter(r => !r.version);
  if (missing.length > 0) {
    console.error('\n  Missing "version" field in:');
    for (const m of missing) console.error(`   ${m.file}`);
    process.exit(1);
  }

  const canonical = results[0]!.version!;
  const mismatched = results.filter(r => r.version !== canonical);

  if (mismatched.length > 0) {
    console.error(`\n  VERSION MISMATCH! Expected "${canonical}" everywhere.\n`);
    for (const r of results) {
      const mark = r.version === canonical ? 'OK' : 'WRONG';
      console.error(`   [${mark}]  ${r.file}  ->  ${r.version}`);
    }
    console.error('\n   Fix: all 3 files must have the same "version" value.\n');
    process.exit(1);
  }

  // Auto-sync the release manifest with the canonical version
  syncManifest(canonical);

  console.log(`[validate-versions] All versions in sync: ${canonical}`);
}

main();
