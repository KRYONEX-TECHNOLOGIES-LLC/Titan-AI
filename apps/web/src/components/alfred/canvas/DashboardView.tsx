'use client';

import React, { useMemo, useState } from 'react';
import { useAlfredCanvas, type AgentInfo } from '@/stores/alfred-canvas-store';

type FilterTab = 'all' | 'running' | 'completed' | 'failed';

export function DashboardView() {
  const { stats, workflows, agents, removeAgent, updateAgent } = useAlfredCanvas();
  const [filter, setFilter] = useState<FilterTab>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return agents;
    return agents.filter((a) => a.status === filter);
  }, [agents, filter]);

  const counts = useMemo(() => {
    const running = agents.filter((a) => a.status === 'running').length;
    const completed = agents.filter((a) => a.status === 'completed').length;
    const failed = agents.filter((a) => a.status === 'failed').length;
    const totalCost = agents.reduce((s, a) => s + a.cost, 0);
    return { total: agents.length, running, completed, failed, totalCost };
  }, [agents]);

  const handleKill = (id: string) => {
    updateAgent(id, { status: 'failed', completedAt: Date.now(), output: 'Killed by user' });
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2a2a2a]">
        <h2 className="text-[14px] font-semibold text-white">Alfred Dashboard</h2>
        <p className="text-[10px] text-[#666]">Agent overview, workflows &amp; cost tracking</p>
      </div>

      {/* Stats summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 px-4 py-4">
        <DashCard label="Total Agents" value={counts.total} color="#22d3ee" />
        <DashCard label="Running" value={counts.running} color="#22c55e" />
        <DashCard label="Completed" value={counts.completed} color="#3b82f6" />
        <DashCard label="Failed" value={counts.failed} color="#ef4444" />
        <DashCard label="Total Cost" value={`$${counts.totalCost.toFixed(4)}`} color="#a78bfa" />
      </div>

      {/* Legacy stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 px-4 pb-3">
        <DashCard label="Total Tasks" value={stats.totalTasks} color="#22d3ee" />
        <DashCard label="Completed Tasks" value={stats.completedTasks} color="#22c55e" />
        <DashCard
          label="Success Rate"
          value={`${stats.successRate}%`}
          color={stats.successRate >= 90 ? '#22c55e' : stats.successRate >= 70 ? '#f59e0b' : '#ef4444'}
        />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-4 pb-2">
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
      {/* Top row: name + status badge */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
        <span className="text-[12px] font-medium text-white flex-1 truncate">{agent.name}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${cfg.badge}`}>{cfg.label}</span>
      </div>

      {/* Task description */}
      <p className="text-[10px] text-[#888] leading-tight line-clamp-2">{agent.task}</p>

      {/* Progress bar */}
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

      {/* Meta row: elapsed, cost, actions */}
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

function DashCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-3">
      <div className="text-[20px] font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] text-[#666] mt-0.5">{label}</div>
    </div>
  );
}
