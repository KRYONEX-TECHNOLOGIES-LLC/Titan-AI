'use client';

import React from 'react';
import { useAlfredCanvas } from '@/stores/alfred-canvas-store';

export function ScreenView() {
  const { content, stats, workflows } = useAlfredCanvas();

  if (!content || content.type !== 'screen') {
    return <ScreenIdle stats={stats} workflows={workflows} />;
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      {content.title && (
        <div className="px-3 py-1.5 border-b border-[#2a2a2a] flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[11px] text-[#ccc] truncate">{content.title}</span>
          {content.meta?.url ? (
            <span className="text-[9px] text-[#555] truncate ml-auto">{String(content.meta.url)}</span>
          ) : null}
        </div>
      )}
      <div className="flex-1 overflow-auto p-4">
        <div className="prose prose-invert prose-sm max-w-none text-[12px] leading-relaxed whitespace-pre-wrap">
          {content.data}
        </div>
      </div>
    </div>
  );
}

function ScreenIdle({ stats, workflows }: {
  stats: { totalTasks: number; completedTasks: number; successRate: number; totalCost: number; activeAgents: number };
  workflows: Array<{ id: string; name: string; status: string; startedAt: number; progress: number }>;
}) {
  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      {/* Ambient header */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        {/* Animated orb */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-600/30 flex items-center justify-center animate-pulse">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 opacity-60" />
            </div>
          </div>
          <div className="absolute inset-0 rounded-full border border-cyan-500/10 animate-ping" style={{ animationDuration: '3s' }} />
        </div>

        <h2 className="text-[15px] font-semibold text-white mb-1">Alfred is ready</h2>
        <p className="text-[11px] text-[#808080] text-center max-w-[300px]">
          Say &quot;Alfred&quot; or type a command. The canvas will show what Alfred is doing in real time.
        </p>

        {/* Stats cards */}
        <div className="grid grid-cols-4 gap-3 mt-8 w-full max-w-[500px]">
          <StatCard label="Tasks" value={stats.totalTasks} />
          <StatCard label="Completed" value={stats.completedTasks} />
          <StatCard label="Success" value={`${stats.successRate}%`} />
          <StatCard label="Agents" value={stats.activeAgents} />
        </div>
      </div>

      {/* Recent workflows */}
      {workflows.length > 0 && (
        <div className="border-t border-[#2a2a2a] px-4 py-3 max-h-[200px] overflow-y-auto">
          <div className="text-[10px] text-[#555] mb-2 font-medium">Active Workflows</div>
          {workflows.slice(0, 8).map((wf) => (
            <div key={wf.id} className="flex items-center gap-2 py-1.5 border-b border-[#1a1a1a] last:border-0">
              <div className={`w-1.5 h-1.5 rounded-full ${
                wf.status === 'running' ? 'bg-green-500 animate-pulse' :
                wf.status === 'complete' ? 'bg-blue-500' :
                wf.status === 'failed' ? 'bg-red-500' : 'bg-[#555]'
              }`} />
              <span className="text-[11px] text-[#ccc] flex-1 truncate">{wf.name}</span>
              <span className="text-[9px] text-[#666]">{wf.progress}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-center">
      <div className="text-[16px] font-bold text-white">{value}</div>
      <div className="text-[9px] text-[#666] uppercase tracking-wider">{label}</div>
    </div>
  );
}
