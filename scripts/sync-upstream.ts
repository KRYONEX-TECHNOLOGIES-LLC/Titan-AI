/**
 * Sync Upstream VS Code
 *
 * This script syncs the Code-OSS fork with upstream changes
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT_DIR = join(__dirname, '..');
const VSCODE_DIR = join(ROOT_DIR, 'vscode-core');

async function main() {
  console.log('🔄 Titan AI - Sync Upstream VS Code');
  console.log('====================================\n');

  // Check if vscode-core exists
  if (!existsSync(VSCODE_DIR)) {
    console.error('❌ vscode-core directory not found');
    console.error('   Run `pnpm setup:fork` first');
    process.exit(1);
  }

  // Check for uncommitted changes
  try {
    execSync('git status --porcelain', { cwd: VSCODE_DIR });
    const status = execSync('git status --porcelain', { 
      cwd: VSCODE_DIR, 
      encoding: 'utf-8' 
    });
    
    if (status.trim()) {
      console.error('❌ Uncommitted changes in vscode-core');
      console.error('   Please commit or stash changes first');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to check git status');
    process.exit(1);
  }

  // Get current tag/version
  const currentTag = execSync('git describe --tags --abbrev=0', {
    cwd: VSCODE_DIR,
    encoding: 'utf-8',
  }).trim();

  console.log(`📌 Current version: ${currentTag}`);

  // Fetch upstream tags
  console.log('\n📡 Fetching upstream...');
  try {
    execSync('git fetch origin --tags', { cwd: VSCODE_DIR, stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Failed to fetch upstream');
    process.exit(1);
  }

  // Get latest tag
  const latestTag = execSync('git describe --tags $(git rev-list --tags --max-count=1)', {
    cwd: VSCODE_DIR,
    encoding: 'utf-8',
  }).trim();

  console.log(`📦 Latest version: ${latestTag}`);

  if (currentTag === latestTag) {
    console.log('\n✅ Already up to date!');
    return;
  }

  console.log(`\n🔀 Updating from ${currentTag} to ${latestTag}...`);

  // Create a backup branch
  const backupBranch = `backup-${currentTag}-${Date.now()}`;
  console.log(`\n💾 Creating backup branch: ${backupBranch}`);
  execSync(`git checkout -b ${backupBranch}`, { cwd: VSCODE_DIR });
  execSync('git checkout main', { cwd: VSCODE_DIR });

  // Attempt to merge
  try {
    console.log('\n🔀 Merging upstream changes...');
    execSync(`git merge ${latestTag} --no-edit`, { cwd: VSCODE_DIR, stdio: 'inherit' });
  } catch (error) {
    console.error('\n⚠️  Merge conflicts detected!');
    console.error('   Please resolve conflicts manually and commit');
    console.error(`   Backup branch: ${backupBranch}`);
    process.exit(1);
  }

  // Re-apply Titan modifications
  console.log('\n🔧 Re-applying Titan AI modifications...');
  try {
    execSync('npx ts-node scripts/setup-fork.ts', { cwd: ROOT_DIR, stdio: 'inherit' });
  } catch (error) {
    console.error('⚠️  Failed to re-apply modifications');
    console.error('   You may need to run setup-fork.ts manually');
  }

  console.log('\n✅ Sync complete!');
  console.log(`   Updated from ${currentTag} to ${latestTag}`);
  console.log(`   Backup branch: ${backupBranch}`);
}

main().catch((error) => {
  console.error('\n❌ Sync failed:', error);
  process.exit(1);
});
