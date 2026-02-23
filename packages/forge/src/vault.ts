// ── Titan Forge — Vault (Backup System) ──
// Exports all forge data to JSONL snapshots for permanent backup.
// Supports full and incremental exports with integrity hashing.

import { createHash } from 'crypto';
import { writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { ForgeDB } from './db.js';
import type { VaultSnapshot } from './types.js';

const db = new ForgeDB();
const MAX_SNAPSHOTS = 12;

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export class ForgeVault {
  private backupDir: string;

  constructor(backupDir?: string) {
    this.backupDir = backupDir || join(process.cwd(), 'packages', 'forge', 'backups');
  }

  async exportFullSnapshot(): Promise<VaultSnapshot> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotDir = join(this.backupDir, timestamp);
    ensureDir(snapshotDir);

    const client = (db as any); // access internal methods
    const supabase = this.getClient();

    const [samplesRes, harvestRes, runsRes, evalsRes] = await Promise.all([
      supabase.from('forge_samples').select('*').order('created_at', { ascending: true }),
      supabase.from('forge_harvest').select('*').order('created_at', { ascending: true }).then(
        (r: any) => r, () => ({ data: [], error: null })
      ),
      supabase.from('forge_runs').select('*').order('created_at', { ascending: true }),
      supabase.from('forge_evals').select('*').order('created_at', { ascending: true }),
    ]);

    const samples = samplesRes.data || [];
    const harvest = harvestRes.data || [];
    const runs = runsRes.data || [];
    const evals = evalsRes.data || [];

    const samplesJsonl = samples.map((r: any) => JSON.stringify(r)).join('\n');
    const harvestJsonl = harvest.map((r: any) => JSON.stringify(r)).join('\n');
    const runsJsonl = runs.map((r: any) => JSON.stringify(r)).join('\n');
    const evalsJsonl = evals.map((r: any) => JSON.stringify(r)).join('\n');

    const allData = [samplesJsonl, harvestJsonl, runsJsonl, evalsJsonl].join('\n');
    const hash = sha256(allData);

    if (samplesJsonl) writeFileSync(join(snapshotDir, 'forge_samples.jsonl'), samplesJsonl, 'utf-8');
    if (harvestJsonl) writeFileSync(join(snapshotDir, 'forge_harvest.jsonl'), harvestJsonl, 'utf-8');
    if (runsJsonl) writeFileSync(join(snapshotDir, 'forge_runs.jsonl'), runsJsonl, 'utf-8');
    if (evalsJsonl) writeFileSync(join(snapshotDir, 'forge_evals.jsonl'), evalsJsonl, 'utf-8');

    const manifest: VaultSnapshot = {
      timestamp,
      samples_count: samples.length,
      harvest_count: harvest.length,
      runs_count: runs.length,
      evals_count: evals.length,
      sha256: hash,
      size_bytes: Buffer.byteLength(allData, 'utf-8'),
    };

    writeFileSync(join(snapshotDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

    this.rotateSnapshots();

    console.log(`[forge/vault] Full snapshot → ${snapshotDir}`);
    console.log(`[forge/vault] ${samples.length} samples, ${harvest.length} harvest, ${runs.length} runs, ${evals.length} evals`);
    console.log(`[forge/vault] SHA256: ${hash}`);

    return manifest;
  }

  private rotateSnapshots(): void {
    if (!existsSync(this.backupDir)) return;
    const dirs = readdirSync(this.backupDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();

    while (dirs.length > MAX_SNAPSHOTS) {
      const oldest = dirs.shift()!;
      const oldPath = join(this.backupDir, oldest);
      try {
        const files = readdirSync(oldPath);
        for (const f of files) unlinkSync(join(oldPath, f));
        require('fs').rmdirSync(oldPath);
        console.log(`[forge/vault] Rotated old snapshot: ${oldest}`);
      } catch {
        // best effort
      }
    }
  }

  listSnapshots(): VaultSnapshot[] {
    if (!existsSync(this.backupDir)) return [];
    const dirs = readdirSync(this.backupDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort()
      .reverse();

    const snapshots: VaultSnapshot[] = [];
    for (const dir of dirs) {
      const manifestPath = join(this.backupDir, dir, 'manifest.json');
      if (existsSync(manifestPath)) {
        try {
          const data = require('fs').readFileSync(manifestPath, 'utf-8');
          snapshots.push(JSON.parse(data));
        } catch {
          // skip corrupt manifests
        }
      }
    }
    return snapshots;
  }

  private getClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('[forge/vault] Missing Supabase credentials');
    const { createClient } = require('@supabase/supabase-js');
    return createClient(url, key, { auth: { persistSession: false } });
  }
}
