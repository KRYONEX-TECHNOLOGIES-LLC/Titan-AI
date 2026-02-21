'use client';

import { useEffect, useMemo, useState } from 'react';
import { isElectron } from '@/lib/electron';

type ReleaseResponse = {
  version: string;
  publishedAt: string;
  downloads: {
    windows: { available: boolean; url: string | null };
    macos: { available: boolean; url: string | null };
    linux: { available: boolean; url: string | null };
  };
};

function detectOS(): 'windows' | 'macos' | 'linux' {
  if (typeof navigator === 'undefined') return 'windows';
  const p = navigator.platform.toLowerCase();
  if (p.includes('mac')) return 'macos';
  if (p.includes('linux')) return 'linux';
  return 'windows';
}

const OS_LABELS: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
};

export function Hero() {
  const [release, setRelease] = useState<ReleaseResponse | null>(null);
  const [os, setOS] = useState<'windows' | 'macos' | 'linux'>('windows');

  useEffect(() => {
    setOS(detectOS());
    fetch('/api/releases/latest')
      .then((r) => r.json())
      .then((d: ReleaseResponse) => setRelease(d))
      .catch(() => {});
  }, []);

  const downloadUrl = useMemo(() => {
    if (!release) return null;
    return release.downloads[os]?.url;
  }, [release, os]);

  const onDownload = () => {
    if (isElectron) {
      window.location.href = '/editor';
      return;
    }
    if (downloadUrl) window.location.href = downloadUrl;
  };

  return (
    <section className="relative pt-32 pb-20 overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

      {/* Radial gradient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.12)_0%,rgba(59,130,246,0.06)_40%,transparent_70%)] pointer-events-none" />

      <div className="relative mx-auto max-w-5xl px-6 text-center">
        {/* Badge */}
        <div className="landing-fade-in inline-flex items-center gap-2 rounded-full border border-[#8b5cf6]/20 bg-[#8b5cf6]/5 px-4 py-1.5 text-xs text-[#c4b5fd] mb-8">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#8b5cf6] animate-pulse" />
          Desktop-Only &middot; v{release?.version || '0.1.0'} &middot; Built for Engineers
        </div>

        {/* Headline */}
        <h1 className="landing-fade-in text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.08] tracking-tight">
          <span className="text-white">The AI desktop</span>
          <br />
          <span className="bg-gradient-to-r from-[#8b5cf6] via-[#6d6fff] to-[#3b82f6] bg-clip-text text-transparent">
            built to ship real code.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="landing-fade-in mx-auto mt-6 max-w-2xl text-lg text-[#9898b0] leading-relaxed">
          Titan ships with a full local agent runtime, integrated terminal tooling,
          multi-model orchestration, and a governance protocol that enforces quality before merge.
          No browser limitations. No fake tool calls.
        </p>

        {/* CTAs */}
        <div className="landing-fade-in mt-10 flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={onDownload}
            className="group relative rounded-xl bg-gradient-to-r from-[#8b5cf6] to-[#3b82f6] px-8 py-3.5 text-sm font-semibold text-white shadow-[0_0_40px_rgba(139,92,246,0.3)] hover:shadow-[0_0_60px_rgba(139,92,246,0.45)] transition-all duration-300"
          >
            <span className="relative z-10">
              {isElectron ? 'Open Titan Editor' : `Download for ${OS_LABELS[os]}`}
            </span>
          </button>
          <a
            href="#features"
            className="rounded-xl border border-[#2d2d42] px-8 py-3.5 text-sm text-[#d2d2e2] hover:bg-white/[0.03] hover:border-[#3d3d55] transition-all duration-200"
          >
            See Features
          </a>
        </div>

        {/* Version info */}
        <p className="mt-4 text-xs text-[#5f5f75]">
          Stable {release?.version || '0.1.0'} &middot;{' '}
          {release?.publishedAt
            ? new Date(release.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Available now'}
          {' '}&middot; Windows x64
        </p>
      </div>
    </section>
  );
}
