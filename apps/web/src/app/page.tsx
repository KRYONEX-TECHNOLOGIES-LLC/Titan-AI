'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { isElectron } from '@/lib/electron';

type ReleaseResponse = {
  product: string;
  channel: string;
  version: string;
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

export default function LandingPage() {
  const [release, setRelease] = useState<ReleaseResponse | null>(null);
  const [os, setOS] = useState<'windows' | 'macos' | 'linux'>('windows');

  useEffect(() => {
    setOS(detectOS());
    fetch('/api/releases/latest')
      .then((res) => res.json())
      .then((data: ReleaseResponse) => setRelease(data))
      .catch(() => setRelease(null));
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

  const version = release?.version || '0.1.0';
  const publishedDate = release?.publishedAt
    ? new Date(release.publishedAt).toLocaleDateString()
    : 'Pending';

  return (
    <main className="min-h-screen bg-[#06060b] text-[#e6e6ef]">
      <div className="mx-auto max-w-6xl px-6">
        <header className="flex items-center justify-between py-6 border-b border-[#1f1f30]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#3b82f6] shadow-[0_0_40px_rgba(139,92,246,0.4)]" />
            <div className="font-semibold tracking-wide">Titan Desktop</div>
          </div>
          <div className="flex items-center gap-5 text-sm text-[#b8b8c8]">
            <Link href="#features" className="hover:text-white">Features</Link>
            <Link href="#download" className="hover:text-white">Download</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
          </div>
        </header>

        <section className="py-20 text-center">
          <div className="inline-flex items-center rounded-full border border-[#322a4f] bg-[#171026] px-4 py-1 text-xs text-[#c5b8f5]">
            Desktop-Only Product • Titan Protocol Built-In
          </div>
          <h1 className="mt-6 text-5xl font-semibold leading-tight">
            The AI engineering desktop
            <br />
            built to out-execute everything else.
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg text-[#a7a7b7]">
            Titan Desktop ships with a full local agent runtime, integrated terminal tooling,
            model orchestration, and governance mode. No browser limitations. No fake tool calls.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={onPrimaryDownload}
              className="rounded-xl bg-gradient-to-r from-[#8b5cf6] to-[#3b82f6] px-8 py-3 text-sm font-semibold text-white shadow-[0_0_40px_rgba(59,130,246,0.35)] transition hover:opacity-95"
            >
              {isElectron ? 'Open Titan Editor' : `Download for ${os === 'windows' ? 'Windows' : os === 'macos' ? 'macOS' : 'Linux'}`}
            </button>
            <Link href="/editor" className="rounded-xl border border-[#2d2d42] px-8 py-3 text-sm text-[#d2d2e2] hover:bg-[#11111b]">
              Open Editor Route
            </Link>
          </div>
          <p className="mt-3 text-xs text-[#7f7f90]">
            Stable {version} • Updated {publishedDate}
          </p>
        </section>

        <section id="features" className="grid gap-4 pb-16 md:grid-cols-3">
          {[
            ['Autonomous Tool Execution', 'Run commands, edit files, and orchestrate workflows with real local execution.'],
            ['Titan Protocol Mode', 'Governance-first mode with fail-gates, inspection evidence, and quality enforcement.'],
            ['Production-Grade Desktop UX', 'Integrated terminal, git, model selector, and project memory designed for heavy engineering use.'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-[#232338] bg-[#0e0e17] p-6">
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-[#aaaabb]">{body}</p>
            </div>
          ))}
        </section>

        <section id="download" className="rounded-2xl border border-[#232338] bg-[#0d0d16] p-8 mb-16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">Download Titan Desktop</h2>
              <p className="mt-2 text-sm text-[#9d9db0]">
                Windows is live first. macOS and Linux channels are staged behind release readiness.
              </p>
            </div>
            <div className="text-xs text-[#7d7d90]">Channel: {release?.channel || 'stable'}</div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {([
              ['windows', 'Windows x64'],
              ['macos', 'macOS'],
              ['linux', 'Linux'],
            ] as const).map(([key, label]) => {
              const entry = release?.downloads[key];
              const available = Boolean(entry?.available && entry.url);
              return (
                <div key={key} className="rounded-xl border border-[#26263e] bg-[#11111b] p-4">
                  <div className="text-sm font-medium">{label}</div>
                  <div className={`mt-1 text-xs ${available ? 'text-[#54c17a]' : 'text-[#8a8a9a]'}`}>
                    {available ? 'Available' : 'Coming Soon'}
                  </div>
                  {available ? (
                    <div className="mt-4 space-y-2">
                      <a className="block text-sm text-[#cbd5ff] hover:text-white" href={entry?.url || '#'}>Download installer</a>
                      <a className="block text-xs text-[#9ea8d7] hover:text-white" href={entry?.checksumUrl || '#'}>Checksums</a>
                      <a className="block text-xs text-[#9ea8d7] hover:text-white" href={entry?.releaseNotesUrl || '#'}>Release notes</a>
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-[#7f7f90]">Queued for next release phase.</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
