'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AnimatedCounter,
  HudButton,
  HudCard,
  HudGauge,
  HudHeader,
  PulsingDot,
} from '@/components/hud/HudStyles';

type ForgeStats = {
  distillation: {
    total_samples: number;
    high_value: number;
    exported: number;
    by_model: Record<string, number>;
    by_outcome: Record<string, number>;
  };
  harvest: {
    total: number;
    approved: number;
    migrated: number;
    rejected: number;
    pending: number;
    bySource: Record<string, number>;
  };
};

type Run = {
  id: string;
  created_at: string;
  base_model: string;
  method: 'qlora' | 'full' | 'dpo';
  samples_used: number;
  min_quality_score: number;
  status: 'running' | 'completed' | 'failed';
  model_path: string | null;
  metrics: {
    student_win_rate: number;
    avg_teacher_score: number;
    avg_student_score: number;
    score_ratio: number;
    total_evaluated: number;
  } | null;
};

export default function TrainingLabPanel() {
  const [stats, setStats] = useState<ForgeStats | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [format, setFormat] = useState<'sharegpt' | 'jsonl' | 'alpaca'>('sharegpt');
  const [minScore, setMinScore] = useState(7);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string>('');
  const [trainLoading, setTrainLoading] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [baseModel, setBaseModel] = useState('openai/gpt-oss-120b');
  const [method, setMethod] = useState<'qlora' | 'full' | 'dpo'>('qlora');
  const [epochs, setEpochs] = useState(3);
  const [lr, setLr] = useState(0.0002);
  const [batchSize, setBatchSize] = useState(4);
  const [loraRank, setLoraRank] = useState(32);
  const [selectedRunId, setSelectedRunId] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [statsRes, runsRes] = await Promise.all([
        fetch('/api/forge/stats', { cache: 'no-store' }),
        fetch('/api/forge/runs', { cache: 'no-store' }),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (runsRes.ok) setRuns((await runsRes.json()).runs || []);
    } catch {
      // best effort
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  const qualityBars = useMemo(() => {
    const total = Math.max(1, stats?.distillation.total_samples || 0);
    const high = stats?.distillation.high_value || 0;
    const exported = stats?.distillation.exported || 0;
    return [
      { label: 'High Value (7+)', value: high, pct: (high / total) * 100, color: 'bg-emerald-400' },
      { label: 'Exported', value: exported, pct: (exported / total) * 100, color: 'bg-cyan-400' },
      { label: 'Unexported', value: Math.max(0, total - exported), pct: ((total - exported) / total) * 100, color: 'bg-violet-400' },
    ];
  }, [stats]);

  const startExport = async () => {
    setExporting(true);
    setExportResult('');
    try {
      const res = await fetch('/api/forge/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, minScore, limit: 10000 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExportResult(`Export failed: ${data.error || res.statusText}`);
      } else {
        setExportResult(`Exported ${data.stats?.total_exported || 0} samples to ${data.outputPath}`);
      }
    } catch {
      setExportResult('Export failed due to network/server error.');
    } finally {
      setExporting(false);
      void refresh();
    }
  };

  const startTraining = async () => {
    setTrainLoading(true);
    try {
      const res = await fetch('/api/forge/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseModel,
          method,
          minQualityScore: minScore,
          config: {
            learning_rate: lr,
            num_epochs: epochs,
            micro_batch_size: batchSize,
            lora_r: loraRank,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedRunId(data.run?.id || '');
      }
    } finally {
      setTrainLoading(false);
      void refresh();
    }
  };

  const runEval = async () => {
    if (!selectedRunId) return;
    setEvalLoading(true);
    try {
      await fetch('/api/forge/eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: selectedRunId }),
      });
    } finally {
      setEvalLoading(false);
      void refresh();
    }
  };

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3 bg-[#090f1b] text-slate-100">
      <HudHeader
        title="LLM TRAINING LAB"
        subtitle="Distillation export, run management, and evaluation pipeline."
        right={<div className="flex items-center gap-2 text-[11px]"><PulsingDot tone="green" />LAB READY</div>}
      />

      <div className="grid grid-cols-3 gap-2">
        <AnimatedCounter label="Samples" value={stats?.distillation.total_samples || 0} />
        <AnimatedCounter label="High Value" value={stats?.distillation.high_value || 0} />
        <AnimatedCounter label="Exported" value={stats?.distillation.exported || 0} />
      </div>

      {(!stats || (stats.distillation.total_samples === 0 && runs.length === 0)) && (
        <HudCard title="Getting Started" tone="cyan">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/30 to-violet-500/30 border border-cyan-500/30 flex items-center justify-center text-[18px] flex-shrink-0">🧠</div>
              <div>
                <div className="text-[13px] text-white font-medium">No training data collected yet</div>
                <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">
                  Use Titan to chat and code — Forge automatically captures high-quality interactions from every protocol.
                  Once enough data accumulates, you can export datasets and run fine-tuning jobs right here.
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0b1120]/70 p-3 space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-cyan-300 font-semibold">How it works</div>
              <div className="flex items-start gap-2 text-[12px] text-slate-300">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-[10px] text-cyan-300 flex-shrink-0 mt-0.5">1</span>
                <span><strong className="text-white">Chat &amp; Code</strong> — Use any Titan protocol. Every interaction is recorded as a distillation sample.</span>
              </div>
              <div className="flex items-start gap-2 text-[12px] text-slate-300">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-[10px] text-cyan-300 flex-shrink-0 mt-0.5">2</span>
                <span><strong className="text-white">Quality Scoring</strong> — Samples are scored automatically. High-value samples (7+) are flagged for training.</span>
              </div>
              <div className="flex items-start gap-2 text-[12px] text-slate-300">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-[10px] text-cyan-300 flex-shrink-0 mt-0.5">3</span>
                <span><strong className="text-white">Export &amp; Train</strong> — Export datasets in ShareGPT/JSONL/Alpaca format, then launch QLoRA or full fine-tuning runs.</span>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 text-center">Start using Titan Chat or any protocol to begin collecting training data</div>
          </div>
        </HudCard>
      )}

      <HudCard title="Data Pipeline" tone="green">
        <div className="space-y-2">
          <HudGauge
            label="High-Quality Ratio"
            value={stats?.distillation.high_value || 0}
            max={Math.max(1, stats?.distillation.total_samples || 1)}
            tone="green"
          />
          <div className="space-y-1">
            {qualityBars.map((bar) => (
              <div key={bar.label}>
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span>{bar.label}</span>
                  <span>{bar.value}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-900/90 border border-white/10 overflow-hidden">
                  <div className={`h-full ${bar.color}`} style={{ width: `${bar.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-white/10 bg-[#0b1120]/70 p-2">
              <div className="text-[10px] uppercase text-slate-400 tracking-[0.14em]">By Model</div>
              {Object.entries(stats?.distillation.by_model || {}).slice(0, 5).map(([k, v]) => (
                <div key={k} className="text-[11px] text-slate-300 flex justify-between"><span>{k.split('/').pop()}</span><span>{v}</span></div>
              ))}
            </div>
            <div className="rounded-md border border-white/10 bg-[#0b1120]/70 p-2">
              <div className="text-[10px] uppercase text-slate-400 tracking-[0.14em]">Outcome Mix</div>
              {Object.entries(stats?.distillation.by_outcome || {}).slice(0, 5).map(([k, v]) => (
                <div key={k} className="text-[11px] text-slate-300 flex justify-between"><span>{k}</span><span>{v}</span></div>
              ))}
            </div>
          </div>
        </div>
      </HudCard>

      <HudCard title="Export Controls" tone="cyan">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[12px] text-slate-300">Format
            <select className="mt-1 w-full rounded bg-[#0b1120] border border-white/10 px-2 py-1" value={format} onChange={(e) => setFormat(e.target.value as 'sharegpt' | 'jsonl' | 'alpaca')}>
              <option value="sharegpt">ShareGPT</option>
              <option value="jsonl">JSONL</option>
              <option value="alpaca">Alpaca</option>
            </select>
          </label>
          <label className="text-[12px] text-slate-300">Min Quality: {minScore}
            <input className="mt-1 w-full" type="range" min={1} max={10} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
          </label>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <HudButton tone="cyan" onClick={() => void startExport()} disabled={exporting}>{exporting ? 'Exporting...' : 'Export Dataset'}</HudButton>
          <span className="text-[11px] text-slate-400">{exportResult || 'Ready to export training corpus'}</span>
        </div>
      </HudCard>

      <HudCard title="Training Run Manager" tone="purple">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[12px] text-slate-300">Method
            <select className="mt-1 w-full rounded bg-[#0b1120] border border-white/10 px-2 py-1" value={method} onChange={(e) => setMethod(e.target.value as 'qlora' | 'full' | 'dpo')}>
              <option value="qlora">QLoRA</option>
              <option value="full">Full Fine-tune</option>
              <option value="dpo">DPO</option>
            </select>
          </label>
          <label className="text-[12px] text-slate-300">Base Model
            <input className="mt-1 w-full rounded bg-[#0b1120] border border-white/10 px-2 py-1" value={baseModel} onChange={(e) => setBaseModel(e.target.value)} />
          </label>
          <label className="text-[12px] text-slate-300">Learning Rate
            <input className="mt-1 w-full rounded bg-[#0b1120] border border-white/10 px-2 py-1" type="number" step="0.0001" value={lr} onChange={(e) => setLr(Number(e.target.value))} />
          </label>
          <label className="text-[12px] text-slate-300">Epochs
            <input className="mt-1 w-full rounded bg-[#0b1120] border border-white/10 px-2 py-1" type="number" min={1} max={20} value={epochs} onChange={(e) => setEpochs(Number(e.target.value))} />
          </label>
          <label className="text-[12px] text-slate-300">Batch Size
            <input className="mt-1 w-full rounded bg-[#0b1120] border border-white/10 px-2 py-1" type="number" min={1} max={64} value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} />
          </label>
          <label className="text-[12px] text-slate-300">LoRA Rank
            <input className="mt-1 w-full rounded bg-[#0b1120] border border-white/10 px-2 py-1" type="number" min={4} max={256} value={loraRank} onChange={(e) => setLoraRank(Number(e.target.value))} />
          </label>
        </div>
        <div className="mt-2 flex gap-2">
          <HudButton tone="purple" onClick={() => void startTraining()} disabled={trainLoading}>{trainLoading ? 'Starting...' : 'Start Training'}</HudButton>
          <HudButton tone="green" onClick={() => void runEval()} disabled={!selectedRunId || evalLoading}>{evalLoading ? 'Running Eval...' : 'Run Evaluation'}</HudButton>
        </div>
      </HudCard>

      <HudCard title="Evaluation Dashboard" tone="amber">
        <div className="space-y-2">
          {runs.length === 0 ? <div className="text-[12px] text-slate-400">No training runs yet.</div> : null}
          {runs.slice(0, 12).map((run) => (
            <button
              key={run.id}
              onClick={() => setSelectedRunId(run.id)}
              className={`w-full text-left rounded-md border p-2 ${selectedRunId === run.id ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-white/10 bg-[#0b1120]/70'}`}
            >
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-slate-200">{run.id}</span>
                <span className={run.status === 'completed' ? 'text-emerald-300' : run.status === 'failed' ? 'text-red-300' : 'text-amber-300'}>{run.status}</span>
              </div>
              <div className="text-[11px] text-slate-400">{run.method} · {run.base_model}</div>
              {run.metrics && (
                <div className="text-[11px] text-slate-300 mt-1">
                  win {(run.metrics.student_win_rate * 100).toFixed(1)}% · ratio {run.metrics.score_ratio.toFixed(3)} · avg {run.metrics.avg_student_score.toFixed(2)}
                </div>
              )}
              {run.model_path ? <div className="text-[10px] text-cyan-300 mt-1">Model: {run.model_path}</div> : null}
            </button>
          ))}
        </div>
      </HudCard>
    </div>
  );
}
