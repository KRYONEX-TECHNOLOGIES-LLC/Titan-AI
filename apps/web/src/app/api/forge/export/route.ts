import { NextRequest, NextResponse } from 'next/server';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ForgeExporter, ForgeDB } from '@titan/forge';

type ExportFormat = 'sharegpt' | 'jsonl' | 'alpaca';

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const format = String(body.format || 'sharegpt') as ExportFormat;
    const minScore = Number(body.minScore || 7);
    const limit = Number(body.limit || 10000);
    const destination = String(body.destination || 'local');

    const outDir = join(process.cwd(), '.titan', 'forge', 'exports');
    ensureDir(outDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'alpaca') {
      const db = new ForgeDB();
      const samples = await db.getSamplesForExport(minScore, limit);
      const alpaca = samples.map((s: any) => {
        const prompt = (s.messages || []).filter((m: any) => m.role === 'user').map((m: any) => m.content || '').join('\n\n').trim();
        return {
          instruction: prompt,
          input: '',
          output: s.response || '',
        };
      });
      const outputPath = join(outDir, `forge-export-${stamp}.alpaca.json`);
      writeFileSync(outputPath, JSON.stringify(alpaca, null, 2), 'utf-8');
      await db.markExported(samples.map((s: any) => s.id));
      return NextResponse.json({
        success: true,
        format,
        destination,
        outputPath,
        stats: { total_exported: alpaca.length },
      });
    }

    const exporter = new ForgeExporter();
    const outputPath = join(outDir, `forge-export-${stamp}.${format === 'jsonl' ? 'jsonl' : 'json'}`);
    const stats = format === 'jsonl'
      ? await exporter.exportToJSONL(outputPath, { minScore, limit, markExported: true })
      : await exporter.exportToShareGPT(outputPath, { minScore, limit, markExported: true });

    return NextResponse.json({
      success: true,
      format,
      destination,
      outputPath,
      stats,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Export failed' },
      { status: 500 },
    );
  }
}
