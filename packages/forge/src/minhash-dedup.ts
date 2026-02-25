// ── Titan Forge — MinHash Near-Deduplication ──
// Locality-Sensitive Hashing for catching near-duplicate content that
// exact SHA-256 misses. Inspired by BigCode/StarCoder's dedup approach.
// Uses character n-gram shingling + MinHash signatures + banded LSH.

import { createHash } from 'crypto';

const NUM_HASHES = 128;
const SHINGLE_SIZE = 5;
const BAND_SIZE = 8;
const NUM_BANDS = NUM_HASHES / BAND_SIZE; // 16 bands
const SIMILARITY_THRESHOLD = 0.7;

function hashShingle(shingle: string, seed: number): number {
  const h = createHash('md5')
    .update(`${seed}:${shingle}`)
    .digest();
  return h.readUInt32LE(0);
}

function getShingles(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const shingles = new Set<string>();
  for (let i = 0; i <= normalized.length - SHINGLE_SIZE; i++) {
    shingles.add(normalized.slice(i, i + SHINGLE_SIZE));
  }
  return shingles;
}

function computeMinHashSignature(shingles: Set<string>): Uint32Array {
  const sig = new Uint32Array(NUM_HASHES);
  sig.fill(0xFFFFFFFF);

  for (const shingle of shingles) {
    for (let i = 0; i < NUM_HASHES; i++) {
      const h = hashShingle(shingle, i);
      if (h < sig[i]) {
        sig[i] = h;
      }
    }
  }

  return sig;
}

function bandHash(sig: Uint32Array, bandIdx: number): string {
  const start = bandIdx * BAND_SIZE;
  const band = sig.slice(start, start + BAND_SIZE);
  return createHash('md5')
    .update(Buffer.from(band.buffer, band.byteOffset, band.byteLength))
    .digest('hex');
}

function estimateJaccard(a: Uint32Array, b: Uint32Array): number {
  let matches = 0;
  for (let i = 0; i < NUM_HASHES; i++) {
    if (a[i] === b[i]) matches++;
  }
  return matches / NUM_HASHES;
}

export class MinHashIndex {
  private bands: Map<string, number[]>[] = [];
  private signatures: Uint32Array[] = [];
  private texts: string[] = [];

  constructor() {
    this.bands = Array.from({ length: NUM_BANDS }, () => new Map());
  }

  add(text: string, idx: number): void {
    const shingles = getShingles(text);
    if (shingles.size === 0) return;

    const sig = computeMinHashSignature(shingles);
    this.signatures[idx] = sig;
    this.texts[idx] = text;

    for (let b = 0; b < NUM_BANDS; b++) {
      const key = bandHash(sig, b);
      const bucket = this.bands[b].get(key);
      if (bucket) {
        bucket.push(idx);
      } else {
        this.bands[b].set(key, [idx]);
      }
    }
  }

  findDuplicates(text: string, idx: number): number[] {
    const shingles = getShingles(text);
    if (shingles.size === 0) return [];

    const sig = computeMinHashSignature(shingles);
    const candidates = new Set<number>();

    for (let b = 0; b < NUM_BANDS; b++) {
      const key = bandHash(sig, b);
      const bucket = this.bands[b].get(key);
      if (bucket) {
        for (const other of bucket) {
          if (other !== idx) candidates.add(other);
        }
      }
    }

    const duplicates: number[] = [];
    for (const cand of candidates) {
      if (this.signatures[cand]) {
        const sim = estimateJaccard(sig, this.signatures[cand]);
        if (sim >= SIMILARITY_THRESHOLD) {
          duplicates.push(cand);
        }
      }
    }

    return duplicates;
  }

  get size(): number {
    return this.texts.filter(Boolean).length;
  }
}

export interface DedupResult<T> {
  unique: T[];
  duplicates: number;
  totalChecked: number;
}

export function minHashDedup<T extends { instruction: string }>(
  items: T[],
): DedupResult<T> {
  const index = new MinHashIndex();
  const unique: T[] = [];
  let duplicates = 0;

  for (let i = 0; i < items.length; i++) {
    const text = items[i].instruction;
    const dups = index.findDuplicates(text, i);

    if (dups.length > 0) {
      duplicates++;
      continue;
    }

    index.add(text, i);
    unique.push(items[i]);
  }

  console.log(`[minhash-dedup] ${items.length} → ${unique.length} (${duplicates} near-duplicates removed)`);

  return { unique, duplicates, totalChecked: items.length };
}
