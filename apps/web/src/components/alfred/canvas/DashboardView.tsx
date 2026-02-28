'use client';

import React from 'react';
import { useAlfredCanvas } from '@/stores/alfred-canvas-store';

export function DashboardView() {
  const { stats, workflows, sessions } = useAlfredCanvas();

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2a2a2a]">
        <h2 className="text-[14px] font-semibold text-white">Alfred Dashboard</h2>
        <p className="text-[10px] text-[#666]">Performance overview and active workflows</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 py-4">
        <DashCard label="Total Tasks" value={stats.totalTasks} color="#22d3ee" />
        <DashCard label="Completed" value={stats.completedTasks} color="#22c55e" />
        <DashCard label="Success Rate" value={`${stats.successRate}%`} color={stats.successRate >= 90 ? '#22c55e' : stats.successRate >= 70 ? '#f59e0b' : '#ef4444'} />
        <DashCard label="Estimated Cost" value={`$${stats.totalCost.toFixed(4)}`} color="#a78bfa" />
      </div>

      {/* Active sessions */}
      <div className="px-4 py-2">
        <h3 className="text-[11px] font-medium text-[#999] uppercase tracking-wider mb-2">Active Sessions</h3>
        <div className="space-y-1.5">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-2 py-2 px-3 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a]">
              <div className={`w-2 h-2 rounded-full ${s.status === 'active' ? 'bg-green-500 animate-pulse' : s.status === 'complete' ? 'bg-blue-500' : 'bg-[#555]'}`} />
              <span className="text-[11px] text-white flex-1">{s.name}</span>
              <span className="text-[10px] text-[#666]">{s.status}</span>
              {s.taskCount > 0 && (
                <div className="flex items-center gap-1">
                  <div className="w-[60px] h-[4px] bg-[#2a2a2a] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full transition-all"
                      style={{ width: `${(s.completedCount / s.taskCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-[#666]">{s.completedCount}/{s.taskCount}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Workflows */}
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

function DashCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-3">
      <div className="text-[20px] font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] text-[#666] mt-0.5">{label}</div>
    </div>
  );
}
