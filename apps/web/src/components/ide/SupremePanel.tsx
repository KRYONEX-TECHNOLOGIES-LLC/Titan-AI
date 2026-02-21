'use client';

import { useMemo } from 'react';
import { useLaneStore, LANE_STATUS_COLORS, LANE_STATUS_LABELS } from '@/stores/lane-store';

export default function SupremePanel() {
  const lanesMap = useLaneStore((s) => s.lanes);
  const eventLog = useLaneStore((s) => s.eventLog);
  const stats = useLaneStore((s) => s.getStats());

  const lanes = useMemo(() => Array.from(lanesMap.values()), [lanesMap]);

  const latestBudgetEvent = [...eventLog].reverse().find((e) => e.type === 'budget_update');
  const latestStallEvent = [...eventLog].reverse().find((e) => e.type === 'stall_warning');
  const debateEvents = eventLog.filter((e) => e.type === 'debate_verdict').slice(-5);
  const consensusEvents = eventLog.filter((e) => e.type === 'consensus_vote').slice(-5);

  const perRequestUsed = Number(latestBudgetEvent?.data?.perRequestUsed || 0);
  const perRequestLimit = Number(latestBudgetEvent?.data?.perRequestLimit || 1);
  const percent = Math.max(0, Math.min(100, Math.round((perRequestUsed / perRequestLimit) * 100)));

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      <div className="px-3 py-2 border-b border-[#3c3c3c]">
        <div className="text-[12px] font-semibold text-[#e0e0e0]">Titan Supreme Protocol</div>
        <div className="text-[11px] text-[#808080] mt-1">
          {stats.merged}/{stats.total} merged • {stats.failed} failed • {stats.percentComplete}% complete
        </div>
      </div>

      <div className="px-3 py-2 border-b border-[#3c3c3c]">
        <div className="text-[11px] text-[#cccccc] mb-1">Token Budget</div>
        <div className="w-full h-2 rounded bg-[#2d2d2d] overflow-hidden">
          <div className="h-full bg-[#569cd6]" style={{ width: `${percent}%` }} />
        </div>
        <div className="text-[10px] text-[#808080] mt-1">
          {perRequestUsed.toLocaleString()} / {perRequestLimit.toLocaleString()} tokens
        </div>
      </div>

      <div className="px-3 py-2 border-b border-[#3c3c3c]">
        <div className="text-[11px] text-[#cccccc] mb-1">Step Budget</div>
        <div className="text-[10px] text-[#808080]">
          {latestStallEvent
            ? `${String(latestStallEvent.data.totalSteps || 0)} steps • warning at ${String(latestStallEvent.data.warningThreshold || 70)}`
            : 'No stall warnings'}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
        <Section title="Lane Status">
          {lanes.length === 0 ? (
            <Empty text="No active lanes" />
          ) : lanes.map((lane) => (
            <div key={lane.lane_id} className="rounded border border-[#3c3c3c] p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-[#e0e0e0] truncate">{lane.title || lane.subtask_node_id}</div>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: `${LANE_STATUS_COLORS[lane.status]}22`, color: LANE_STATUS_COLORS[lane.status] }}
                >
                  {LANE_STATUS_LABELS[lane.status]}
                </span>
              </div>
              <div className="text-[10px] text-[#808080] mt-1 truncate">
                Worker: {lane.worker_model_id || 'n/a'}
              </div>
            </div>
          ))}
        </Section>

        <Section title="Debate Results">
          {debateEvents.length === 0 ? <Empty text="No debates yet" /> : debateEvents.map((evt, idx) => (
            <div key={`${evt.timestamp}-${idx}`} className="text-[10px] text-[#cccccc]">
              {String(evt.data.nodeId || 'node')}: {String(evt.data.winner || 'n/a')}
            </div>
          ))}
        </Section>

        <Section title="Consensus Votes">
          {consensusEvents.length === 0 ? <Empty text="No consensus events yet" /> : consensusEvents.map((evt, idx) => (
            <div key={`${evt.timestamp}-${idx}`} className="text-[10px] text-[#cccccc]">
              {String(evt.data.nodeId || 'node')}: {String(evt.data.vote || evt.data.status || 'recorded')}
            </div>
          ))}
        </Section>

        <Section title="Overseer Log">
          {eventLog.length === 0 ? <Empty text="No events yet" /> : eventLog.slice(-12).reverse().map((evt, idx) => (
            <div key={`${evt.timestamp}-${idx}`} className="text-[10px] text-[#808080]">
              [{new Date(evt.timestamp).toLocaleTimeString()}] {evt.type}
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-[#2d2d2d] p-2">
      <div className="text-[11px] text-[#e0e0e0] mb-1">{title}</div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-[10px] text-[#666]">{text}</div>;
}
