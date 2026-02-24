'use client';

import type { ReactNode } from 'react';

type CardTone = 'cyan' | 'purple' | 'green' | 'amber' | 'red' | 'neutral';

const toneMap: Record<CardTone, { border: string; glow: string; title: string }> = {
  cyan: { border: 'border-cyan-500/40', glow: 'shadow-[0_0_24px_rgba(34,211,238,0.12)]', title: 'text-cyan-300' },
  purple: { border: 'border-violet-500/40', glow: 'shadow-[0_0_24px_rgba(139,92,246,0.12)]', title: 'text-violet-300' },
  green: { border: 'border-emerald-500/40', glow: 'shadow-[0_0_24px_rgba(16,185,129,0.12)]', title: 'text-emerald-300' },
  amber: { border: 'border-amber-500/40', glow: 'shadow-[0_0_24px_rgba(245,158,11,0.12)]', title: 'text-amber-300' },
  red: { border: 'border-red-500/40', glow: 'shadow-[0_0_24px_rgba(239,68,68,0.12)]', title: 'text-red-300' },
  neutral: { border: 'border-slate-500/30', glow: 'shadow-[0_0_24px_rgba(100,116,139,0.1)]', title: 'text-slate-200' },
};

export function HudCard({
  title,
  tone = 'cyan',
  actions,
  children,
  className = '',
}: {
  title: string;
  tone?: CardTone;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const toneStyles = toneMap[tone];
  return (
    <section className={`relative rounded-xl border bg-[#0d1322]/85 backdrop-blur-sm ${toneStyles.border} ${toneStyles.glow} ${className}`}>
      <ScanlineOverlay />
      <div className="relative z-10 border-b border-white/10 px-3 py-2 flex items-center justify-between">
        <h3 className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${toneStyles.title}`}>{title}</h3>
        {actions}
      </div>
      <div className="relative z-10 p-3">{children}</div>
    </section>
  );
}

export function HudHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="relative rounded-xl border border-cyan-500/30 bg-[linear-gradient(135deg,#0b1222_0%,#101a32_55%,#1a1232_100%)] shadow-[0_0_30px_rgba(34,211,238,0.15)] p-4 overflow-hidden">
      <div className="absolute inset-0 opacity-20 pointer-events-none [background-image:linear-gradient(rgba(34,211,238,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.2)_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/90">Titan Interface</div>
          <h2 className="mt-1 text-[18px] font-semibold text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-[12px] text-slate-300">{subtitle}</p> : null}
        </div>
        {right}
      </div>
    </div>
  );
}

export function HudButton({
  children,
  onClick,
  tone = 'cyan',
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: CardTone;
  disabled?: boolean;
  className?: string;
}) {
  const toneClasses: Record<CardTone, string> = {
    cyan: 'border-cyan-400/60 text-cyan-200 hover:bg-cyan-500/10',
    purple: 'border-violet-400/60 text-violet-200 hover:bg-violet-500/10',
    green: 'border-emerald-400/60 text-emerald-200 hover:bg-emerald-500/10',
    amber: 'border-amber-400/60 text-amber-200 hover:bg-amber-500/10',
    red: 'border-red-400/60 text-red-200 hover:bg-red-500/10',
    neutral: 'border-slate-400/50 text-slate-200 hover:bg-slate-500/10',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-md border text-[12px] font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${toneClasses[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function HudGauge({
  label,
  value,
  max = 100,
  tone = 'cyan',
}: {
  label: string;
  value: number;
  max?: number;
  tone?: CardTone;
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  const bar = tone === 'green'
    ? 'from-emerald-400 to-cyan-400'
    : tone === 'purple'
      ? 'from-violet-400 to-cyan-400'
      : tone === 'amber'
        ? 'from-amber-300 to-orange-400'
        : tone === 'red'
          ? 'from-red-400 to-pink-500'
          : 'from-cyan-400 to-sky-400';
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
        <span>{label}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-900/90 border border-white/10 overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function HudTerminal({
  lines,
  title,
}: {
  lines: Array<{ ts?: string; text: string; level?: 'info' | 'warn' | 'error' | 'success' }>;
  title?: string;
}) {
  return (
    <div className="rounded-lg border border-cyan-500/20 bg-[#060b16] overflow-hidden">
      {title ? <div className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-300 border-b border-white/10">{title}</div> : null}
      <div className="max-h-52 overflow-auto px-2 py-2 font-mono text-[11px] space-y-1">
        {lines.length === 0 ? <div className="text-slate-500">No stream activity</div> : null}
        {lines.map((line, idx) => (
          <div key={`${line.ts || ''}-${idx}`} className="text-slate-300">
            <span className="text-slate-500 mr-2">{line.ts || '--:--:--'}</span>
            <span className={line.level === 'error' ? 'text-red-300' : line.level === 'warn' ? 'text-amber-300' : line.level === 'success' ? 'text-emerald-300' : 'text-slate-300'}>
              {line.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnimatedCounter({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-[#0a1224]/70 px-2 py-1">
      <div className="text-[10px] uppercase tracking-[0.15em] text-slate-400">{label}</div>
      <div className="text-[16px] font-semibold text-cyan-200">{value}</div>
    </div>
  );
}

export function PulsingDot({
  tone = 'green',
}: {
  tone?: CardTone;
}) {
  const cls = tone === 'green'
    ? 'bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.7)]'
    : tone === 'amber'
      ? 'bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.7)]'
      : tone === 'red'
        ? 'bg-red-400 shadow-[0_0_10px_rgba(239,68,68,0.7)]'
        : tone === 'purple'
          ? 'bg-violet-400 shadow-[0_0_10px_rgba(139,92,246,0.7)]'
          : 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)]';
  return <span className={`inline-block w-2 h-2 rounded-full animate-pulse ${cls}`} />;
}

export function ScanlineOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(transparent,transparent_2px,rgba(255,255,255,.15)_3px)] [background-size:100%_4px]" />
  );
}
