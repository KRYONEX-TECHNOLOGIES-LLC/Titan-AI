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
  const [limit, setLimit] = useState(100);
  const [harvestState, setHarvestState] = useState<'idle' | 'running' | 'error' | 'complete'>('idle');
  const [harvestMessage, setHarvestMessage] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const harvestAbortRef = useRef<AbortController | null>(null);
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
    const interval = setInterval(() => void loadData(), 10000);
    return () => clearInterval(interval);
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

  const readinessCount = useMemo(() => {
    const totalHighValue = stats?.distillation?.high_value || 0;
    const totalExported = stats?.distillation?.exported || 0;
    return Math.max(0, totalHighValue - totalExported);
  }, [stats]);

  const startHarvest = async () => {
    const abort = new AbortController();
    harvestAbortRef.current = abort;
    setHarvestState('running');
    setHarvestMessage('Launching 100 parallel workers across all sources...');
    try {
      const res = await fetch('/api/forge/harvest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          topic: topic || 'all',
          limit,
          parallel: true,
          workerCount: 100,
        }),
        signal: abort.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        setHarvestState('error');
        setHarvestMessage(data?.error || res.statusText);
        return;
      }
      const parts = [`${data.saved || 0} saved`];
      if (data.evolved) parts.push(`${data.evolved} evolved`);
      if (data.near_duplicates) parts.push(`${data.near_duplicates} near-dups removed`);
      if (data.elapsed) parts.push(`${data.elapsed}s`);
      setHarvestState('complete');
      setHarvestMessage(parts.join(' · '));
      await loadData();
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        setHarvestState('idle');
        setHarvestMessage('Harvest stopped.');
      } else {
        setHarvestState('error');
        setHarvestMessage(err instanceof Error ? err.message : 'network error');
      }
    }
  };

  const stopHarvest = () => {
    harvestAbortRef.current?.abort();
    harvestAbortRef.current = null;
    setHarvestState('idle');
    setHarvestMessage('Harvest stopped.');
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
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            {harvestState === 'running' ? (
              <button
                onClick={stopHarvest}
                className="flex-1 py-2.5 rounded-lg bg-red-600/90 hover:bg-red-500 text-white text-[13px] font-semibold tracking-wide transition-all flex items-center justify-center gap-2"
              >
                <span className="w-2 h-2 rounded-sm bg-white" />
                Stop Harvest
              </button>
            ) : (
              <button
                onClick={() => void startHarvest()}
                className="flex-1 py-2.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-[13px] font-semibold tracking-wide transition-all animate-pulse hover:animate-none flex items-center justify-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21" /></svg>
                Start Harvest (100 Workers)
              </button>
            )}
          </div>
          {harvestMessage && (
            <div className={`text-[11px] px-2 py-1.5 rounded ${harvestState === 'error' ? 'bg-red-500/15 text-red-300' : harvestState === 'running' ? 'bg-amber-500/15 text-amber-300' : harvestState === 'complete' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400'}`}>
              {harvestState === 'running' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse mr-1.5" />}
              {harvestMessage}
            </div>
          )}
          <div className="text-[10px] text-slate-500 flex items-center justify-between">
            <span>100 parallel workers | All sources | Topic rotation</span>
            <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-cyan-400/70 hover:text-cyan-300 underline">
              {showAdvanced ? 'Hide' : 'Advanced'}
            </button>
          </div>
          {showAdvanced && (
            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/5">
              <label className="text-[11px] text-slate-400">Source
                <select className="mt-1 w-full rounded bg-[#0b1120] border border-white/10 px-2 py-1 text-[11px]" value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="all">All (16 sources)</option>
                  <option value="github">GitHub</option>
                  <option value="stackoverflow">StackOverflow</option>
                  <option value="dataset">HuggingFace Datasets</option>
                  <option value="docs">Docs</option>
                  <option value="github-issues">GitHub Issues+PRs</option>
                  <option value="arxiv">ArXiv CS Papers</option>
                  <option value="gitlab">GitLab Repos</option>
                  <option value="npm-docs">npm/PyPI Docs</option>
                  <option value="competitive">Competitive Programming</option>
                </select>
              </label>
              <label className="text-[11px] text-slate-400">Topic
                <input className="mt-1 w-full rounded bg-[#0b1120] border border-white/10 px-2 py-1 text-[11px]" value={topic} onChange={(e) => setTopic(e.target.value)} />
              </label>
              <label className="text-[11px] text-slate-400">Limit: {limit}
                <input className="mt-1 w-full" type="range" min={5} max={500} step={5} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
              </label>
            </div>
          )}
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
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="rounded-md border border-white/10 bg-[#0b1120]/70 p-2 text-center">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Phase 1</div>
              <div className="text-[14px] font-bold text-emerald-300">{Math.min(100, Math.round(((stats?.harvest?.total || 0) / 10000) * 100))}%</div>
              <div className="text-[10px] text-slate-500">10K target</div>
            </div>
            <div className="rounded-md border border-white/10 bg-[#0b1120]/70 p-2 text-center">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Phase 2</div>
              <div className="text-[14px] font-bold text-cyan-300">{Math.min(100, Math.round(((stats?.harvest?.total || 0) / 50000) * 100))}%</div>
              <div className="text-[10px] text-slate-500">50K target</div>
            </div>
            <div className="rounded-md border border-white/10 bg-[#0b1120]/70 p-2 text-center">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Phase 3</div>
              <div className="text-[14px] font-bold text-violet-300">{Math.min(100, Math.round(((stats?.harvest?.total || 0) / 150000) * 100))}%</div>
              <div className="text-[10px] text-slate-500">150K target</div>
            </div>
          </div>
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
