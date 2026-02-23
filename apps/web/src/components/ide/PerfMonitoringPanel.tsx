'use client';

import { usePerfStore } from '@/stores/perf-store';

export default function PerfMonitoringPanel() {
  const { cpuUsage, memoryUsage, fileEvents } = usePerfStore();

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      <div className="px-3 py-2 border-b border-[#3c3c3c]">
        <div className="text-[12px] font-semibold text-[#e0e0e0]">Performance Monitoring</div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
        <Section title="CPU Usage">
          <div className="text-[24px] text-white">{cpuUsage.toFixed(2)}%</div>
        </Section>

        <Section title="Memory Usage">
          <div className="text-[24px] text-white">{memoryUsage.toFixed(2)} MB</div>
        </Section>

        <Section title="File Events">
          <div className="text-[24px] text-white">{fileEvents}</div>
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
