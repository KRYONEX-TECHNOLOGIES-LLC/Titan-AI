#!/usr/bin/env node
// ── Titan Forge — Backup CLI ──
// Usage:
//   pnpm --filter @titan/forge run backup
//   pnpm --filter @titan/forge run backup -- --list

import { ForgeVault } from '../vault.js';

const args = process.argv.slice(2);

async function main() {
  const vault = new ForgeVault();

  if (args.includes('--list')) {
    const snapshots = vault.listSnapshots();
    if (snapshots.length === 0) {
      console.log('No backups found.');
      return;
    }
    console.log(`\n=== ${snapshots.length} Forge Vault Snapshots ===\n`);
    for (const snap of snapshots) {
      const sizeMB = (snap.size_bytes / 1024 / 1024).toFixed(2);
      console.log(`${snap.timestamp}`);
      console.log(`  Samples: ${snap.samples_count} | Harvest: ${snap.harvest_count} | Runs: ${snap.runs_count} | Evals: ${snap.evals_count}`);
      console.log(`  Size: ${sizeMB} MB | SHA256: ${snap.sha256.slice(0, 16)}...`);
      console.log('');
    }
    return;
  }

  console.log('\n=== Forge Vault — Full Backup ===\n');
  const manifest = await vault.exportFullSnapshot();

  console.log('\nBackup complete!');
  console.log(`  Samples:  ${manifest.samples_count}`);
  console.log(`  Harvest:  ${manifest.harvest_count}`);
  console.log(`  Runs:     ${manifest.runs_count}`);
  console.log(`  Evals:    ${manifest.evals_count}`);
  console.log(`  Size:     ${(manifest.size_bytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  SHA256:   ${manifest.sha256}`);
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
