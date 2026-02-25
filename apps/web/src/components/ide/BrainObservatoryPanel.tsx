'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatedCounter,
  HudButton,
  HudCard,
  HudGauge,
  HudHeader,
  HudTerminal,
  PulsingDot,
} from '@/components/hud/HudStyles';

type Sample = {
  id: string;
  created_at: string;
  model_id: string;
  quality_score: number;
  outcome: string;
  response: string;
  messages: Array<{ role: string; content: string | null }>;
  quality_signals?: Record<string, unknown> | null;
  exported?: boolean;
};

export default function BrainObservatoryPanel() {
  const [stats, setStats] = useState<any>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Sample | null>(null);
  const [source, setSource] = useState('all');
  const [topic, setTopic] = useState('');
  const [limit, setLimit] = useState(20);
  const [harvestState, setHarvestState] = useState('Idle');
  const [feedLines, setFeedLines] = useState<Array<{ ts: string; text: string; level?: 'info' | 'warn' | 'error' | 'success' }>>([]);
  const [destination, setDestination] = useState('local');
  const [prepareStatus, setPrepareStatus] = useState('');
  const feedRef = useRef<EventSource | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [statsRes, sampleRes] = await Promise.all([
        fetch('/api/forge/stats', { cache: 'no-store' }),
        fetch(`/api/forge/samples?page=${page}&limit=20`, { cache: 'no-store' }),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (sampleRes.ok) {
        const body = await sampleRes.json();
        setSamples(Array.isArray(body.samples) ? body.samples : []);
      }
    } catch {
      // best effort
    }
  }, [page]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.close();
      feedRef.current = null;
    }
    const source = new EventSource('/api/forge/feed');
    feedRef.current = source;
    const stamp = () => new Date().toLocaleTimeString();

    source.addEventListener('sample', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { model_id?: string; quality_score?: number; outcome?: string };
      const quality = Number(payload.quality_score || 0);
      setFeedLines((prev) => [
        ...prev.slice(-59),
        {
          ts: stamp(),
          text: `${payload.model_id || 'unknown'} · q${quality} · ${payload.outcome || 'unknown'}`,
          level: quality >= 7 ? 'success' : quality >= 4 ? 'warn' : 'error',
        },
      ]);
      void loadData();
    });
    source.addEventListener('heartbeat', () => {
      setFeedLines((prev) => [...prev.slice(-59), { ts: stamp(), text: 'Neural pulse', level: 'info' }]);
    });
    source.onerror = () => {
      setFeedLines((prev) => [...prev.slice(-59), { ts: stamp(), text: 'Feed reconnecting...', level: 'warn' }]);
    };

    return () => source.close();
  }, [loadData]);

  const readinessCount = useMemo(
    () => samples.filter((s) => !s.exported && Number(s.quality_score) >= 7).length,
    [samples],
  );

  const startHarvest = async () => {
    setHarvestState('Harvesting...');
    try {
      await fetch('/api/forge/harvest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, topic: topic || 'all', limit }),
      });
      setHarvestState('Harvest complete');
      await loadData();
    } catch {
      setHarvestState('Harvest failed');
    }
  };

  const bulkApprove = async () => {
    const ids = samples.filter((s) => s.quality_score >= 7).map((s) => s.id);
    if (ids.length === 0) return;
    await fetch('/api/forge/samples/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, target: 'samples' }),
    });
    await loadData();
  };

  const bulkRejectLow = async () => {
    const ids = samples.filter((s) => s.quality_score < 4).map((s) => s.id);
    if (ids.length === 0) return;
    await fetch('/api/forge/samples/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, target: 'samples' }),
    });
    await loadData();
  };

  const approveSelected = async () => {
    if (!selected) return;
    await fetch('/api/forge/samples/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [selected.id], target: 'samples' }),
    });
    await loadData();
  };

  const rejectSelected = async () => {
    if (!selected) return;
    await fetch('/api/forge/samples/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [selected.id], target: 'samples' }),
    });
    await loadData();
  };

  const prepareTrainingData = async () => {
    setPrepareStatus('Preparing...');
    try {
      const res = await fetch('/api/forge/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'jsonl', minScore: 7, limit: 10000, destination }),
      });
      const data = await res.json();
      setPrepareStatus(res.ok ? `Prepared: ${data.outputPath}` : `Failed: ${data.error || 'unknown error'}`);
      await loadData();
    } catch {
      setPrepareStatus('Failed: network/server error');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3 bg-[#090f1b] text-slate-100">
      <HudHeader
        title="TITAN BRAIN OBSERVATORY"
        subtitle="Real-time telemetry for ingestion, quality, and training readiness."
        right={<div className="flex items-center gap-2 text-[11px]"><PulsingDot tone="cyan" />LIVE FEED</div>}
      />

      <div className="grid grid-cols-3 gap-2">
        <AnimatedCounter label="Knowledge Base" value={(stats?.distillation?.total_samples || 0) + (stats?.harvest?.total || 0)} />
        <AnimatedCounter label="High Quality" value={stats?.distillation?.high_value || 0} />
        <AnimatedCounter label="Ready To Train" value={readinessCount} />
      </div>

      {(!stats || ((stats?.distillation?.total_samples || 0) === 0 && (stats?.harvest?.total || 0) === 0)) && (
        <div className="rounded-xl border border-cyan-500/40 bg-[#0d1322]/85 backdrop-blur-sm shadow-[0_0_24px_rgba(34,211,238,0.12)]">
          <div className="border-b border-white/10 px-3 py-2"><h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Welcome to Brain Observatory</h3></div>
          <div className="p-3 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/30 to-cyan-500/30 border border-violet-500/30 flex items-center justify-center text-[18px] flex-shrink-0">🔬</div>
              <div>
                <div className="text-[13px] text-white font-medium">Titan&apos;s brain is empty</div>
                <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">
                  This is where you watch data flow into Titan&apos;s neural core. Start a harvest to scrape knowledge from GitHub, StackOverflow, and HuggingFace datasets — or simply use Titan to generate training data organically.
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0b1120]/70 p-3 space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-violet-300 font-semibold">Quick Start</div>
              <div className="flex items-start gap-2 text-[12px] text-slate-300">
                <span className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-[10px] text-violet-300 flex-shrink-0 mt-0.5">1</span>
                <span><strong className="text-white">Harvest</strong> — Use the Harvest Control Center below to scrape data from external sources.</span>
              </div>
              <div className="flex items-start gap-2 text-[12px] text-slate-300">
                <span className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-[10px] text-violet-300 flex-shrink-0 mt-0.5">2</span>
                <span><strong className="text-white">Review</strong> — Approve or reject samples in the Data Quality Inspector. High-quality samples feed the training pipeline.</span>
              </div>
              <div className="flex items-start gap-2 text-[12px] text-slate-300">
                <span className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-[10px] text-violet-300 flex-shrink-0 mt-0.5">3</span>
                <span><strong className="text-white">Train</strong> — When ready, prepare datasets and push them to the Training Lab for fine-tuning.</span>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 text-center">Use the Harvest Control Center below to begin feeding Titan&apos;s brain</div>
          </div>
        </div>
      )}

      <HudCard title="Live Data Feed" tone="cyan">
        <div className="space-y-2">
          <HudTerminal title="Neuron Stream" lines={feedLines} />
          <HudGauge label="Storage Utilization (est.)" value={Math.min(100, Math.round(((stats?.distillation?.total_samples || 0) / 100000) * 100))} tone="purple" />
        </div>
      </HudCard>

      <HudCard title="Brain Health Dashboard" tone="green">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-white/10 bg-[#0b1120]/70 p-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Source Radar</div>
            {Object.entries(stats?.harvest?.bySource || {}).slice(0, 6).map(([key, value]) => (
              <div key={key} className="text-[11px] text-slate-300 flex justify-between"><span>{key}</span><span>{String(value)}</span></div>
            ))}
          </div>
          <div className="rounded-md border border-white/10 bg-[#0b1120]/70 p-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Quality Histogram</div>
            <div className="space-y-1 mt-1">
              <HudGauge label="Q7-10" value={stats?.distillation?.high_value || 0} max={Math.max(1, stats?.distillation?.total_samples || 1)} tone="green" />
              <HudGauge label="Exported" value={stats?.distillation?.exported || 0} max={Math.max(1, stats?.distillation?.total_samples || 1)} tone="cyan" />
            </div>
          </div>
        </div>
      </HudCard>

      <HudCard title="Harvest Control Center" tone="amber">
        <div className="grid grid-cols-3 gap-2">
          <label className="text-[12px] text-slate-300">Source
            <select className="mt-1 w-full rounded bg-[#0b1120] border border-white/10 px-2 py-1" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="all">All</option>
              <option value="github">GitHub</option>
              <option value="stackoverflow">StackOverflow</option>
              <option value="dataset">HuggingFace Datasets</option>
              <option value="docs">Docs</option>
            </select>
          </label>
          <label className="text-[12px] text-slate-300">Topic
            <input className="mt-1 w-full rounded bg-[#0b1120] border border-white/10 px-2 py-1" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </label>
          <label className="text-[12px] text-slate-300">Limit: {limit}
            <input className="mt-1 w-full" type="range" min={5} max={100} step={5} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
          </label>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <HudButton tone="amber" onClick={() => void startHarvest()}>Start Harvest</HudButton>
          <span className="text-[11px] text-slate-400">{harvestState}</span>
        </div>
      </HudCard>

      <HudCard title="Data Quality Inspector" tone="purple">
        <div className="space-y-2">
          <div className="flex gap-2">
            <HudButton tone="green" onClick={() => void bulkApprove()}>Approve High-Quality</HudButton>
            <HudButton tone="red" onClick={() => void bulkRejectLow()}>Reject Low-Quality</HudButton>
          </div>
          <div className="space-y-1">
            {samples.map((sample) => (
              <button
                key={sample.id}
                onClick={() => setSelected(sample)}
                className={`w-full text-left rounded-md border p-2 ${selected?.id === sample.id ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-white/10 bg-[#0b1120]/70'}`}
              >
                <div className="text-[12px] text-slate-200 flex justify-between">
                  <span>{sample.model_id.split('/').pop()}</span>
                  <span className={sample.quality_score >= 7 ? 'text-emerald-300' : sample.quality_score >= 4 ? 'text-amber-300' : 'text-red-300'}>Q{sample.quality_score}</span>
                </div>
                <div className="text-[11px] text-slate-400">{sample.outcome} · {new Date(sample.created_at).toLocaleString()}</div>
              </button>
            ))}
          </div>
          {selected && (
            <div className="rounded-md border border-white/10 bg-[#0b1120]/70 p-2">
              <div className="text-[12px] text-cyan-200">Sample {selected.id}</div>
              <div className="text-[11px] text-slate-300 mt-1 whitespace-pre-wrap max-h-40 overflow-auto">{selected.response}</div>
              <div className="mt-2 flex gap-2">
                <HudButton tone="green" onClick={() => void approveSelected()}>Approve</HudButton>
                <HudButton tone="red" onClick={() => void rejectSelected()}>Reject</HudButton>
              </div>
            </div>
          )}
        </div>
      </HudCard>

      <HudCard title="Training Readiness" tone="green">
        <div className="space-y-2">
          <HudGauge label="Ready Ratio" value={readinessCount} max={Math.max(1, samples.length)} tone="green" />
          <label className="text-[12px] text-slate-300">Destination
            <select className="mt-1 w-full rounded bg-[#0b1120] border border-white/10 px-2 py-1" value={destination} onChange={(e) => setDestination(e.target.value)}>
              <option value="local">Local</option>
              <option value="s3">S3</option>
              <option value="huggingface">HuggingFace Hub</option>
            </select>
          </label>
          <div className="flex items-center gap-2">
            <HudButton tone="green" onClick={() => void prepareTrainingData()}>Prepare Training Data</HudButton>
            <span className="text-[11px] text-slate-400">{prepareStatus || 'Ready'}</span>
          </div>
        </div>
      </HudCard>

      <div className="flex items-center justify-between">
        <HudButton tone="neutral" onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</HudButton>
        <span className="text-[12px] text-slate-300">Page {page}</span>
        <HudButton tone="neutral" onClick={() => setPage((p) => p + 1)}>Next</HudButton>
      </div>
    </div>
  );
}
