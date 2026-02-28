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

const DESKTOP_BULLETS = [
  'Full visual IDE with Monaco editor',
  'Alfred AI when app is open',
  'Multi-agent protocols (Phoenix, Supreme, Midnight, Sniper)',
  'Voice chat + all tools + terminal',
];

const DAEMON_BULLETS = [
  'Everything in Desktop, plus:',
  'Alfred runs 24/7 in background',
  'Telegram / Discord / Slack / WhatsApp',
  'Overnight tasks + push notifications',
  'Smart device control from anywhere',
  'Auto-starts on boot, survives reboots',
];

export function DownloadSection() {
  const [release, setRelease] = useState<ReleaseResponse | null>(null);
  const [os, setOS] = useState<'windows' | 'macos' | 'linux'>('windows');
  const [daemonGuideOpen, setDaemonGuideOpen] = useState(false);

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

  const osLabel = os === 'windows' ? 'Windows' : os === 'macos' ? 'macOS' : 'Linux';

  return (
    <section id="download" className="relative py-24 px-6">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-px bg-gradient-to-r from-transparent via-[#8b5cf6]/20 to-transparent" />

      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-14">
          <p className="text-sm font-medium text-[#3b82f6] tracking-wide uppercase mb-3">Download</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to build something real?
          </h2>
          <p className="text-[#8888a0] max-w-lg mx-auto">
            Titan is free to download. Bring your own API keys for model access. Choose the Desktop app, or add the Always-On daemon for 24/7 Alfred.
          </p>
        </div>

        {/* Dual-card layout */}
        <div className="grid gap-6 md:grid-cols-2 mb-10">
          {/* Card 1: Desktop */}
          <div className="rounded-2xl border border-[#1f1f35] bg-[#0c0c18]/60 p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-1">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className="text-[#8b5cf6]">
                <path d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <h3 className="text-xl font-bold text-white">Titan Desktop</h3>
            </div>
            <p className="text-sm text-[#8888a0] mb-6">The AI IDE — download and go</p>

            <ul className="space-y-2.5 mb-8 flex-1">
              {DESKTOP_BULLETS.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm text-[#c8c8dc]">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" className="text-[#8b5cf6] mt-0.5 shrink-0">
                    <path d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {b}
                </li>
              ))}
            </ul>

            <button
              onClick={onPrimaryDownload}
              className="w-full rounded-xl bg-gradient-to-r from-[#8b5cf6] to-[#3b82f6] py-3.5 text-sm font-semibold text-white shadow-[0_0_40px_rgba(139,92,246,0.25)] hover:shadow-[0_0_60px_rgba(139,92,246,0.4)] transition-all duration-300 flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {isElectron ? 'Open Titan Editor' : `Download for ${osLabel}`}
            </button>

            <p className="text-center text-xs text-[#5f5f75] mt-3">
              v{release?.version || '0.1.0'} &middot; {release?.channel || 'stable'} &middot; ~138 MB
            </p>

            {/* Platform pills */}
            <div className="flex justify-center gap-2 mt-4">
              {PLATFORMS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setOS(key)}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                    os === key
                      ? 'bg-[#8b5cf6]/20 text-[#c4b5fd] border border-[#8b5cf6]/30'
                      : 'text-[#5f5f75] hover:text-[#8888a0] border border-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Card 2: Daemon */}
          <div className="relative rounded-2xl border border-[#10b981]/30 bg-[#0c0c18] p-8 flex flex-col shadow-[0_0_60px_rgba(16,185,129,0.06)]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#10b981] px-3 py-0.5 text-[10px] font-bold text-[#06060b] uppercase tracking-wider">
              Always-On
            </div>
            <div className="flex items-center gap-3 mb-1">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className="text-[#10b981]">
                <path d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12.75h.007v.008H12v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <h3 className="text-xl font-bold text-white">Titan Always-On</h3>
            </div>
            <p className="text-sm text-[#8888a0] mb-6">Alfred 24/7 — runs in the background</p>

            <ul className="space-y-2.5 mb-8 flex-1">
              {DAEMON_BULLETS.map((b, i) => (
                <li key={b} className={`flex items-start gap-2.5 text-sm ${i === 0 ? 'text-[#8888a0] font-medium' : 'text-[#c8c8dc]'}`}>
                  {i > 0 && (
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" className="text-[#10b981] mt-0.5 shrink-0">
                      <path d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                  {i === 0 && <span className="w-[14px] shrink-0" />}
                  {b}
                </li>
              ))}
            </ul>

            {/* Install command */}
            <div className="rounded-xl bg-[#0a0a14] border border-[#1f1f35] p-4 mb-4">
              <p className="text-[11px] text-[#5f5f75] uppercase tracking-wider mb-2 font-medium">Quick install</p>
              <code className="block text-sm text-[#10b981] font-mono select-all">
                npx titan-daemon@latest install
              </code>
            </div>

            <button
              onClick={() => setDaemonGuideOpen(!daemonGuideOpen)}
              className="w-full rounded-xl bg-gradient-to-r from-[#10b981] to-[#059669] py-3.5 text-sm font-semibold text-white shadow-[0_0_30px_rgba(16,185,129,0.2)] hover:shadow-[0_0_50px_rgba(16,185,129,0.35)] transition-all duration-300 flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              Setup Guide
            </button>
            <p className="text-center text-xs text-[#5f5f75] mt-3">
              Best for: 24/7 AI, phone access, overnight runs, smart home
            </p>
          </div>
        </div>

        {/* Collapsible daemon setup guide */}
        {daemonGuideOpen && (
          <div className="rounded-2xl border border-[#1f1f35] bg-[#0a0a14] p-8 mb-10 animate-in fade-in slide-in-from-top-2 duration-300">
            <h3 className="text-lg font-semibold text-white mb-6">Daemon Setup Guide</h3>

            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full bg-[#10b981]/20 flex items-center justify-center text-xs font-bold text-[#10b981]">1</span>
                  <span className="text-sm font-medium text-white">Install</span>
                </div>
                <div className="space-y-2">
                  <div className="rounded-lg bg-[#0c0c18] border border-[#1f1f35] p-3">
                    <p className="text-[10px] text-[#5f5f75] uppercase mb-1">macOS / Linux</p>
                    <code className="text-xs text-[#10b981] font-mono select-all block">curl -fsSL https://titan.kryonex.com/install.sh | bash</code>
                  </div>
                  <div className="rounded-lg bg-[#0c0c18] border border-[#1f1f35] p-3">
                    <p className="text-[10px] text-[#5f5f75] uppercase mb-1">Windows (PowerShell)</p>
                    <code className="text-xs text-[#10b981] font-mono select-all block">iwr -useb https://titan.kryonex.com/install.ps1 | iex</code>
                  </div>
                  <div className="rounded-lg bg-[#0c0c18] border border-[#1f1f35] p-3">
                    <p className="text-[10px] text-[#5f5f75] uppercase mb-1">npm (Node 22+)</p>
                    <code className="text-xs text-[#10b981] font-mono select-all block">npm i -g titan-daemon@latest && titan-daemon setup</code>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full bg-[#10b981]/20 flex items-center justify-center text-xs font-bold text-[#10b981]">2</span>
                  <span className="text-sm font-medium text-white">Connect Channels</span>
                </div>
                <p className="text-sm text-[#8888a0] leading-relaxed">
                  Run <code className="text-[#10b981]">titan-daemon setup</code> and follow the prompts to connect Telegram, Discord, Slack, or WhatsApp.
                  Alfred will listen for your messages on all connected channels.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full bg-[#10b981]/20 flex items-center justify-center text-xs font-bold text-[#10b981]">3</span>
                  <span className="text-sm font-medium text-white">Alfred is Always On</span>
                </div>
                <p className="text-sm text-[#8888a0] leading-relaxed">
                  The daemon registers as a system service and starts on boot.
                  Message Alfred from your phone, schedule overnight builds, get push notifications when tasks complete.
                </p>
              </div>
            </div>

            <p className="mt-6 text-xs text-[#5f5f75]">
              Requires Node.js 22+ &middot; Works on Windows 10+, macOS 12+, and Linux &middot; ~25 MB installed
            </p>
          </div>
        )}

        {/* SmartScreen notice */}
        <div className="mx-auto max-w-lg rounded-xl border border-[#f59e0b]/20 bg-[#f59e0b]/5 px-5 py-3 text-left">
          <p className="text-xs font-semibold text-[#f59e0b] mb-1">Windows SmartScreen notice</p>
          <p className="text-xs text-[#8888a0] leading-relaxed">
            Windows may show a &ldquo;Windows protected your PC&rdquo; warning because the installer is not yet code-signed.
            Click <span className="text-white font-medium">&ldquo;More info&rdquo;</span> then{' '}
            <span className="text-white font-medium">&ldquo;Run anyway&rdquo;</span> to proceed.
            Code signing is coming in a future release.
          </p>
        </div>

        <div className="mt-6 text-center text-xs text-[#5f5f75]">
          System Requirements: Windows 10+ (x64), 8 GB RAM, 500 MB disk space.
          macOS 12+ and Linux support coming soon.
        </div>
      </div>
    </section>
  );
}
