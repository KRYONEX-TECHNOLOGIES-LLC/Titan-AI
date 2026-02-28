'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useAlfredCanvas, type AgentInfo } from '@/stores/alfred-canvas-store';

type FilterTab = 'all' | 'running' | 'completed' | 'failed';

interface LiveMetric {
  id: string;
  label: string;
  value: string | number;
  change?: number;
  color: string;
  icon: 'chart' | 'bolt' | 'clock' | 'dollar' | 'cpu' | 'task';
}

function useSystemMetrics() {
  const { stats, agents, workflows } = useAlfredCanvas();
  const [uptime, setUptime] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setUptime(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const metrics: LiveMetric[] = [
    { id: 'tasks', label: 'Total Tasks', value: stats.totalTasks, color: '#22d3ee', icon: 'task' },
    { id: 'completed', label: 'Completed', value: stats.completedTasks, color: '#22c55e', icon: 'chart' },
    { id: 'success', label: 'Success Rate', value: `${stats.successRate}%`, color: stats.successRate >= 90 ? '#22c55e' : stats.successRate >= 70 ? '#f59e0b' : '#ef4444', icon: 'bolt' },
    { id: 'agents', label: 'Active Agents', value: stats.activeAgents, color: '#a78bfa', icon: 'cpu' },
    { id: 'cost', label: 'Total Cost', value: `$${stats.totalCost.toFixed(4)}`, color: '#f59e0b', icon: 'dollar' },
    { id: 'uptime', label: 'Session', value: formatUptime(uptime), color: '#6366f1', icon: 'clock' },
    { id: 'workflows', label: 'Workflows', value: workflows.length, color: '#ec4899', icon: 'chart' },
    { id: 'agents-total', label: 'Total Agents', value: agents.length, color: '#14b8a6', icon: 'cpu' },
  ];

  return metrics;
}

function MetricIcon({ icon }: { icon: LiveMetric['icon'] }) {
  const props = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 };
  switch (icon) {
    case 'chart':
      return <svg {...props}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>;
    case 'bolt':
      return <svg {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
    case 'clock':
      return <svg {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    case 'dollar':
      return <svg {...props}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>;
    case 'cpu':
      return <svg {...props}><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" /></svg>;
    case 'task':
      return <svg {...props}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
  }
}

export function DashboardView() {
  const { stats, workflows, agents, removeAgent, updateAgent } = useAlfredCanvas();
  const [filter, setFilter] = useState<FilterTab>('all');
  const metrics = useSystemMetrics();

  const filtered = useMemo(() => {
    if (filter === 'all') return agents;
    return agents.filter((a) => a.status === filter);
  }, [agents, filter]);

  const counts = useMemo(() => {
    const running = agents.filter((a) => a.status === 'running').length;
    const completed = agents.filter((a) => a.status === 'completed').length;
    const failed = agents.filter((a) => a.status === 'failed').length;
    return { total: agents.length, running, completed, failed };
  }, [agents]);

  const handleKill = (id: string) => {
    updateAgent(id, { status: 'failed', completedAt: Date.now(), output: 'Killed by user' });
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-y-auto">
      <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <div>
          <h2 className="text-[14px] font-semibold text-white">Alfred Command Center</h2>
          <p className="text-[10px] text-[#666]">Live metrics, agents, workflows &amp; tracking</p>
        </div>
      </div>

      {/* Live Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-3">
        {metrics.map((m) => (
          <div key={m.id} className="bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-2.5 flex items-center gap-2.5 hover:border-[#3a3a3a] transition-colors">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${m.color}15`, color: m.color }}>
              <MetricIcon icon={m.icon} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold text-white truncate">{m.value}</div>
              <div className="text-[9px] text-[#666] uppercase tracking-wider">{m.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-4 py-1">
        {(['all', 'running', 'completed', 'failed'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1 text-[10px] font-medium rounded-full transition-colors ${
              filter === tab
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                : 'text-[#666] hover:text-[#999] border border-transparent'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'all' ? ` (${counts.total})` :
             tab === 'running' ? ` (${counts.running})` :
             tab === 'completed' ? ` (${counts.completed})` :
             ` (${counts.failed})`}
          </button>
        ))}
      </div>

      {/* Agent grid */}
      <div className="px-4 py-2">
        <h3 className="text-[11px] font-medium text-[#999] uppercase tracking-wider mb-2">Agents</h3>
        {filtered.length === 0 ? (
          <div className="text-[10px] text-[#555] text-center py-8">
            {filter === 'all' ? 'No agents spawned yet' : `No ${filter} agents`}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {filtered.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onKill={handleKill} onRemove={removeAgent} />
            ))}
          </div>
        )}
      </div>

      {/* Active workflows */}
      <div className="px-4 py-2 flex-1">
        <h3 className="text-[11px] font-medium text-[#999] uppercase tracking-wider mb-2">Workflows</h3>
        {workflows.length === 0 ? (
          <div className="text-[10px] text-[#555] text-center py-8">No active workflows</div>
        ) : (
          <div className="space-y-1.5">
            {workflows.map((wf) => (
              <div key={wf.id} className="flex items-center gap-2 py-2 px-3 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a]">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  wf.status === 'running' ? 'bg-green-500 animate-pulse' :
                  wf.status === 'complete' ? 'bg-blue-500' :
                  wf.status === 'failed' ? 'bg-red-500' : 'bg-[#555]'
                }`} />
                <span className="text-[11px] text-[#ccc] flex-1 truncate">{wf.name}</span>
                {wf.platform && <span className="text-[9px] text-[#555] px-1.5 py-0.5 bg-[#2a2a2a] rounded">{wf.platform}</span>}
                <div className="w-[80px] h-[4px] bg-[#2a2a2a] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      wf.status === 'failed' ? 'bg-red-500' : wf.status === 'complete' ? 'bg-blue-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${wf.progress}%` }}
                  />
                </div>
                <span className="text-[9px] text-[#666] w-[30px] text-right">{wf.progress}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  onKill,
  onRemove,
}: {
  agent: AgentInfo;
  onKill: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const elapsed = (agent.completedAt || Date.now()) - agent.startedAt;
  const elapsedStr = elapsed < 60_000
    ? `${Math.round(elapsed / 1000)}s`
    : `${Math.floor(elapsed / 60_000)}m ${Math.round((elapsed % 60_000) / 1000)}s`;

  const statusConfig: Record<AgentInfo['status'], { dot: string; badge: string; label: string }> = {
    running:   { dot: 'bg-green-500 animate-pulse', badge: 'bg-green-500/20 text-green-400 border-green-500/40', label: 'Running' },
    completed: { dot: 'bg-blue-500',                badge: 'bg-blue-500/20 text-blue-400 border-blue-500/40',   label: 'Completed' },
    failed:    { dot: 'bg-red-500',                  badge: 'bg-red-500/20 text-red-400 border-red-500/40',     label: 'Failed' },
    paused:    { dot: 'bg-yellow-500',               badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40', label: 'Paused' },
  };

  const cfg = statusConfig[agent.status];

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
        <span className="text-[12px] font-medium text-white flex-1 truncate">{agent.name}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${cfg.badge}`}>{cfg.label}</span>
      </div>

      <p className="text-[10px] text-[#888] leading-tight line-clamp-2">{agent.task}</p>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-[5px] bg-[#2a2a2a] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              agent.status === 'failed' ? 'bg-red-500' :
              agent.status === 'completed' ? 'bg-blue-500' : 'bg-cyan-500'
            }`}
            style={{ width: `${agent.progress}%` }}
          />
        </div>
        <span className="text-[9px] text-[#666] w-[32px] text-right">{agent.progress}%</span>
      </div>

      <div className="flex items-center gap-3 text-[9px] text-[#666]">
        <span>{elapsedStr}</span>
        <span>${agent.cost.toFixed(4)}</span>
        <div className="flex-1" />
        {agent.status === 'running' && (
          <button
            onClick={() => onKill(agent.id)}
            className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/25 transition-colors border border-red-500/30"
          >
            Kill
          </button>
        )}
        {(agent.status === 'completed' || agent.status === 'failed') && (
          <button
            onClick={() => onRemove(agent.id)}
            className="px-2 py-0.5 rounded bg-[#2a2a2a] text-[#666] hover:text-[#999] transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
