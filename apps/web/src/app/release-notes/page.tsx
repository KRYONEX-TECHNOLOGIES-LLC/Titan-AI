import Link from 'next/link';

const RELEASES = [
  {
    version: 'v0.1.0',
    date: 'February 2026',
    title: 'Initial Release',
    changes: [
      'Desktop app becomes the canonical runtime, loading the /editor product route.',
      'Full local agent runtime with real tool execution (file edit, terminal, git).',
      'Multi-model selector: OpenRouter, LiteLLM, and BYOK support.',
      'Titan Protocol governance mode with Supervisor, Coder, and Ruthless Verifier agents.',
      'Titan Protocol v2 (Parallel Lanes) with multi-agent DAG orchestration.',
      'Integrated PTY terminal, git panel, file explorer, and Monaco editor.',
      'Web root replaced with landing page and download funnel.',
      'Release metadata endpoint for versioned installer links.',
    ],
  },
];

export default function ReleaseNotesPage() {
  return (
    <main className="min-h-screen bg-[#06060b] text-[#e6e6ef]">
      {/* Nav */}
      <nav className="border-b border-[#1f1f35]">
        <div className="mx-auto max-w-3xl px-6 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#3b82f6]" />
            <span className="text-sm font-semibold text-white">Titan AI</span>
          </Link>
          <Link href="/" className="text-xs text-[#8888a0] hover:text-white transition-colors">
            Back to home
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold text-white mb-2">Release Notes</h1>
        <p className="text-xs text-[#5f5f75] mb-10">Titan Desktop changelog</p>

        <div className="space-y-10">
          {RELEASES.map((release) => (
            <div key={release.version}>
              <div className="flex items-center gap-3 mb-4">
                <span className="inline-flex items-center rounded-lg bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 px-3 py-1 text-sm font-semibold text-[#c4b5fd]">
                  {release.version}
                </span>
                <span className="text-xs text-[#5f5f75]">{release.date}</span>
              </div>
              <h2 className="text-lg font-semibold text-white mb-3">{release.title}</h2>
              <ul className="space-y-2">
                {release.changes.map((change) => (
                  <li key={change} className="flex items-start gap-3 text-sm text-[#a0a0b8]">
                    <svg className="mt-1 shrink-0 text-[#8b5cf6]" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1f1f35]">
        <div className="mx-auto max-w-3xl px-6 py-6 flex items-center justify-between text-xs text-[#5f5f75]">
          <span>&copy; {new Date().getFullYear()} KRYONEX TECHNOLOGIES LLC</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
