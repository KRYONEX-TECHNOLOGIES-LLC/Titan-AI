'use client';

import { useEffect, useMemo, useState } from 'react';
import { isElectron } from '@/lib/electron';

type ReleaseResponse = {
  version: string;
  channel: string;
  publishedAt: string;
  downloads: {
    windows: { available: boolean; url: string | null; checksumUrl: string | null; releaseNotesUrl: string | null };
    macos: { available: boolean; url: string | null; checksumUrl: string | null; releaseNotesUrl: string | null };
    linux: { available: boolean; url: string | null; checksumUrl: string | null; releaseNotesUrl: string | null };
  };
};

function detectOS(): 'windows' | 'macos' | 'linux' {
  if (typeof navigator === 'undefined') return 'windows';
  const p = navigator.platform.toLowerCase();
  if (p.includes('mac')) return 'macos';
  if (p.includes('linux')) return 'linux';
  return 'windows';
}

const PLATFORMS: { key: 'windows' | 'macos' | 'linux'; label: string; arch: string }[] = [
  { key: 'windows', label: 'Windows', arch: 'x64' },
  { key: 'macos', label: 'macOS', arch: 'Universal' },
  { key: 'linux', label: 'Linux', arch: 'x64' },
];

export function DownloadSection() {
  const [release, setRelease] = useState<ReleaseResponse | null>(null);
  const [os, setOS] = useState<'windows' | 'macos' | 'linux'>('windows');

  useEffect(() => {
    setOS(detectOS());
    fetch('/api/releases/latest')
      .then((r) => r.json())
      .then((d: ReleaseResponse) => setRelease(d))
      .catch(() => {});
  }, []);

  const primary = useMemo(() => {
    if (!release) return null;
    return release.downloads[os];
  }, [release, os]);

  const onPrimaryDownload = () => {
    if (isElectron) {
      window.location.href = '/editor';
      return;
    }
    if (primary?.url) window.location.href = primary.url;
  };

  return (
    <section id="download" className="relative py-24 px-6">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-px bg-gradient-to-r from-transparent via-[#8b5cf6]/20 to-transparent" />

      <div className="mx-auto max-w-4xl text-center">
        <p className="text-sm font-medium text-[#3b82f6] tracking-wide uppercase mb-3">Download</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          Ready to build something real?
        </h2>
        <p className="text-[#8888a0] mb-10 max-w-lg mx-auto">
          Titan Desktop is free to download. Bring your own API keys for model access.
        </p>

        {/* Primary CTA */}
        <button
          onClick={onPrimaryDownload}
          className="inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-[#8b5cf6] to-[#3b82f6] px-10 py-4 text-base font-semibold text-white shadow-[0_0_50px_rgba(139,92,246,0.3)] hover:shadow-[0_0_70px_rgba(139,92,246,0.45)] transition-all duration-300 mb-4"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {isElectron
            ? 'Open Titan Editor'
            : `Download for ${os === 'windows' ? 'Windows' : os === 'macos' ? 'macOS' : 'Linux'}`}
        </button>
        <p className="text-xs text-[#5f5f75] mb-12">
          v{release?.version || '0.1.0'} &middot; {release?.channel || 'stable'} channel &middot; ~120 MB
        </p>

        {/* Platform cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {PLATFORMS.map(({ key, label, arch }) => {
            const entry = release?.downloads[key];
            const available = Boolean(entry?.available && entry?.url);
            return (
              <div
                key={key}
                className={`rounded-2xl border p-6 text-left transition-all duration-200 ${
                  available
                    ? 'border-[#8b5cf6]/30 bg-[#0c0c18]'
                    : 'border-[#1f1f35] bg-[#0c0c18]/50'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-white">{label}</span>
                  <span className="text-[10px] text-[#5f5f75] uppercase">{arch}</span>
                </div>
                <div className={`text-xs font-medium mb-4 ${available ? 'text-[#10b981]' : 'text-[#5f5f75]'}`}>
                  {available ? 'Available' : 'Coming Soon'}
                </div>
                {available ? (
                  <div className="space-y-2">
                    <a
                      href={entry?.url || '#'}
                      className="block text-sm text-[#c4b5fd] hover:text-white transition-colors"
                    >
                      Download installer
                    </a>
                    {entry?.checksumUrl && (
                      <a href={entry.checksumUrl} className="block text-xs text-[#5f5f75] hover:text-[#8888a0] transition-colors">
                        Verify checksums
                      </a>
                    )}
                    {entry?.releaseNotesUrl && (
                      <a href={entry.releaseNotesUrl} className="block text-xs text-[#5f5f75] hover:text-[#8888a0] transition-colors">
                        Release notes
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[#5f5f75]">Queued for next release phase.</p>
                )}
              </div>
            );
          })}
        </div>

        {/* System requirements */}
        <div className="mt-10 text-xs text-[#5f5f75]">
          System Requirements: Windows 10+ (x64), 8 GB RAM, 500 MB disk space.
          macOS 12+ and Linux support coming soon.
        </div>
      </div>
    </section>
  );
}
