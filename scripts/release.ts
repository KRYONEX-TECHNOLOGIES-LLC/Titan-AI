#!/usr/bin/env node
// Release Script
// scripts/release.ts

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface ReleaseConfig {
  type: 'patch' | 'minor' | 'major' | 'custom';
  version?: string;
  dryRun: boolean;
  skipTests: boolean;
  skipBuild: boolean;
}

async function release(config: Partial<ReleaseConfig> = {}) {
  const type = config.type || 'patch';
  const dryRun = config.dryRun ?? false;
  const skipTests = config.skipTests ?? false;
  const skipBuild = config.skipBuild ?? false;

  console.log('🚀 Titan AI Release');
  console.log(`   Type: ${type}${config.version ? ` (${config.version})` : ''}`);
  console.log(`   Dry Run: ${dryRun}`);

  const rootDir = path.resolve(__dirname, '..');

  // Step 1: Check git status
  console.log('\n📋 Checking git status...');
  const gitStatus = execSync('git status --porcelain', { cwd: rootDir, encoding: 'utf-8' });
  if (gitStatus.trim()) {
    throw new Error('Working directory is not clean. Please commit or stash changes.');
  }

  // Step 2: Run tests
  if (!skipTests) {
    console.log('\n🧪 Running tests...');
    execSync('pnpm test', { cwd: rootDir, stdio: 'inherit' });
  }

  // Step 3: Determine new version
  const currentVersion = getCurrentVersion(rootDir);
  const newVersion = config.version || bumpVersion(currentVersion, type);
  
  console.log(`\n📊 Version bump: ${currentVersion} → ${newVersion}`);

  if (dryRun) {
    console.log('\n🔍 Dry run - stopping here');
    return;
  }

  // Step 4: Update version in all packages
  console.log('\n📝 Updating version in packages...');
  updateVersions(rootDir, newVersion);

  // Step 5: Generate changelog
  console.log('\n📜 Generating changelog...');
  generateChangelog(rootDir, newVersion);

  // Step 6: Build
  if (!skipBuild) {
    console.log('\n🔨 Building release...');
    execSync('pnpm build', { cwd: rootDir, stdio: 'inherit' });
  }

  // Step 7: Create git commit and tag
  console.log('\n📦 Creating git commit and tag...');
  execSync('git add -A', { cwd: rootDir });
  execSync(`git commit -m "chore(release): v${newVersion}"`, { cwd: rootDir });
  execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`, { cwd: rootDir });

  // Step 8: Create GitHub release
  console.log('\n🎉 Creating GitHub release...');
  const releaseNotes = getReleaseNotes(rootDir, newVersion);
  
  execSync(
    `gh release create v${newVersion} --title "v${newVersion}" --notes "${releaseNotes.replace(/"/g, '\\"')}"`,
    { cwd: rootDir, stdio: 'inherit' }
  );

  console.log('\n✅ Release complete!');
  console.log(`   Version: v${newVersion}`);
  console.log('   Don\'t forget to push: git push && git push --tags');
}

function getCurrentVersion(rootDir: string): string {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8')
  );
  return packageJson.version;
}

function bumpVersion(current: string, type: string): string {
  const [major, minor, patch] = current.split('.').map(Number);
  
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
}

function updateVersions(rootDir: string, newVersion: string): void {
  // Update root package.json
  updatePackageVersion(path.join(rootDir, 'package.json'), newVersion);

  // Update all workspace packages
  const packagesDir = path.join(rootDir, 'packages');
  const appsDir = path.join(rootDir, 'apps');

  const updateDir = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const packageJsonPath = path.join(dir, entry.name, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          updatePackageVersion(packageJsonPath, newVersion);
        }
        // Recurse into subdirectories
        updateDir(path.join(dir, entry.name));
      }
    }
  };

  updateDir(packagesDir);
  updateDir(appsDir);
}

function updatePackageVersion(packagePath: string, newVersion: string): void {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  pkg.version = newVersion;
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}

function generateChangelog(rootDir: string, newVersion: string): void {
  const changelogPath = path.join(rootDir, 'CHANGELOG.md');
  const date = new Date().toISOString().split('T')[0];

  // Get commits since last tag
  let commits: string;
  try {
    commits = execSync('git log $(git describe --tags --abbrev=0)..HEAD --oneline', {
      cwd: rootDir,
      encoding: 'utf-8',
    });
  } catch {
    commits = execSync('git log --oneline -20', { cwd: rootDir, encoding: 'utf-8' });
  }

  // Parse commits into categories
  const features: string[] = [];
  const fixes: string[] = [];
  const other: string[] = [];

  for (const line of commits.split('\n').filter(Boolean)) {
    const message = line.slice(8); // Remove commit hash
    if (message.startsWith('feat')) {
      features.push(message);
    } else if (message.startsWith('fix')) {
      fixes.push(message);
    } else {
      other.push(message);
    }
  }

  // Generate changelog entry
  let entry = `## [${newVersion}] - ${date}\n\n`;
  
  if (features.length > 0) {
    entry += '### Features\n\n';
    for (const f of features) {
      entry += `- ${f}\n`;
    }
    entry += '\n';
  }

  if (fixes.length > 0) {
    entry += '### Bug Fixes\n\n';
    for (const f of fixes) {
      entry += `- ${f}\n`;
    }
    entry += '\n';
  }

  // Prepend to changelog
  let existingChangelog = '';
  if (fs.existsSync(changelogPath)) {
    existingChangelog = fs.readFileSync(changelogPath, 'utf-8');
  }

  const header = '# Changelog\n\nAll notable changes to Titan AI will be documented in this file.\n\n';
  const newChangelog = existingChangelog.startsWith('# Changelog')
    ? existingChangelog.replace('# Changelog\n\n', `# Changelog\n\n${entry}`)
    : header + entry + existingChangelog;

  fs.writeFileSync(changelogPath, newChangelog);
}

function getReleaseNotes(rootDir: string, version: string): string {
  const changelogPath = path.join(rootDir, 'CHANGELOG.md');
  
  if (!fs.existsSync(changelogPath)) {
    return `Release v${version}`;
  }

  const changelog = fs.readFileSync(changelogPath, 'utf-8');
  const versionRegex = new RegExp(`## \\[${version}\\][\\s\\S]*?(?=## \\[|$)`);
  const match = changelog.match(versionRegex);
  
  return match ? match[0].trim() : `Release v${version}`;
}

// CLI
const args = process.argv.slice(2);
const config: Partial<ReleaseConfig> = {};

for (const arg of args) {
  if (arg === 'patch' || arg === 'minor' || arg === 'major') {
    config.type = arg;
  } else if (arg.startsWith('--version=')) {
    config.type = 'custom';
    config.version = arg.split('=')[1];
  } else if (arg === '--dry-run') {
    config.dryRun = true;
  } else if (arg === '--skip-tests') {
    config.skipTests = true;
  } else if (arg === '--skip-build') {
    config.skipBuild = true;
  }
}

release(config).catch((err) => {
  console.error('Release failed:', err);
  process.exit(1);
});
